-- ═══════════════════════════════════════════════════════════════════════════
-- FILTRE PAR RÉGION — le manque que l'étape F4 a trouvé.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `catalog_facets` (migration 0050) rend les régions AVEC LEUR EFFECTIF, ce qui
-- n'a d'usage que pour des pastilles de filtre. `catalog_list` n'avait pourtant
-- aucun paramètre de région : la facette était livrée sans consommateur.
--
-- Pire que refusé, `?region=sahel` était SILENCIEUSEMENT IGNORÉ — les schémas
-- Zod retirent les clés inconnues. Une URL partagée avec un filtre de région
-- rendait donc le catalogue entier, sans que rien ne le signale. C'est la
-- forme d'URL qu'un test de l'étape F2 employait déjà en exemple.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI UN « drop » ET NON UN SIMPLE « create or replace ».            │
-- │                                                                         │
-- │ « create or replace » ne remplace qu'à signature identique. Ajouter un   │
-- │ paramètre créerait une SURCHARGE, et tout appel par paramètres nommés    │
-- │ deviendrait ambigu entre les deux — c'est-à-dire une erreur à            │
-- │ l'exécution, sur le catalogue entier.                                   │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Le corps est une EXTRACTION VERBATIM de la migration 0033, produite par
-- script (docs/PLAN.md §5 decies). Deux modifications, et deux seulement : le
-- paramètre, et sa clause dans le « where » existant. « npm run diff:sql »
-- doit donc montrer exactement ces deux ajouts, et rien d'autre.

drop function if exists public.catalog_list(
  text, text, smallint, smallint, text[], text, text,
  public.price_zone, text, integer, integer, timestamptz
);

create or replace function public.catalog_list(
  p_langue text default 'fr',
  p_recherche text default null,
  p_age_min smallint default null,
  p_age_max smallint default null,
  p_themes text[] default null,
  p_origine text default null,
  p_region public.region_conte default null,
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
  -- AUCUN REPLI DE ZONE : la zone demandée, ou aucun prix.
  --
  -- Annoncer « 4,99 € » à un visiteur de la zone Afrique parce que le titre n'a
  -- pas de prix local serait une substitution silencieuse de devise — et le
  -- panier refuserait ensuite ce même titre, la tarification n'admettant plus
  -- ce repli. Le titre reste LISTÉ, simplement sans montant : il peut être
  -- lisible par abonnement.
  prix as (
    select p.book_id, p.montant, p.devise, p.zone as zone_prix
    from public.book_prices p
    where p.zone = p_zone
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
      and (p_region is null or b.region = p_region)
      and (
        p_acces is null
        or (p_acces = 'gratuit' and b.gratuit)
        or (p_acces = 'achat' and b.disponible_achat)
        or (
          p_acces = 'abonnement'
          and b.inclus_abonnement
          -- « Accessible par abonnement » signifie accessible MAINTENANT :
          -- un titre encore dans sa fenêtre de vente ne l'est pas. Même
          -- implémentation que `access_for_books`, pour que le catalogue ne
          -- puisse pas montrer une porte que l'accès refuse d'ouvrir.
          and public.fenetre_de_vente_ecoulee(b.publie_le, pa.fenetre, p_at)
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
  'Catalogue publié, filtré et trié (§4.1 F2). Le filtre de région comble la facette rendue par catalog_facets, restée sans consommateur depuis la migration 0050.';

revoke all on function public.catalog_list from public, anon, authenticated;
grant execute on function public.catalog_list to service_role;
