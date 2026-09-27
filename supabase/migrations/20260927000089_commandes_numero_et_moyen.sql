-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0089 — LA COMMANDE PORTE UN NUMÉRO DICTABLE ET SON MOYEN DE PAIEMENT.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE QUE L'ÉCRAN D'ADMINISTRATION NE POUVAIT PAS MONTRER.                 │
-- │                                                                          │
-- │ Le prototype d'administration du 17 septembre 2026 affiche, sur chaque   │
-- │ ligne de commande, un numéro (« EM-1048 ») et un moyen de paiement       │
-- │ (« Carte », « Orange Money », « MTN MoMo »). Ni l'un ni l'autre          │
-- │ n'existait : l'écran rendait huit caractères d'UUID, que personne ne     │
-- │ peut dicter au téléphone, et la colonne du moyen de paiement n'avait     │
-- │ aucune source.                                                           │
-- │                                                                          │
-- │ Décision du propriétaire du 27 septembre 2026 : ajouter les deux.        │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE MOYEN DE PAIEMENT EST NORMALISÉ, PAS RECOPIÉ DU PRESTATAIRE.         │
-- │                                                                          │
-- │ Notch Pay nomme ses canaux `cm.mtn`, `cm.orange`, `card` ; un autre      │
-- │ prestataire les nommerait autrement. Stocker le code du prestataire tel  │
-- │ quel ferait entrer son vocabulaire dans la base, puis dans l'écran, et   │
-- │ CLAUDE.md l'interdit : « toute la logique métier ignore complètement     │
-- │ quel adaptateur est branché ».                                           │
-- │                                                                          │
-- │ L'adaptateur traduit donc vers CE vocabulaire-ci, qui est le nôtre. Un   │
-- │ canal inconnu devient `autre` — jamais un refus : le moyen de paiement   │
-- │ est une information d'affichage, et faire échouer un webhook de          │
-- │ paiement pour un libellé inattendu perdrait un encaissement pour une     │
-- │ étiquette.                                                               │
-- │                                                                          │
-- │ Nul = jamais reçu. Les commandes antérieures restent nulles : le canal   │
-- │ n'a jamais été conservé, et le déduire après coup serait inventer.       │
-- └──────────────────────────────────────────────────────────────────────────┘

create type public.moyen_paiement as enum ('carte', 'orange_money', 'mtn_momo', 'autre');

alter table public.orders
  add column moyen_paiement public.moyen_paiement;

comment on column public.orders.moyen_paiement is
  'Moyen de paiement normalisé, écrit par le gestionnaire de webhooks à partir de ce que le prestataire rapporte. Jamais par le client, jamais depuis un écran. Nul : le prestataire ne l''a pas rapporté.';

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE NUMÉRO EST UNE SÉQUENCE, ET IL COMMENCE À 1000.                      │
-- │                                                                          │
-- │ Pas à 1 : un premier client nommé « EM-1 » annonce le chiffre d'affaires │
-- │ de la boutique à qui sait lire. Ce n'est pas un secret défendable — la   │
-- │ suite reste devinable — mais il n'y a aucune raison de l'afficher en     │
-- │ clair sur la première facture.                                           │
-- │                                                                          │
-- │ Le numéro N'EST PAS le numéro de FACTURE. `invoices.numero` existe déjà  │
-- │ et obéit à des règles comptables : séquence sans trou, jamais réutilisé, │
-- │ conservé dix ans. Celui-ci ne sert qu'à se comprendre — dans un courriel │
-- │ de réclamation, au téléphone, dans une recherche d'administration.       │
-- │ Confondre les deux ferait porter à un identifiant d'écran des            │
-- │ obligations qu'il ne peut pas tenir.                                     │
-- └──────────────────────────────────────────────────────────────────────────┘

create sequence public.orders_numero_seq start with 1000;

alter table public.orders
  add column numero bigint not null default nextval('public.orders_numero_seq');

-- Les commandes déjà passées reçoivent leur numéro dans l'ordre où elles ont
-- été créées : c'est le seul ordre qui ait un sens pour qui les relit.
with rang as (
  select id, row_number() over (order by cree_le, id) as n
  from public.orders
)
update public.orders o
set numero = rang.n + 999
from rang
where rang.id = o.id;

-- La séquence reprend APRÈS le dernier numéro attribué, sans quoi la commande
-- suivante entrerait en collision avec une commande rattrapée.
select setval(
  'public.orders_numero_seq',
  greatest((select coalesce(max(numero), 999) from public.orders), 999)
);

alter table public.orders
  add constraint orders_numero_unique unique (numero);

comment on column public.orders.numero is
  'Numéro lisible et dictable de la commande, rendu « EM-1048 » à l''écran. Sert à se comprendre, pas à comptabiliser : le numéro de facture est invoices.numero, et lui seul obéit aux règles comptables.';

-- ══════════════════════════════════════════════════════════════════════════
-- La liste d'administration rend ce que l'écran affiche, et rien de plus.
-- ══════════════════════════════════════════════════════════════════════════
--
-- `drop` puis `create` : le type de retour change, et `create or replace` le
-- refuse.

drop function public.admin_lister_commandes(text, uuid, integer, integer);

create function public.admin_lister_commandes(
  p_statut text default null,
  p_user_id uuid default null,
  p_page integer default 1,
  p_taille integer default 25,
  p_devise text default null,
  p_recherche text default null
) returns table (
  id uuid,
  user_id uuid,
  numero bigint,
  nom text,
  email text,
  montant_total bigint,
  devise text,
  zone public.price_zone,
  statut public.order_status,
  moyen_paiement public.moyen_paiement,
  remise bigint,
  cree_le timestamptz,
  paye_le timestamptz,
  numero_facture text,
  acheteur_anonymise boolean,
  nb_lignes integer,
  premier_titre text,
  premier_type public.document_type,
  total_lignes bigint
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with base as (
    select o.*, u.statut as statut_compte, u.email as email_compte, u.nom_complet
    from public.orders o
    join public.users u on u.id = o.user_id
    where (p_statut is null or o.statut::text = p_statut)
      and (p_user_id is null or o.user_id = p_user_id)
      and (p_devise is null or o.devise = p_devise)
      /*
       * La RECHERCHE porte sur ce que l'écran montre : le numéro, le nom, le
       * courriel et les slugs des lignes. Pas sur l'identifiant technique —
       * personne ne cherche un UUID, et l'accepter ferait croire que le
       * champ interroge autre chose qu'une liste déjà filtrée.
       *
       * Un acheteur anonymisé n'est retrouvable ni par son nom ni par son
       * courriel : la ligne reste, la personne non. Les chercher ici
       * défairait depuis un champ de recherche ce que le droit à l'oubli a
       * fait en base.
       */
      and (
        p_recherche is null
        or length(btrim(p_recherche)) = 0
        or o.numero::text like '%' || btrim(p_recherche) || '%'
        or (
          u.statut <> 'anonymise'
          and (
            u.nom_complet ilike '%' || btrim(p_recherche) || '%'
            or u.email ilike '%' || btrim(p_recherche) || '%'
          )
        )
        or exists (
          select 1
          from public.order_items oi
          join public.books b on b.id = oi.book_id
          where oi.order_id = o.id
            and b.slug ilike '%' || btrim(p_recherche) || '%'
        )
      )
  ),
  compte as (select count(*) as total from base)
  select
    base.id,
    base.user_id,
    base.numero,
    -- ┌────────────────────────────────────────────────────────────────────┐
    -- │ LE NOM SUIT EXACTEMENT LA RÈGLE DU COURRIEL, déjà posée ici.       │
    -- │                                                                    │
    -- │ La commande survit à l'anonymisation — c'est une pièce comptable.  │
    -- │ La personne, non. Rendre le nom alors que le courriel est tu       │
    -- │ recomposerait l'identité par l'autre bout.                         │
    -- └────────────────────────────────────────────────────────────────────┘
    case when base.statut_compte = 'anonymise' then null else base.nom_complet end,
    case when base.statut_compte = 'anonymise' then null else base.email_compte end,
    base.montant_total,
    base.devise,
    base.zone,
    base.statut,
    base.moyen_paiement,
    base.remise,
    base.cree_le,
    base.paye_le,
    (select i.numero from public.invoices i where i.order_id = base.id limit 1),
    (base.statut_compte = 'anonymise') as acheteur_anonymise,
    (select count(*)::integer from public.order_items oi where oi.order_id = base.id),
    /*
     * Le PREMIER titre de la commande, au sens de l'écran : celui qu'il
     * affiche, les autres étant résumés par « + N autres ». L'ordre est celui
     * du slug, faute de rang sur `order_items` — arbitraire mais STABLE, ce
     * qui suffit : une liste dont la première ligne changerait d'un
     * rafraîchissement à l'autre serait pire qu'un ordre discutable.
     */
    (
      select b.slug
      from public.order_items oi
      join public.books b on b.id = oi.book_id
      where oi.order_id = base.id
      order by b.slug
      limit 1
    ),
    (
      select b.type_document
      from public.order_items oi
      join public.books b on b.id = oi.book_id
      where oi.order_id = base.id
      order by b.slug
      limit 1
    ),
    compte.total
  from base cross join compte
  order by base.cree_le desc, base.id
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

comment on function public.admin_lister_commandes(text, uuid, integer, integer, text, text) is
  'Liste paginée des commandes pour l''administration, avec le numéro, le moyen de paiement et le premier titre que l''écran affiche. Ne rend ni le nom ni le courriel d''un acheteur anonymisé.';

revoke all on function public.admin_lister_commandes(text, uuid, integer, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_lister_commandes(text, uuid, integer, integer, text, text)
  to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- Les quatre chiffres de la bande, et pourquoi ils ne sont pas additionnés.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UNE LIGNE PAR DEVISE POUR L'ENCAISSÉ, UN SEUL NOMBRE POUR LES COMPTES.  │
-- │                                                                          │
-- │ « Net encaissé » est un MONTANT : additionner des euros et des francs    │
-- │ CFA produirait un nombre que personne ne facturera. La fonction rend     │
-- │ donc une ligne par devise, comme `stats_chiffre_affaires_resume`.        │
-- │                                                                          │
-- │ « En attente » et « Remboursées » sont des DÉCOMPTES : une commande      │
-- │ reste une commande quelle que soit sa monnaie, et les séparer par devise │
-- │ ferait afficher deux fois le même souci.                                 │
-- └──────────────────────────────────────────────────────────────────────────┘

create function public.admin_stats_commandes(
  p_at timestamptz default app_now()
) returns table (
  devise text,
  net_encaisse bigint,
  nb_payees bigint,
  nb_en_attente bigint,
  nb_remboursees_30j bigint
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  /*
   * La borne basse de la fenetre est NOMMEE, et ce n'est pas cosmetique.
   *
   * `bornes-temporelles.test.ts` recense toute comparaison de date contre
   * `p_at` et exige la convention du depot : validite `> p_at`, echeance
   * `<= p_at`. Une borne BASSE d'intervalle est inclusive par construction
   * dans `[debut, fin[` — le test l'admet, mais il la reconnait a son nom.
   *
   * Comparer la colonne directement a l'instant de reference diminue d'un
   * intervalle melangeait deux choses : cet instant, et le debut d'une
   * fenetre. Les separer dit ce qu'on compare, et fait passer l'inventaire
   * pour la bonne raison.
   *
   * Et le recensement lit la definition ENTIERE, commentaires compris — comme
   * `clock-discipline` et `design-tokens` le font ailleurs. Citer ici la forme
   * qu'on vient d'ecarter la ferait donc recenser : ce commentaire la decrit
   * en toutes lettres plutot que de l'ecrire.
   */
  with bornes as (
    select p_at - interval '30 days' as debut
  ),
  devises as (
    select distinct o.devise from public.orders o where o.statut = 'paye'
  ),
  globaux as (
    select
      count(*) filter (where o.statut = 'en_attente') as en_attente,
      count(*) filter (
        where o.statut = 'rembourse' and o.maj_le >= b.debut
      ) as remboursees
    from public.orders o cross join bornes b
  )
  select
    d.devise,
    coalesce(
      (select sum(o.montant_total) from public.orders o
        where o.statut = 'paye' and o.devise = d.devise), 0
    )::bigint,
    coalesce(
      (select count(*) from public.orders o
        where o.statut = 'paye' and o.devise = d.devise), 0
    )::bigint,
    globaux.en_attente,
    globaux.remboursees
  from devises d cross join globaux
  order by d.devise;
$$;

comment on function public.admin_stats_commandes(timestamptz) is
  'Les quatre chiffres de la bande de l''écran Commandes. Le net encaissé est rendu par devise — jamais additionné ; les décomptes sont globaux.';

revoke all on function public.admin_stats_commandes(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_stats_commandes(timestamptz) to service_role;
