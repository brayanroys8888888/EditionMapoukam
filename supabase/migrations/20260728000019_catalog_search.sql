-- 0019 — Catalogue : recherche, filtres, tri, pagination
--
-- La requête de catalogue est écrite en SQL plutôt qu'assemblée côté Node pour
-- trois raisons :
--   * la recherche plein texte doit passer par les index GIN, ce qu'un filtre
--     appliqué après coup ne permet pas ;
--   * le total pour la pagination doit être calculé dans la même passe, sinon
--     c'est un second aller-retour à chaque page ;
--   * le repli de prix d'une zone sur l'autre est une jointure, pas une
--     boucle applicative.

-- ---------------------------------------------------------------------------
-- Index de recherche
--
-- Deux vecteurs, parce que les termes cherchés vivent dans deux tables : le
-- titre et le résumé sont propres à une version linguistique, l'auteur et
-- l'origine culturelle appartiennent au livre.
--
-- Configuration `french` : sans elle, « contes » et « conte » seraient deux
-- termes distincts, et une recherche sur l'un manquerait l'autre.
-- ---------------------------------------------------------------------------

-- `array_to_string` est déclarée STABLE et non IMMUTABLE, parce qu'elle accepte
-- `anyarray` : sur un type dont la fonction de sortie dépendrait de la
-- configuration, le résultat ne serait pas garanti constant. Sur `text[]`, il
-- l'est — aucune conversion n'intervient. Cette enveloppe restreint la
-- signature à `text[]` et peut donc être déclarée immuable sans mentir, ce que
-- la colonne générée exige.
create function public.themes_texte(p_themes text[])
  returns text
  language sql
  immutable
  parallel safe
as $$
  select coalesce(array_to_string(p_themes, ' '), '');
$$;

alter table public.books
  add column recherche tsvector
  generated always as (
    to_tsvector(
      'french'::regconfig,
      coalesce(auteur, '') || ' ' ||
      coalesce(illustrateur, '') || ' ' ||
      coalesce(origine_culturelle, '') || ' ' ||
      public.themes_texte(themes)
    )
  ) stored;

alter table public.book_translations
  add column recherche tsvector
  generated always as (
    to_tsvector('french'::regconfig, coalesce(titre, '') || ' ' || coalesce(resume, ''))
  ) stored;

create index books_recherche_idx on public.books using gin (recherche);
create index book_translations_recherche_idx on public.book_translations using gin (recherche);

comment on column public.books.recherche is
  'Vecteur de recherche du livre : auteur, illustrateur, origine culturelle, thèmes. Le titre et le résumé sont dans book_translations, puisqu''ils dépendent de la langue.';

-- ---------------------------------------------------------------------------
-- Popularité
--
-- La spécification demande un tri par popularité (§4.1 F2) sans en définir la
-- formule. Retenu : nombre d'achats payés + nombre de lecteurs distincts. Les
-- deux flux de revenus pèsent ainsi le même poids, ce qui évite qu'un titre
-- très lu par les abonnés soit invisible face à un titre peu vendu, et
-- réciproquement.
--
-- À ARBITRER : cette pondération est un choix, pas une donnée de la
-- spécification. Voir docs/PLAN.md, étape 5.
--
-- Vue réservée au serveur : les volumes de vente par titre sont une donnée
-- commercialement sensible, qui n'a pas à être lisible par un visiteur.
-- ---------------------------------------------------------------------------

create view public.book_popularity as
select
  b.id as book_id,
  coalesce(v.achats, 0) as achats,
  coalesce(l.lecteurs, 0) as lecteurs,
  coalesce(v.achats, 0) + coalesce(l.lecteurs, 0) as score
from public.books b
left join (
  select oi.book_id, count(*) as achats
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.statut = 'paye'
  group by oi.book_id
) v on v.book_id = b.id
left join (
  select rp.book_id, count(distinct rp.user_id) as lecteurs
  from public.reading_progress rp
  group by rp.book_id
) l on l.book_id = b.id;

comment on view public.book_popularity is
  'Score de popularité : achats payés + lecteurs distincts. Réservée au serveur — les volumes de vente par titre sont commercialement sensibles.';

revoke all on public.book_popularity from anon, authenticated;
grant select on public.book_popularity to service_role;

-- ---------------------------------------------------------------------------
-- Requête de catalogue
-- ---------------------------------------------------------------------------

create function public.catalog_list(
  p_langue text default 'fr',
  p_recherche text default null,
  p_age_min smallint default null,
  p_age_max smallint default null,
  p_themes text[] default null,
  p_origine text default null,
  p_acces text default null,
  p_zone public.price_zone default 'international',
  p_tri text default 'nouveautes',
  p_page integer default 1,
  p_taille integer default 20,
  p_at timestamptz default public.app_now()
)
  returns table (
    book_id uuid,
    slug text,
    auteur text,
    illustrateur text,
    age_min smallint,
    age_max smallint,
    origine_culturelle text,
    themes text[],
    couverture_url text,
    inclus_abonnement boolean,
    disponible_achat boolean,
    gratuit boolean,
    publie_le timestamptz,
    titre text,
    resume text,
    nb_pages integer,
    langues text[],
    montant bigint,
    devise text,
    zone_prix public.price_zone,
    score_popularite bigint,
    total bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with requete as (
    select case when nullif(btrim(coalesce(p_recherche, '')), '') is null then null
                else websearch_to_tsquery('french', p_recherche) end as tsq
  ),
  parametres as (
    select fenetre_nouveaute_jours as fenetre from public.business_settings where id = 1
  ),
  -- Repli de zone : si le titre n'a pas de prix pour la zone demandée, on
  -- retombe sur la zone internationale plutôt que d'écarter le titre
  -- (docs/PLAN.md D4 point 8).
  prix as (
    select
      p.book_id,
      coalesce(demandee.montant, internationale.montant) as montant,
      coalesce(demandee.devise, internationale.devise) as devise,
      case when demandee.montant is not null then p_zone else 'international'::public.price_zone end as zone_prix
    from (select distinct book_id from public.book_prices) p
    left join public.book_prices demandee
      on demandee.book_id = p.book_id and demandee.zone = p_zone
    left join public.book_prices internationale
      on internationale.book_id = p.book_id and internationale.zone = 'international'
  ),
  base as (
    select
      b.id,
      b.slug,
      b.auteur,
      b.illustrateur,
      b.age_min,
      b.age_max,
      b.origine_culturelle,
      b.themes,
      b.couverture_url,
      b.inclus_abonnement,
      b.disponible_achat,
      b.gratuit,
      b.publie_le,
      t.titre,
      t.resume,
      t.nb_pages,
      array(
        select t2.langue from public.book_translations t2
        where t2.book_id = b.id and t2.statut = 'publie' order by t2.langue
      ) as langues,
      pr.montant,
      pr.devise,
      pr.zone_prix,
      pop.score as score_popularite,
      -- Pertinence : nulle en l'absence de recherche, pour que le tri demandé
      -- s'applique tel quel.
      case when r.tsq is null then 0
           else ts_rank(b.recherche, r.tsq) + ts_rank(t.recherche, r.tsq) end as pertinence
    from public.books b
    join public.book_translations t
      on t.book_id = b.id and t.langue = p_langue and t.statut = 'publie'
    left join prix pr on pr.book_id = b.id
    left join public.book_popularity pop on pop.book_id = b.id
    cross join requete r
    cross join parametres pa
    where b.statut = 'publie'
      -- Brouillons et titres archivés ne sortent JAMAIS du catalogue public.
      and (r.tsq is null or b.recherche @@ r.tsq or t.recherche @@ r.tsq)
      and (p_age_min is null or b.age_max is null or b.age_max >= p_age_min)
      and (p_age_max is null or b.age_min is null or b.age_min <= p_age_max)
      and (p_themes is null or b.themes && p_themes)
      and (p_origine is null or b.origine_culturelle ilike '%' || p_origine || '%')
      and (
        p_acces is null
        or (p_acces = 'gratuit' and b.gratuit)
        or (p_acces = 'achat' and b.disponible_achat)
        or (
          p_acces = 'abonnement'
          and b.inclus_abonnement
          and b.publie_le is not null
          -- « Accessible par abonnement » signifie accessible MAINTENANT :
          -- un titre encore dans sa fenêtre de vente ne l'est pas.
          and b.publie_le + make_interval(days => pa.fenetre) <= p_at
        )
      )
  ),
  compte as (select count(*) as total from base)
  select
    base.id,
    base.slug,
    base.auteur,
    base.illustrateur,
    base.age_min,
    base.age_max,
    base.origine_culturelle,
    base.themes,
    base.couverture_url,
    base.inclus_abonnement,
    base.disponible_achat,
    base.gratuit,
    base.publie_le,
    base.titre,
    base.resume,
    base.nb_pages,
    base.langues,
    base.montant,
    base.devise,
    base.zone_prix,
    base.score_popularite,
    compte.total
  from base cross join compte
  order by
    case when p_tri = 'pertinence' then base.pertinence end desc nulls last,
    case when p_tri = 'nouveautes' then base.publie_le end desc nulls last,
    case when p_tri = 'popularite' then base.score_popularite end desc nulls last,
    case when p_tri = 'prix' then base.montant end asc nulls last,
    case when p_tri = 'alphabetique' then base.titre end asc nulls last,
    -- Départage stable : sans lui, deux titres de même rang pourraient
    -- s'échanger d'une page à l'autre et apparaître en double.
    base.titre asc,
    base.id asc
  offset greatest(p_page - 1, 0) * p_taille
  limit p_taille;
$$;

comment on function public.catalog_list is
  'Liste du catalogue : recherche plein texte, filtres, tri, pagination et total en une seule passe. Réservée au serveur, qui y ajoute l''état d''accès de l''appelant.';

revoke all on function public.catalog_list from public, anon, authenticated;
grant execute on function public.catalog_list to service_role;
