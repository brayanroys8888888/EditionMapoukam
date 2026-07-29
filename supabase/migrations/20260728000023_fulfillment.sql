-- 0023 — Octroi des droits après paiement (§9.1, CLAUDE.md règle 5)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ LE PASSAGE EN `paye` ET L'OCTROI DES DROITS SONT UNE SEULE OPÉRATION.      │
-- │                                                                            │
-- │ Séparés, ils laisseraient deux états incohérents, tous deux durables :     │
-- │   * commande payée sans droits — le client a payé et n'a rien reçu ;       │
-- │   * droits sans commande payée — le contenu est livré sans encaissement.   │
-- │                                                                            │
-- │ Le premier est un litige, le second une perte sèche. Une fonction PL/pgSQL │
-- │ s'exécute dans une transaction implicite : ou tout est écrit, ou rien.     │
-- └────────────────────────────────────────────────────────────────────────────┘

create function public.fulfill_order(
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

  return query select false, v_nb;
end;
$$;

comment on function public.fulfill_order(uuid, text, uuid) is
  'Passe une commande en `paye` ET crée ses droits d''accès, atomiquement (§9.1). Idempotente : un rejeu ressort sans rien réécrire.';

-- ---------------------------------------------------------------------------
-- Échec et abandon.
--
-- Aucun droit n'est créé, et c'est tout l'objet de la fonction : le seul moyen
-- d'obtenir un droit est `fulfill_order`.
-- ---------------------------------------------------------------------------

create function public.fail_order(
  p_order_id uuid,
  p_motif text default null,
  p_webhook_event_id uuid default null
) returns boolean
language plpgsql
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande introuvable : %', p_order_id
      using errcode = 'no_data_found';
  end if;

  -- Un échec qui arrive APRÈS un paiement réussi ne défait rien. Les
  -- événements d'un prestataire ne sont pas garantis dans l'ordre, et un
  -- paiement encaissé ne se retire pas sur la foi d'un message tardif : cela
  -- demande un remboursement explicite.
  if v_order.statut <> 'en_attente' then
    return false;
  end if;

  update public.orders
     set statut = 'echoue', maj_le = public.app_now()
   where id = p_order_id;

  -- Le motif va dans `detail`, la table n'ayant pas de colonne dédiée : elle
  -- est commune à tous les types d'événements, dont chacun porte des
  -- informations différentes.
  insert into public.payment_events (webhook_event_id, type, order_id, user_id, detail)
  values (p_webhook_event_id, 'paiement.echoue', p_order_id, v_order.user_id,
          jsonb_build_object('motif', p_motif));

  return true;
end;
$$;

comment on function public.fail_order(uuid, text, uuid) is
  'Marque une commande en échec. N''octroie jamais de droit, et ne défait jamais un paiement déjà encaissé (§9.1).';

-- ---------------------------------------------------------------------------
-- Remboursement.
--
-- Le droit acquis par l'achat est RETIRÉ : §3.2 fait du droit d'accès la
-- contrepartie du paiement. Rembourser sans retirer laisserait le contenu
-- accessible gratuitement et de façon perpétuelle.
--
-- Seuls les droits issus de CETTE commande sont retirés (`source_id`) : un
-- octroi manuel d'administrateur sur le même titre, ou un second achat, ne
-- doivent pas disparaître avec le remboursement.
-- ---------------------------------------------------------------------------

create function public.refund_order(
  p_order_id uuid,
  p_webhook_event_id uuid default null
) returns integer
language plpgsql
as $$
declare
  v_order public.orders%rowtype;
  v_retires integer := 0;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande introuvable : %', p_order_id
      using errcode = 'no_data_found';
  end if;

  if v_order.statut = 'rembourse' then
    return 0;
  end if;

  if v_order.statut <> 'paye' then
    raise exception 'Commande % dans l''état % : remboursement refusé.', p_order_id, v_order.statut
      using errcode = 'check_violation';
  end if;

  delete from public.entitlements
   where source_id = p_order_id and user_id = v_order.user_id and type = 'achat';

  get diagnostics v_retires = row_count;

  update public.orders
     set statut = 'rembourse', maj_le = public.app_now()
   where id = p_order_id;

  insert into public.payment_events (webhook_event_id, type, order_id, user_id, montant, devise)
  values (p_webhook_event_id, 'remboursement.effectue', p_order_id, v_order.user_id,
          v_order.montant_total, v_order.devise);

  return v_retires;
end;
$$;

comment on function public.refund_order(uuid, uuid) is
  'Rembourse une commande et retire les droits qu''elle avait octroyés. Ne touche jamais un droit d''une autre origine (§3.2).';

-- ---------------------------------------------------------------------------
-- Privilèges.
--
-- Le `grant` explicite est indispensable : PostgreSQL accorde `execute` à
-- `public` par défaut, et le révoquer le retire aussi à `service_role`.
-- ---------------------------------------------------------------------------

revoke all on function public.fulfill_order(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fulfill_order(uuid, text, uuid) to service_role;

revoke all on function public.fail_order(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fail_order(uuid, text, uuid) to service_role;

revoke all on function public.refund_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.refund_order(uuid, uuid) to service_role;
