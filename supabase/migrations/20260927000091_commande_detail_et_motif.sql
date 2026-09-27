-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0091 — LE DÉTAIL D'UNE COMMANDE, ET LE MOTIF DE SON REMBOURSEMENT.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE MOTIF EST VISIBLE PAR LE CLIENT, ET C'EST TOUT SON INTÉRÊT.          │
-- │                                                                          │
-- │ Le prototype d'administration impose un motif au remboursement, choisi   │
-- │ dans une liste courte, et le dit « visible par le client ». Ce n'est pas │
-- │ une note interne : c'est la phrase que la personne lira quand son argent │
-- │ reviendra, et un virement sans explication inquiète plus qu'il ne        │
-- │ rassure.                                                                 │
-- │                                                                          │
-- │ La liste est CLOSE, et volontairement courte. Un champ libre aurait      │
-- │ laissé écrire n'importe quoi à destination d'un client — y compris ce    │
-- │ qu'on n'écrit pas à un client. Quatre motifs couvrent ce qui arrive      │
-- │ vraiment ; un cinquième cas se traitera par un courriel, qui est le bon  │
-- │ outil pour une explication particulière.                                 │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ IL N'EST PAS OBLIGATOIRE, PARCE QU'UN REMBOURSEMENT PEUT VENIR DU        │
-- │ PRESTATAIRE.                                                             │
-- │                                                                          │
-- │ `refund_order` est partagée par le webhook et l'administration — c'est   │
-- │ l'unique implémentation, et CLAUDE.md l'inscrit au tableau des règles à  │
-- │ implémentation unique. Un remboursement rapporté par le prestataire      │
-- │ n'a pas de motif choisi chez nous ; l'exiger en base ferait échouer le   │
-- │ webhook, c'est-à-dire perdre l'enregistrement d'un remboursement qui a   │
-- │ DÉJÀ eu lieu.                                                            │
-- │                                                                          │
-- │ Nul se lit donc « remboursement venu du prestataire ». L'obligation vit  │
-- │ à l'écran, là où un humain choisit.                                      │
-- └──────────────────────────────────────────────────────────────────────────┘

create type public.motif_remboursement as enum (
  'demande_client',
  'paiement_double',
  'fichier_defectueux',
  'geste_commercial'
);

alter table public.orders
  add column motif_remboursement public.motif_remboursement;

comment on column public.orders.motif_remboursement is
  'Motif du remboursement, VISIBLE PAR LE CLIENT. Posé par l''administration au moment de rembourser. Nul : remboursement rapporté par le prestataire, sans motif choisi ici.';

-- ══════════════════════════════════════════════════════════════════════════
-- Le détail que le panneau latéral affiche.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UNE FONCTION DE PLUS, ET NON UN FILTRE SUR LA LISTE.                    │
-- │                                                                          │
-- │ `admin_lister_commandes` rend le PREMIER titre et un décompte : c'est ce │
-- │ qu'une ligne de tableau montre. Le panneau montre TOUTES les lignes,     │
-- │ avec leur prix — donc une autre forme, pas un autre filtre.              │
-- │                                                                          │
-- │ Faire rendre les lignes à la fonction de liste aurait chargé cinquante   │
-- │ commandes de leurs lignes pour en afficher une seule : le coût d'un      │
-- │ écran de détail, payé sur chaque affichage de la liste.                  │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Les mêmes règles de confidentialité que la liste : ni nom ni courriel d'un
-- acheteur anonymisé. Elles ne sont pas recopiées par prudence — elles sont
-- recopiées parce que c'est la MÊME question, et qu'un panneau qui les
-- oublierait rendrait public ce que la liste tait, à un clic de distance.

create function public.admin_lire_commande(p_order_id uuid)
returns table (
  id uuid,
  numero bigint,
  nom text,
  email text,
  montant_total bigint,
  remise bigint,
  devise text,
  zone public.price_zone,
  statut public.order_status,
  moyen_paiement public.moyen_paiement,
  motif_remboursement public.motif_remboursement,
  pays_paiement text,
  cree_le timestamptz,
  paye_le timestamptz,
  maj_le timestamptz,
  acheteur_anonymise boolean,
  code_promo text,
  lignes jsonb
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    o.id,
    o.numero,
    case when u.statut = 'anonymise' then null else u.nom_complet end,
    case when u.statut = 'anonymise' then null else u.email end,
    o.montant_total,
    o.remise,
    o.devise,
    o.zone,
    o.statut,
    o.moyen_paiement,
    o.motif_remboursement,
    o.pays_paiement,
    o.cree_le,
    o.paye_le,
    o.maj_le,
    (u.statut = 'anonymise') as acheteur_anonymise,
    (select p.code from public.promo_codes p where p.id = o.promo_code_id),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'book_id', oi.book_id,
            'slug', b.slug,
            'type_document', b.type_document,
            'langue', oi.langue,
            'prix_unitaire', oi.prix_unitaire,
            'devise', oi.devise
          )
          order by b.slug
        )
        from public.order_items oi
        join public.books b on b.id = oi.book_id
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    )
  from public.orders o
  join public.users u on u.id = o.user_id
  where o.id = p_order_id;
$$;

comment on function public.admin_lire_commande(uuid) is
  'Détail d''une commande pour le panneau latéral d''administration : ses lignes, son code promotionnel, son moyen de paiement et le motif de son remboursement. Ne rend ni le nom ni le courriel d''un acheteur anonymisé.';

revoke all on function public.admin_lire_commande(uuid) from public, anon, authenticated;
grant execute on function public.admin_lire_commande(uuid) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- Rembourser AVEC son motif.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ELLE N'EST PAS UN SECOND `refund_order`.                                │
-- │                                                                          │
-- │ Elle écrit le motif, puis APPELLE `refund_order` — qui reste l'unique    │
-- │ implémentation du remboursement, partagée avec le webhook. Recopier ici  │
-- │ le retrait des droits et la mise en file des copies à purger aurait      │
-- │ donné deux remboursements qui divergent, et c'est toujours la copie qui  │
-- │ a l'air d'avoir raison.                                                  │
-- │                                                                          │
-- │ Le motif est écrit AVANT l'appel, dans la même transaction : si le       │
-- │ remboursement échoue, le motif ne reste pas seul sur une commande qui    │
-- │ n'a rien été remboursée.                                                 │
-- └──────────────────────────────────────────────────────────────────────────┘

create function public.admin_rembourser_commande(
  p_order_id uuid,
  p_motif public.motif_remboursement
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  -- `refund_order` rend une TABLE (droits_retires, commande_soldee), pas un
  -- scalaire : elle se lit donc dans un enregistrement, et non par
  -- affectation. L'erreur ne se serait vue qu'au premier remboursement.
  v_retour record;
begin
  if p_motif is null then
    raise exception 'Un remboursement décidé ici exige son motif : le client le lira.'
      using errcode = 'check_violation';
  end if;

  update public.orders set motif_remboursement = p_motif where id = p_order_id;

  if not found then
    raise exception 'Commande introuvable.' using errcode = 'no_data_found';
  end if;

  select * into v_retour from public.refund_order(p_order_id);

  return jsonb_build_object(
    'droits_retires', v_retour.droits_retires,
    'commande_soldee', v_retour.commande_soldee
  );
end;
$$;

comment on function public.admin_rembourser_commande(uuid, public.motif_remboursement) is
  'Rembourse une commande depuis l''administration, en enregistrant le motif que le client lira. Délègue le remboursement lui-même à refund_order, qui reste l''unique implémentation.';

revoke all on function public.admin_rembourser_commande(uuid, public.motif_remboursement)
  from public, anon, authenticated;
grant execute on function public.admin_rembourser_commande(uuid, public.motif_remboursement)
  to service_role;
