-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0088 — LA COMMANDE PORTE LE PAYS AUQUEL SON PAIEMENT EST VERROUILLÉ.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE DÉFAUT QUE CETTE MIGRATION PERMET DE CORRIGER.                       │
-- │                                                                          │
-- │ §3.3 : la zone tarifaire vient du PAYS DU MOYEN DE PAIEMENT. Notch Pay   │
-- │ ne le révèle qu'après le règlement : `paysDuMoyenDePaiement` rendait     │
-- │ `null`, et TOUT client — camerounais compris — payait la grille          │
-- │ internationale. `docs/NOTCHPAY.md` §4.2 le consignait comme « à          │
-- │ arbitrer ».                                                              │
-- │                                                                          │
-- │ Décision du propriétaire du 25 septembre 2026 : le client DÉCLARE son    │
-- │ pays au récapitulatif (prérempli depuis l'adresse IP), et le paiement    │
-- │ est ouvert chez Notch Pay avec `locked_country` sur ce pays. Le pays     │
-- │ reste celui du moyen de paiement : c'est le prestataire qui refuse un    │
-- │ moyen d'un autre pays, pas une confiance accordée au client.             │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI SUR LA COMMANDE, ET PAS DANS LA REQUÊTE DE PAIEMENT.           │
-- │                                                                          │
-- │ Le montant et la devise sont figés à la création de la commande ; le     │
-- │ paiement s'ouvre plus tard, par `POST /api/checkout`. Si le pays         │
-- │ verrouillé venait de cette seconde requête, on pourrait créer une        │
-- │ commande à 1 500 FCFA en se déclarant camerounais, puis ouvrir son       │
-- │ paiement verrouillé sur la France — et régler le tarif Afrique avec une  │
-- │ carte européenne. Le pays est donc écrit AVEC le montant, dans la même   │
-- │ transaction, et relu par le tunnel.                                      │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- La correspondance pays → zone n'est PAS recopiée ici : elle vit dans
-- `src/domain/orders/zones.ts`, et une seconde liste en SQL finirait par en
-- diverger. La base garantit la FORME du code (ISO 3166-1 alpha-2), le domaine
-- en tire la zone.
--
-- Nulle quand aucun pays n'est verrouillé : grille internationale, ou
-- prestataire qui connaît lui-même le pays (le faux prestataire).

alter table public.orders
  add column pays_paiement text
    constraint orders_pays_paiement_iso check (pays_paiement ~ '^[A-Z]{2}$');

comment on column public.orders.pays_paiement is
  'Pays (ISO 3166-1 alpha-2) auquel le paiement de la commande est verrouillé chez le prestataire. Écrit avec le montant par create_order, relu par POST /api/checkout. Nul : aucun verrouillage.';

-- `drop` puis `create` : la signature change, et une surcharge laissée en
-- place resterait appelable avec l'ancienne liste d'arguments.
drop function public.create_order(uuid, public.price_zone, text, bigint, bigint, uuid, jsonb);

-- Corps REPRIS VERBATIM de la 0022, au paramètre `p_pays_paiement` près.
create function public.create_order(
  p_user_id uuid,
  p_zone public.price_zone,
  p_devise text,
  p_montant_total bigint,
  p_remise bigint,
  p_promo_code_id uuid,
  p_lignes jsonb,
  p_pays_paiement text default null
) returns uuid
language plpgsql
as $$
declare
  v_order_id uuid;
  v_nb_lignes integer;
begin
  if p_lignes is null or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Commande sans ligne : rien à facturer.'
      using errcode = 'check_violation';
  end if;

  insert into public.orders
    (user_id, montant_total, devise, zone, statut, promo_code_id, remise, pays_paiement)
  values
    (p_user_id, p_montant_total, p_devise, p_zone, 'en_attente', p_promo_code_id, p_remise,
     p_pays_paiement)
  returning id into v_order_id;

  insert into public.order_items (order_id, book_id, langue, prix_unitaire, devise, zone)
  select
    v_order_id,
    (ligne->>'book_id')::uuid,
    ligne->>'langue',
    (ligne->>'prix_unitaire')::bigint,
    ligne->>'devise',
    (ligne->>'zone')::public.price_zone
  from jsonb_array_elements(p_lignes) as ligne;

  get diagnostics v_nb_lignes = row_count;

  if v_nb_lignes <> jsonb_array_length(p_lignes) then
    raise exception 'Commande incomplète : % lignes insérées pour % attendues.',
      v_nb_lignes, jsonb_array_length(p_lignes)
      using errcode = 'check_violation';
  end if;

  return v_order_id;
end;
$$;

comment on function public.create_order(uuid, public.price_zone, text, bigint, bigint, uuid, jsonb, text) is
  'Crée une commande et ses lignes de manière atomique, avec le pays auquel son paiement sera verrouillé. Ne calcule aucun prix, ne décompte aucun code promotionnel, et ne passe jamais la commande en `paye` — cela appartient au gestionnaire de webhooks (CLAUDE.md règle 5).';

revoke all on function public.create_order(uuid, public.price_zone, text, bigint, bigint, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_order(uuid, public.price_zone, text, bigint, bigint, uuid, jsonb, text)
  to service_role;
