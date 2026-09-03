-- ═══════════════════════════════════════════════════════════════════════════
-- LA RÉGION QUITTE LE CATALOGUE PUBLIC. LE THÈME PREND SA PLACE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Décision de l'éditeur, 3 septembre 2026. Elle achève ce que la migration
-- 0066 avait commencé : celle-là avait retiré à la région le pouvoir de
-- BLOQUER une publication ; celle-ci lui retire sa place dans la recherche.
--
-- La raison est la même, et elle a mûri. Le catalogue porte deux supports
-- depuis la migration 0061, et une fiche d'activités n'a pas de région
-- d'origine. Une facette qui ne s'applique qu'à la moitié d'un catalogue
-- n'aide pas à chercher : elle fait disparaître l'autre moitié dès qu'on
-- clique dessus. Le THÈME, lui, vaut pour les deux supports — c'est ce qu'un
-- parent cherche (« le courage », « l'entraide ») et ce qu'un enseignant
-- prépare.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ CE QUI DISPARAÎT, ET CE QUI RESTE.                                      │
-- │                                                                         │
-- │ DISPARAÎT : le paramètre de filtre `p_region` de `catalog_list`, et la  │
-- │ facette `regions` de `catalog_facets`. Autrement dit, toute la surface  │
-- │ PUBLIQUE de la région.                                                  │
-- │                                                                         │
-- │ RESTE : la colonne `books.region`, l'énumération `region_conte` à cinq  │
-- │ valeurs, `region_depuis_origine`, et le paramètre `p_region` de         │
-- │ `admin_modifier_livre`.                                                 │
-- │                                                                         │
-- │ Ce n'est pas de la timidité, c'est la différence entre RETIRER UNE      │
-- │ FONCTION et DÉTRUIRE DES DONNÉES. Les cinq régions sont renseignées sur │
-- │ le corpus existant ; les effacer serait irréversible, et rendrait        │
-- │ impossible tout retour en arrière si l'éditeur change d'avis dans six    │
-- │ mois. Une colonne qui ne sert plus coûte un octet ; une donnée détruite  │
-- │ coûte le travail éditorial qui l'avait produite.                        │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ ET LA COULEUR ?                                                         │
-- │                                                                         │
-- │ Les cinq palettes du produit portent des noms de régions parce qu'elles │
-- │ ont été dessinées pour elles. Elles restent : ce sont des EMPLACEMENTS  │
-- │ de palette, pas des affirmations sur l'origine d'un conte. C'est        │
-- │ l'interface qui choisit désormais laquelle appliquer, à partir du       │
-- │ premier thème du titre — voir `src/components/motif/teinte.ts`. Rien de │
-- │ tout cela n'est une règle métier, et rien de tout cela n'appartient     │
-- │ donc à la base.                                                         │
-- └─────────────────────────────────────────────────────────────────────────┘

-- ---------------------------------------------------------------------------
-- 1. LE CATALOGUE
--
-- `drop` puis `create` : retirer un paramètre change la signature, et
-- `create or replace` ne remplace qu'à signature identique. Sans le `drop`, la
-- version à quatorze paramètres survivrait à côté de la nouvelle, et tout
-- appel par paramètres nommés deviendrait ambigu entre les deux.
--
-- Le corps est repris VERBATIM de la migration 0064. Une seule suppression :
-- le paramètre et sa ligne dans le `where`. `npm run diff:sql` doit donc ne
-- montrer que ces deux retraits.
-- ---------------------------------------------------------------------------

drop function if exists public.catalog_list(
  text, text, smallint, smallint, text[], text, public.region_conte,
  public.document_type, text, public.price_zone, text, integer, integer, timestamptz
);

create function public.catalog_list(
  p_langue text default 'fr',
  p_recherche text default null,
  p_age_min smallint default null,
  p_age_max smallint default null,
  p_themes text[] default null,
  p_origine text default null,
  p_type_document public.document_type default null,
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
    where b.statut = 'publie'
      -- Brouillons et titres archivés ne sortent JAMAIS du catalogue public.
      and (r.tsq is null or b.recherche @@ r.tsq or t.recherche @@ r.tsq)
      and (p_age_min is null or b.age_max is null or b.age_max >= p_age_min)
      and (p_age_max is null or b.age_min is null or b.age_min <= p_age_max)
      and (p_themes is null or b.themes && p_themes)
      and (p_origine is null or b.origine_culturelle ilike '%' || p_origine || '%')
      and (p_type_document is null or b.type_document = p_type_document)
      and (
        p_acces is null
        or (p_acces = 'gratuit' and b.gratuit)
        or (p_acces = 'achat' and b.disponible_achat)
        -- « Accessible par abonnement » n'a plus de condition de date : depuis
        -- la migration 0064, un titre inclus l'est dès sa publication. Le
        -- catalogue et `access_for_books` disent donc la même chose sans avoir
        -- à partager une fonction — il n'y a plus de règle à partager.
        or (p_acces = 'abonnement' and b.inclus_abonnement)
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
  'Catalogue publié, filtré et trié (§4.1 F2). Le filtre de région a été retiré le 3 septembre 2026 : il ne s''appliquait qu''aux contes, et faisait donc disparaître tous les livrets pédagogiques dès qu''on s''en servait. Le filtre de thèmes, lui, vaut pour les deux supports.';

revoke all on function public.catalog_list from public, anon, authenticated;
grant execute on function public.catalog_list to service_role;

-- ---------------------------------------------------------------------------
-- 2. LES FACETTES
--
-- Même signature, donc `create or replace` suffit. Corps repris VERBATIM de la
-- migration 0063, moins la clé `regions`.
--
-- Une facette qu'on cesse de rendre ne casse pas l'interface : un écran qui
-- lirait encore `facettes.regions` obtiendrait `undefined` et n'afficherait
-- aucune pastille. Mais le TYPE généré, lui, cesse de la porter — et c'est le
-- typecheck qui va nommer les écrans à corriger, un par un, plutôt que la
-- production.
-- ---------------------------------------------------------------------------

create or replace function public.catalog_facets(p_langue text default 'fr')
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'types', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', d.type_document, 'nombre', d.n) order by d.n desc, d.type_document)
      from (
        select b.type_document::text as type_document, count(*)::int as n
        from public.books b
        where b.statut = 'publie'
        group by b.type_document
      ) d
    ), '[]'::jsonb),

    'themes', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', t.theme, 'nombre', t.n) order by t.n desc, t.theme)
      from (
        select unnest(b.themes) as theme, count(*)::int as n
        from public.books b
        where b.statut = 'publie'
        group by 1
      ) t
    ), '[]'::jsonb),

    'origines', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', o.origine, 'nombre', o.n) order by o.n desc, o.origine)
      from (
        select b.origine_culturelle as origine, count(*)::int as n
        from public.books b
        where b.statut = 'publie' and b.origine_culturelle is not null
        group by 1
      ) o
    ), '[]'::jsonb),

    -- Les bornes reelles, pour que le curseur d'age ne propose pas un intervalle
    -- ou aucun titre ne se trouve.
    'age', (
      select jsonb_build_object('min', min(b.age_min), 'max', max(b.age_max))
      from public.books b where b.statut = 'publie'
    ),

    'langues', coalesce((
      select jsonb_agg(distinct bt.langue)
      from public.book_translations bt
      join public.books b on b.id = bt.book_id
      where bt.statut = 'publie' and b.statut = 'publie'
    ), '[]'::jsonb),

    'total', (select count(*)::int from public.books where statut = 'publie')
  );
$fn$;

comment on function public.catalog_facets(text) is
  'Valeurs de filtre REELLEMENT presentes au catalogue publie, avec leur effectif — types de document, themes, origines, ages, langues. La facette des regions a ete retiree le 3 septembre 2026 avec le filtre correspondant. Les pastilles de l''interface en decoulent, jamais d''une liste ecrite en dur.';

revoke all on function public.catalog_facets(text) from public;
grant execute on function public.catalog_facets(text) to service_role, anon, authenticated;
