-- 0027 — Remboursement par LIGNE de commande (Q9.1)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ UN REMBOURSEMENT PARTIEL NE RETIRE QUE L'ARTICLE REMBOURSÉ.               │
-- │                                                                            │
-- │ La version précédente (migration 0023) retirait tous les droits d'une      │
-- │ commande dès qu'un remboursement la concernait. Sur un panier de quatre    │
-- │ titres dont un seul est remboursé, l'acheteur perdait les trois autres,    │
-- │ qu'il avait payés et conservés.                                           │
-- │                                                                            │
-- │ Le geste commercial — rembourser SANS retirer — reste possible par         │
-- │ l'octroi manuel d'un administrateur, que ce remboursement ne touche pas :  │
-- │ seuls les droits de type `achat` issus de CETTE commande sont retirés.    │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- Migration corrective : `refund_order` est remplacée, la précédente n'étant
-- jamais modifiée sur place (CLAUDE.md — « on ajoute une migration corrective »).

drop function if exists public.refund_order(uuid, uuid);

create function public.refund_order(
  p_order_id uuid,
  p_book_ids uuid[] default null,
  p_webhook_event_id uuid default null
) returns table (droits_retires integer, commande_soldee boolean)
language plpgsql
as $$
declare
  v_order public.orders%rowtype;
  v_retires integer := 0;
  v_restants integer := 0;
  v_cibles uuid[];
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'Commande introuvable : %', p_order_id
      using errcode = 'no_data_found';
  end if;

  if v_order.statut = 'rembourse' then
    return query select 0, true;
    return;
  end if;

  if v_order.statut <> 'paye' then
    raise exception 'Commande % dans l''état % : remboursement refusé.', p_order_id, v_order.statut
      using errcode = 'check_violation';
  end if;

  -- `null` = remboursement TOTAL. C'est le comportement par défaut, et celui
  -- qu'un prestataire qui ne détaille pas ses lignes produira.
  if p_book_ids is null then
    select array_agg(oi.book_id) into v_cibles
      from public.order_items oi where oi.order_id = p_order_id;
  else
    -- Filtré sur les lignes RÉELLEMENT présentes : un identifiant étranger à
    -- la commande ne doit pas pouvoir servir à retirer un droit acquis
    -- ailleurs.
    select array_agg(oi.book_id) into v_cibles
      from public.order_items oi
     where oi.order_id = p_order_id and oi.book_id = any (p_book_ids);
  end if;

  if v_cibles is null or array_length(v_cibles, 1) is null then
    raise exception 'Remboursement sans ligne applicable sur la commande %.', p_order_id
      using errcode = 'check_violation';
  end if;

  -- `type = 'achat'` et `source_id` : un octroi manuel d'administrateur sur le
  -- même titre survit au remboursement. C'est lui qui porte le geste
  -- commercial.
  delete from public.entitlements
   where source_id = p_order_id
     and user_id = v_order.user_id
     and type = 'achat'
     and book_id = any (v_cibles);

  get diagnostics v_retires = row_count;

  -- La commande n'est soldée que lorsqu'il ne reste plus aucun droit issu
  -- d'elle. Un remboursement partiel la laisse `paye` : elle a bien donné lieu
  -- à un encaissement, et une partie du contenu reste due.
  select count(*) into v_restants
    from public.entitlements
   where source_id = p_order_id and user_id = v_order.user_id and type = 'achat';

  if v_restants = 0 then
    update public.orders
       set statut = 'rembourse', maj_le = public.app_now()
     where id = p_order_id;
  end if;

  insert into public.payment_events (webhook_event_id, type, order_id, user_id, montant, devise, detail)
  values (
    p_webhook_event_id, 'remboursement.effectue', p_order_id, v_order.user_id,
    v_order.montant_total, v_order.devise,
    jsonb_build_object(
      'livres', to_jsonb(v_cibles),
      'partiel', v_restants > 0,
      'droits_retires', v_retires
    )
  );

  return query select v_retires, v_restants = 0;
end;
$$;

comment on function public.refund_order(uuid, uuid[], uuid) is
  'Rembourse tout ou partie d''une commande. `p_book_ids` nul = total. Ne retire que les droits `achat` issus de CETTE commande : un octroi manuel d''administrateur survit, et c''est lui qui porte le geste commercial.';

revoke all on function public.refund_order(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.refund_order(uuid, uuid[], uuid) to service_role;
