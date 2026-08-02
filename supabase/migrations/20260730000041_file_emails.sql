-- 0041 — File d'attente des emails transactionnels (étape 15)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ UN ÉCHEC D'ENVOI NE DOIT JAMAIS ANNULER LE FAIT MÉTIER QUI L'A DÉCLENCHÉ. │
-- │                                                                            │
-- │ Une commande payée dont l'email de confirmation échoue reste payée, et les │
-- │ droits restent octroyés. Le client a payé : le serveur de messagerie n'a    │
-- │ pas voix au chapitre.                                                      │
-- │                                                                            │
-- │ La tentation est d'envoyer l'email dans le gestionnaire de webhooks, juste │
-- │ après l'octroi. Deux façons de se tromper, symétriques :                    │
-- │                                                                            │
-- │   * envoyer DANS la transaction — l'échec d'envoi annule l'octroi ;         │
-- │   * envoyer APRÈS, sans trace — un serveur qui redémarre entre le commit    │
-- │     et l'envoi perd l'email sans que rien ne le signale.                    │
-- │                                                                            │
-- │ D'où le motif de la BOÎTE D'ENVOI (outbox) : la demande d'email est écrite  │
-- │ DANS la transaction métier — donc atomique avec elle — et l'envoi lui-même  │
-- │ a lieu APRÈS le commit, en lisant cette table.                             │
-- │                                                                            │
-- │ Un email est ainsi programmé SI ET SEULEMENT SI le fait métier a eu lieu,   │
-- │ et sa perte est impossible : la ligne reste en attente jusqu'à l'envoi.     │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ L'IDEMPOTENCE PORTE SUR L'ÉVÉNEMENT, PAS SUR L'ENVOI.                     │
-- │                                                                            │
-- │ Un webhook rejoué ne doit pas produire un second email. La clé n'est donc   │
-- │ pas « ai-je déjà envoyé ce message ? » — question à laquelle on répond      │
-- │ après coup, et mal — mais « cet ÉVÉNEMENT a-t-il déjà programmé son         │
-- │ email ? », question tranchée par une contrainte d'unicité au moment de      │
-- │ l'écriture.                                                                │
-- │                                                                            │
-- │ La différence se voit sur le rejeu : avec une clé d'envoi, deux insertions  │
-- │ concurrentes passent toutes deux le contrôle avant que l'une n'écrive. Avec │
-- │ une clé d'événement, la base refuse la seconde.                            │
-- └────────────────────────────────────────────────────────────────────────────┘

create type public.email_statut as enum ('en_attente', 'envoye', 'echoue');

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),

  -- LA CLÉ D'IDEMPOTENCE. Construite à partir de l'ÉVÉNEMENT déclencheur —
  -- identifiant de webhook, de commande, d'abonnement — et jamais d'un
  -- horodatage ou d'un aléa, qui la rendraient différente à chaque rejeu.
  cle_idempotence text not null unique,

  modele text not null,
  destinataire text not null,
  langue text not null check (langue in ('fr', 'en')),

  -- Les données du modèle, sans contenu sensible : voir la note sur le contenu
  -- minimal dans `src/domain/emails/`.
  variables jsonb not null default '{}'::jsonb,

  user_id uuid references public.users (id) on delete set null,

  statut public.email_statut not null default 'en_attente',
  tentatives integer not null default 0 check (tentatives >= 0),
  derniere_erreur text,

  cree_le timestamptz not null default public.app_now(),
  envoye_le timestamptz
);

comment on table public.email_outbox is
  'Boite d''envoi transactionnelle. La demande est ecrite DANS la transaction metier — donc atomique avec elle — et l''envoi a lieu APRES le commit. Un echec d''envoi n''annule jamais le fait metier.';
comment on column public.email_outbox.cle_idempotence is
  'Derivee de l''EVENEMENT declencheur, jamais de l''envoi. Un webhook rejoue retrouve la meme cle et l''unicite refuse la seconde ecriture.';

create index email_outbox_en_attente_idx
  on public.email_outbox (cree_le) where statut = 'en_attente';

alter table public.email_outbox enable row level security;

-- Aucun accès client : la file nomme des destinataires et des faits d'achat.
create policy email_outbox_aucun_acces_client on public.email_outbox
  for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Programmation d'un email
--
-- `security definer` : appelée DEPUIS les fonctions métier (`fulfill_order`,
-- les gestionnaires d'abonnement), qui tournent dans la transaction du webhook.
-- ---------------------------------------------------------------------------

create function public.programmer_email(
  p_cle text,
  p_modele text,
  p_user_id uuid,
  p_variables jsonb default '{}'::jsonb
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_email text;
  v_langue text;
  v_statut public.user_status;
begin
  select u.email, u.langue_preferee, u.statut
    into v_email, v_langue, v_statut
  from public.users u where u.id = p_user_id;

  if not found then
    -- Pas de destinataire, pas d'email — et surtout pas d'exception : nous
    -- sommes dans la transaction métier, et la faire échouer ici reviendrait
    -- à annuler un octroi de droits pour un défaut d'adresse.
    return null;
  end if;

  -- Un compte ANONYMISÉ ne reçoit plus rien : son adresse est un jeton
  -- irréversible (@anonymise.invalid), et lui écrire n'aurait aucun sens.
  if v_statut = 'anonymise' then
    return null;
  end if;

  insert into public.email_outbox
    (cle_idempotence, modele, destinataire, langue, variables, user_id)
  values
    (p_cle, p_modele, v_email, coalesce(v_langue, 'fr'), p_variables, p_user_id)
  -- LE REJEU EST ABSORBÉ ICI, par la base et non par une lecture préalable.
  on conflict (cle_idempotence) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.programmer_email(text, text, uuid, jsonb) is
  'Programme un email DANS la transaction metier. Ne leve jamais : un defaut d''adresse ne doit pas annuler un octroi de droits. Le rejeu est absorbe par l''unicite de la cle.';

revoke all on function public.programmer_email(text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.programmer_email(text, text, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Lecture et marquage par le videur de file
-- ---------------------------------------------------------------------------

create function public.emails_a_envoyer(p_limite integer default 50)
  returns table (
    id uuid,
    modele text,
    destinataire text,
    langue text,
    variables jsonb,
    user_id uuid
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select o.id, o.modele, o.destinataire, o.langue, o.variables, o.user_id
  from public.email_outbox o
  where o.statut = 'en_attente'
  order by o.cree_le
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

revoke all on function public.emails_a_envoyer(integer) from public, anon, authenticated;
grant execute on function public.emails_a_envoyer(integer) to service_role;

create function public.marquer_email(
  p_id uuid,
  p_envoye boolean,
  p_erreur text default null
)
  returns void
  language sql
  security definer
  set search_path = public, pg_temp
as $$
  update public.email_outbox
  set statut = case when p_envoye then 'envoye'::public.email_statut
                    else 'echoue'::public.email_statut end,
      tentatives = tentatives + 1,
      derniere_erreur = p_erreur,
      envoye_le = case when p_envoye then public.app_now() else envoye_le end
  where id = p_id;
$$;

revoke all on function public.marquer_email(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.marquer_email(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- Branchement sur les faits métier
--
-- `fulfill_order` programme la confirmation DANS sa transaction. La clé dérive
-- de la COMMANDE : un webhook rejoué appelle `fulfill_order`, qui constate que
-- la commande est déjà payée — mais même s'il allait plus loin, la clé serait
-- la même et l'unicité refuserait la seconde ligne.
-- ---------------------------------------------------------------------------

create or replace function public.fulfill_order(
  p_order_id uuid,
  p_reference_paiement text default null,
  p_webhook_event_id uuid default null
) returns table (deja_traite boolean, nb_droits integer)
language plpgsql
as $$
declare
  v_order public.orders%rowtype;
  v_nb integer := 0;
begin
  -- Verrou de ligne AVANT toute lecture d'état. Sans lui, deux webhooks
  -- concurrents liraient tous deux `en_attente` et tenteraient tous deux
  -- l'octroi. Le second attend ici, puis constate que la commande est déjà
  -- payée et ne fait rien.
  --
  -- Ce verrou est la protection NORMALE. L'index unique de `entitlements` reste
  -- la dernière ligne de défense (docs/PLAN.md D1 point 8) : il tient même si
  -- ce verrou venait à être contourné ou retiré.
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande introuvable : %', p_order_id
      using errcode = 'no_data_found';
  end if;

  -- Idempotence : un rejeu de webhook retrouve la commande déjà payée et
  -- ressort sans rien réécrire. Ce n'est PAS une erreur — un prestataire réel
  -- réémet ses événements tant qu'il n'a pas reçu un 200.
  if v_order.statut = 'paye' then
    return query select true, 0;
    return;
  end if;

  -- Une commande remboursée ou échouée ne se paie pas après coup : l'événement
  -- arrive dans le désordre, ou concerne un état que l'on a déjà tranché.
  if v_order.statut <> 'en_attente' then
    raise exception 'Commande % dans l''état % : octroi refusé.', p_order_id, v_order.statut
      using errcode = 'check_violation';
  end if;

  update public.orders
     set statut = 'paye',
         paye_le = public.app_now(),
         reference_paiement = coalesce(p_reference_paiement, reference_paiement),
         maj_le = public.app_now()
   where id = p_order_id;

  -- ------------------------------------------------------------------------
  -- Les droits.
  --
  -- `peut_telecharger = true` : un ACHAT donne le téléchargement (§3.2). C'est
  -- la règle métier la plus sensible du projet, et c'est ici qu'elle s'écrit.
  -- Un abonnement, lui, ne passera jamais par cette fonction.
  --
  -- `source_id = commande` : c'est ce qui rend l'octroi traçable et rejouable.
  -- L'index unique (user_id, book_id, type, source_id) empêche le doublon.
  -- ------------------------------------------------------------------------
  insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
  select v_order.user_id, oi.book_id, 'achat', p_order_id, true
    from public.order_items oi
   where oi.order_id = p_order_id;

  get diagnostics v_nb = row_count;

  if v_nb = 0 then
    raise exception 'Commande % sans ligne : rien à octroyer.', p_order_id
      using errcode = 'check_violation';
  end if;

  -- ------------------------------------------------------------------------
  -- Le code promotionnel n'est décompté QU'ICI, au paiement.
  --
  -- À la création de la commande, il ne l'est pas : une commande en attente
  -- peut être abandonnée, et décompter alors consommerait le code pour des
  -- paniers jamais réglés (étape 8).
  --
  -- L'unicité (promo_code_id, order_id) de `promo_redemptions` empêche qu'un
  -- rejeu décompte deux fois — mais le verrou de ligne ci-dessus fait déjà que
  -- ce chemin n'est atteint qu'une fois.
  -- ------------------------------------------------------------------------
  if v_order.promo_code_id is not null then
    insert into public.promo_redemptions (promo_code_id, user_id, order_id)
    values (v_order.promo_code_id, v_order.user_id, p_order_id)
    on conflict (promo_code_id, order_id) do nothing;

    update public.promo_codes
       set usage_count = usage_count + 1
     where id = v_order.promo_code_id;
  end if;

  insert into public.payment_events (webhook_event_id, type, order_id, user_id, montant, devise)
  values (p_webhook_event_id, 'paiement.reussi', p_order_id, v_order.user_id,
          v_order.montant_total, v_order.devise);

  -- ┌────────────────────────────────────────────────────────────────────────┐
  -- │ L'EMAIL EST PROGRAMMÉ ICI, DANS LA MÊME TRANSACTION QUE L'OCTROI.     │
  -- │                                                                        │
  -- │ Atomique avec lui : pas de commande payée sans email programmé, pas    │
  -- │ d'email programmé sans commande payée. L'ENVOI, lui, aura lieu APRÈS   │
  -- │ le commit — et son échec ne remontera jamais jusqu'ici.                │
  -- │                                                                        │
  -- │ La clé dérive de la COMMANDE : c'est l'ÉVÉNEMENT, jamais l'envoi.       │
  -- └────────────────────────────────────────────────────────────────────────┘
  perform public.programmer_email(
    'commande-payee:' || p_order_id::text,
    'commande_confirmee',
    v_order.user_id,
    jsonb_build_object('order_id', p_order_id)
  );

  return query select false, v_nb;
end;
$$;
