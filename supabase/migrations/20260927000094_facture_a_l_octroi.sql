-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0094 — UNE COMMANDE PAYÉE ÉMET SA FACTURE.                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE DÉFAUT : UNE FONCTION COMPLÈTE QUE PERSONNE N'APPELAIT.              │
-- │                                                                          │
-- │ `emettre_facture` existe depuis l'étape des factures. Elle fige les      │
-- │ lignes, tire un numéro sans trou, pose la durée de conservation. Tout    │
-- │ autour d'elle est en place : la table `invoices`, la route de lecture    │
-- │ `GET /api/orders/{id}/invoice`, la purge à dix ans, et les statistiques  │
-- │ qui lisent les factures pour le chiffre d'affaires des abonnements.      │
-- │                                                                          │
-- │ Mais AUCUN appel, nulle part dans `src/`. Constaté sur le jeu de         │
-- │ démonstration du 27 septembre 2026 : quatre commandes payées, zéro       │
-- │ facture. Rien ne le signalait — la route de lecture répond 404 comme     │
-- │ pour une commande impayée, et la liste d'administration rend simplement  │
-- │ un numéro de facture nul.                                                │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CETTE MIGRATION NE RATTRAPE PAS LE PASSÉ, ET C'EST VOULU.               │
-- │                                                                          │
-- │ Émettre aujourd'hui les factures des commandes payées hier leur donnerait │
-- │ une date d'émission fausse et des numéros pris dans la séquence de       │
-- │ l'année courante. Une facture est une pièce datée ; on ne l'antidate pas.│
-- │                                                                          │
-- │ Les commandes déjà payées restent donc sans facture. Le jour où il       │
-- │ faudra les régulariser, ce sera une décision comptable — pas une         │
-- │ migration.                                                               │
-- └──────────────────────────────────────────────────────────────────────────┘

-- ══════════════════════════════════════════════════════════════════════════
-- UNE facture par commande, garantie par la base.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI UN INDEX, ALORS QUE LE VERROU DE `fulfill_order` SUFFIRAIT.    │
-- │                                                                          │
-- │ Le verrou de ligne fait que le chemin d'octroi n'est emprunté qu'une     │
-- │ fois par commande — c'est la protection NORMALE. Mais un numéro de       │
-- │ facture est tiré d'une séquence SANS TROU : une seconde émission ne      │
-- │ créerait pas seulement un doublon, elle consommerait un numéro que la    │
-- │ comptabilité attendrait ailleurs. Le dégât survivrait à la correction.   │
-- │                                                                          │
-- │ L'index est donc la dernière ligne de défense, comme celui               │
-- │ d'`entitlements` l'est pour les droits (docs/PLAN.md D1 point 8).        │
-- │                                                                          │
-- │ PARTIEL : une facture d'abonnement n'a pas de commande, et plusieurs     │
-- │ d'entre elles portent `order_id` nul.                                    │
-- └──────────────────────────────────────────────────────────────────────────┘

create unique index invoices_order_unique
  on public.invoices (order_id)
  where order_id is not null;

-- ══════════════════════════════════════════════════════════════════════════
-- `emettre_facture` devient IDEMPOTENTE.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Appelée deux fois sur la même commande, elle rendait la facture existante…
-- non : elle en créait une seconde. Elle rend désormais celle qui existe, sans
-- tirer de numéro. L'appelant n'a donc pas à savoir s'il rejoue.
--
-- Corps REPRIS VERBATIM, à ce préambule près.

create or replace function public.emettre_facture(
  p_order_id uuid,
  p_retention_years integer default 10,
  p_nom text default null,
  p_adresse jsonb default '{}'::jsonb,
  p_pays text default null
) returns public.invoices
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_commande public.orders;
  v_utilisateur public.users;
  v_lignes jsonb;
  v_facture public.invoices;
  v_maintenant timestamptz := public.app_now();
begin
  -- Déjà émise : on rend la même, sans tirer de numéro. Un rejeu ne doit pas
  -- consommer une place dans une séquence comptable sans trou.
  select * into v_facture from public.invoices where order_id = p_order_id;
  if found then
    return v_facture;
  end if;

  select * into v_commande from public.orders where id = p_order_id;
  if not found then
    raise exception 'Commande % introuvable.', p_order_id using errcode = 'no_data_found';
  end if;
  if v_commande.statut <> 'paye' then
    raise exception 'Une facture ne s''émet que sur une commande payée (commande % au statut %).',
      p_order_id, v_commande.statut using errcode = 'restrict_violation';
  end if;

  select * into v_utilisateur from public.users where id = v_commande.user_id;

  -- Copie figée des lignes : titre au moment de l'achat compris, pour que la
  -- facture reste lisible même si le catalogue évolue.
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'book_id', oi.book_id,
      'titre', coalesce(bt.titre, b.slug),
      'langue', oi.langue,
      'prix_unitaire', oi.prix_unitaire,
      'devise', oi.devise
    ) order by bt.titre),
    '[]'::jsonb
  )
  into v_lignes
  from public.order_items oi
  join public.books b on b.id = oi.book_id
  left join public.book_translations bt on bt.book_id = oi.book_id and bt.langue = oi.langue
  where oi.order_id = p_order_id;

  insert into public.invoices (
    numero, emise_le, user_id, order_id,
    facture_nom, facture_email, facture_adresse, facture_pays,
    lignes, montant_ht, montant_tva, montant_ttc, taux_tva, devise, zone,
    conservation_jusqu_au
  ) values (
    public.prochain_numero_facture(extract(year from v_maintenant)::integer),
    v_maintenant,
    v_commande.user_id,
    p_order_id,
    coalesce(p_nom, v_utilisateur.nom_complet, 'Client'),
    v_utilisateur.email,
    p_adresse,
    p_pays,
    v_lignes,
    v_commande.montant_total,
    0,
    v_commande.montant_total,
    0,
    v_commande.devise,
    v_commande.zone,
    v_maintenant + make_interval(years => p_retention_years)
  )
  returning * into v_facture;

  return v_facture;
end;
$$;

comment on function public.emettre_facture(uuid, integer, text, jsonb, text) is
  'Émet la facture d''une commande payée, ou rend celle qui existe déjà. Idempotente : un rejeu ne consomme pas de numéro. Appelée par fulfill_order, dans la même transaction que l''octroi.';

-- ══════════════════════════════════════════════════════════════════════════
-- `fulfill_order` l'appelle.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Corps REPRIS DE LA BASE, programmatiquement, au seul appel près. Le retaper
-- de mémoire aurait perdu le verrou de ligne, l'idempotence, le décompte du
-- code promotionnel ou la programmation de l'email — quatre choses que sa
-- signature ne dit pas.

CREATE OR REPLACE FUNCTION public.fulfill_order(p_order_id uuid, p_reference_paiement text DEFAULT NULL::text, p_webhook_event_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(deja_traite boolean, nb_droits integer)
 LANGUAGE plpgsql
AS $function$
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

  -- ┌────────────────────────────────────────────────────────────────────────┐
  -- │ LA FACTURE EST ÉMISE ICI, DANS LA MÊME TRANSACTION QUE L'OCTROI.      │
  -- │                                                                        │
  -- │ `emettre_facture` existait depuis l'origine et PERSONNE ne l'appelait. │
  -- │ Quatre commandes payées, zéro facture : le défaut ne se voyait nulle   │
  -- │ part, puisque `admin_lister_commandes` rend simplement un numéro de    │
  -- │ facture nul et que la route de lecture répond 404 comme pour une       │
  -- │ commande impayée.                                                      │
  -- │                                                                        │
  -- │ Elle est appelée exactement où l'email est programmé, et pour la même  │
  -- │ raison : atomique avec l'octroi. Pas de commande payée sans facture,   │
  -- │ pas de facture sans commande payée. Une facture émise après coup, par  │
  -- │ un travail de rattrapage, porterait une date d'émission fausse.        │
  -- │                                                                        │
  -- │ Le PAYS vient de la commande (`pays_paiement`, migration 0088) : c'est │
  -- │ celui auquel le paiement a été verrouillé chez le prestataire, donc le │
  -- │ seul que nous sachions vrai. Le nom et l'adresse restent aux défauts   │
  -- │ de la fonction — le compte n'en porte pas d'autres aujourd'hui.        │
  -- └────────────────────────────────────────────────────────────────────────┘
  perform public.emettre_facture(
    p_order_id,
    10,
    null,
    '{}'::jsonb,
    v_order.pays_paiement
  );

  return query select false, v_nb;
end;
$function$;

comment on function public.fulfill_order(uuid, text, uuid) is
  'Passe une commande en paye, cree ses droits, decompte le code promotionnel, programme l''email ET EMET LA FACTURE — le tout atomiquement. Idempotente : un rejeu de webhook ressort sans rien reecrire.';
