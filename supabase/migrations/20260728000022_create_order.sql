-- 0022 — Création atomique d'une commande (§4.2 F9, docs/PLAN.md D4)
--
-- POURQUOI UNE FONCTION, ET PAS DEUX INSERTIONS DEPUIS L'APPLICATION
--
-- Une commande est une ligne dans `orders` ET ses lignes dans `order_items`.
-- Le client Supabase ne sait pas ouvrir une transaction : deux appels séparés
-- laisseraient, en cas de coupure entre les deux, une commande SANS AUCUNE
-- LIGNE — c'est-à-dire un montant à payer sans rien à livrer. Le regroupement
-- dans une fonction rend l'ensemble atomique, une fonction PL/pgSQL s'exécutant
-- dans une transaction implicite.
--
-- CE QUE CETTE FONCTION NE FAIT PAS, ET POURQUOI
--
-- Elle ne calcule AUCUN prix. Les montants lui sont fournis, déjà résolus par
-- `src/domain/orders`. Recalculer ici aurait créé une seconde implémentation de
-- la grille tarifaire, en SQL, que rien n'aurait tenue en phase avec la
-- première. Le prix reste relu en base côté serveur — simplement une couche
-- plus haut.
--
-- Elle ne touche NI `promo_redemptions` NI `promo_codes.usage_count`. Une
-- commande créée ici est `en_attente` : elle n'est pas payée, et peut être
-- abandonnée. Décompter l'usage d'un code dès la création le consommerait pour
-- des paniers jamais réglés. L'enregistrement de l'utilisation appartient au
-- gestionnaire de webhooks (étape 9), ce que le commentaire de
-- `promo_redemptions` annonce déjà : « l'unicité par (code, commande) empêche
-- qu'un rejeu de webhook décompte deux fois le même code ».
--
-- Elle ne passe JAMAIS la commande en `paye`. CLAUDE.md règle 5 : « Les
-- webhooks sont la seule source de vérité sur l'état d'un paiement. »

create function public.create_order(
  p_user_id uuid,
  p_zone public.price_zone,
  p_devise text,
  p_montant_total bigint,
  p_remise bigint,
  p_promo_code_id uuid,
  p_lignes jsonb
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

  -- Le statut n'est pas paramétrable : une commande naît TOUJOURS en attente.
  -- Laisser l'appelant le choisir aurait fait de cette fonction un chemin
  -- d'octroi de droits contournant le gestionnaire de webhooks.
  insert into public.orders
    (user_id, montant_total, devise, zone, statut, promo_code_id, remise)
  values
    (p_user_id, p_montant_total, p_devise, p_zone, 'en_attente', p_promo_code_id, p_remise)
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

  -- Filet sur le contrat d'appel : si une ligne du tableau n'a pas produit de
  -- ligne insérée, la commande serait incomplète. La transaction est annulée
  -- plutôt que de laisser passer une facture amputée.
  if v_nb_lignes <> jsonb_array_length(p_lignes) then
    raise exception 'Commande incomplète : % lignes insérées pour % attendues.',
      v_nb_lignes, jsonb_array_length(p_lignes)
      using errcode = 'check_violation';
  end if;

  return v_order_id;
end;
$$;

comment on function public.create_order(uuid, public.price_zone, text, bigint, bigint, uuid, jsonb) is
  'Crée une commande et ses lignes de manière atomique. Ne calcule aucun prix, ne décompte aucun code promotionnel, et ne passe jamais la commande en `paye` — cela appartient au gestionnaire de webhooks (CLAUDE.md règle 5).';

-- Appelable par le seul rôle de service. Un client authentifié qui pourrait
-- l'appeler créerait des commandes pour le compte d'autrui, en choisissant les
-- montants — les privilèges d'écriture sur `orders` lui sont d'ailleurs déjà
-- refusés (migration 0010).
--
-- Le `grant` explicite est INDISPENSABLE : PostgreSQL accorde `execute` à
-- `public` par défaut, et le révoquer le retire aussi à `service_role`, qui n'en
-- hérite que par ce biais. Sans cette ligne, la création de commande échoue sur
-- « permission denied for function ».
revoke all on function public.create_order(uuid, public.price_zone, text, bigint, bigint, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_order(uuid, public.price_zone, text, bigint, bigint, uuid, jsonb)
  to service_role;
