-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0083 — LE NIVEAU DEVIENT UNE CLÉ DE RECHERCHE.                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Décision de l'éditeur du 7 septembre 2026 : « les filtres des livrets ne
-- doivent pas être les mêmes que ceux des contes ».
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI LE RAYON DES LIVRETS NE SE FILTRE PAS COMME LE CATALOGUE.       │
-- │                                                                          │
-- │ La maquette est explicite : le catalogue offre thèmes, âge, accès et     │
-- │ tri ; le rayon des livrets n'offre QU'UNE recherche et des pastilles de  │
-- │ NIVEAU. Ce n'est pas une simplification de confort, c'est la même        │
-- │ logique qui a fait sortir la région du catalogue à la 0071 : une facette │
-- │ qui ne s'applique qu'à une partie du fonds ne fait pas chercher, elle    │
-- │ fait disparaître le reste.                                              │
-- │                                                                          │
-- │ Le niveau est le symétrique exact. Il ne veut rien dire sur un conte —   │
-- │ la colonne y est nulle — et il est LA question qu'on se pose devant un   │
-- │ livret : « est-ce pour ma classe ? ». Il n'a donc sa place que sur ce    │
-- │ rayon-là, et il y a toute sa place.                                     │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LA FACETTE COMPTE DES NIVEAUX, PAS DES CHAÎNES.                         │
-- │                                                                          │
-- │ `books.niveau` est de la saisie libre et COMPOSÉE : « PS · MS · GS »     │
-- │ désigne trois classes, pas une. Une facette bâtie sur la colonne telle   │
-- │ quelle rendrait une pastille « PS · MS · GS » et une autre « MS · GS » — │
-- │ deux boutons qui se recouvrent, et aucun moyen de demander « tout ce qui │
-- │ convient à des MS ».                                                     │
-- │                                                                          │
-- │ La facette éclate donc sur le point médian et compte les JETONS. C'est   │
-- │ ce que la maquette dessine : « Tous les niveaux · PS · MS · GS · CP ».   │
-- │                                                                          │
-- │ Le séparateur est ` · `, celui que l'éditeur emploie déjà et que la      │
-- │ fiche d'administration lui montre en aide de saisie. Un titre saisi sans │
-- │ séparateur reste un jeton entier — il n'est jamais perdu.                │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- La signature de `catalog_list` est REPRISE du texte que la base rend, avec le
-- seul paramètre nouveau ajouté EN FIN de liste. Elle n'est pas retapée : la
-- 0079 avait retapé celle-là même et renommé `book_id` en `id` au passage, ce
-- qui a rendu tout le catalogue muet — le client mappe par position, et aucune
-- erreur n'est levée.

-- ══════════════════════════════════════════════════════════════════════════
-- Éclater un niveau composé en ses jetons — UNE implémentation
-- ══════════════════════════════════════════════════════════════════════════
--
-- Elle est appelée par la facette ET par le filtre. Écrite deux fois, elle
-- aurait divergé sur le premier séparateur exotique, et c'est toujours la
-- copie qu'on ne regarde pas qui décide de ce que le lecteur voit.

create or replace function public.niveaux_du_livre(p_niveau text)
  returns text[]
  language sql
  immutable
  set search_path = public, pg_temp
as $$
  select coalesce(
    (select array_agg(btrim(j) order by btrim(j))
       from unnest(string_to_array(coalesce(p_niveau, ''), '·')) as j
      where length(btrim(j)) > 0),
    '{}'::text[]
  );
$$;

comment on function public.niveaux_du_livre is
  'Eclate un niveau compose — « PS · MS · GS » — en ses jetons. Unique implementation, appelee par `catalog_facets` et par `catalog_list`.';

-- ══════════════════════════════════════════════════════════════════════════
-- `catalog_facets` rend la facette `niveaux`
-- ══════════════════════════════════════════════════════════════════════════
--
-- Elle ne compte QUE les livrets : un conte n'a pas de niveau, et l'inclure
-- ferait un dénominateur qui ne veut rien dire. La clé existe toujours, même
-- vide — un tableau vide se parcourt, un `null` demande une garde à chaque
-- lecture.

create or replace function public.catalog_facets(p_langue text default 'fr'::text)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $function$
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

    -- La facette des NIVEAUX — 0083. Ordonnee par EFFECTIF puis par nom, comme
    -- les themes : l'ordre scolaire (PS, MS, GS, CP) n'est pas connu de la
    -- base, qui ne porte aucune enumeration — et l'inventer ici figerait un
    -- systeme scolaire alors que la plateforme en sert plusieurs.
    'niveaux', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', n.niveau, 'nombre', n.n) order by n.n desc, n.niveau)
      from (
        select unnest(public.niveaux_du_livre(b.niveau)) as niveau, count(*)::int as n
        from public.books b
        where b.statut = 'publie' and b.type_document = 'livret_pedagogique'
        group by 1
      ) n
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
$function$;

comment on function public.catalog_facets is
  'Facettes du catalogue public. Rend `niveaux` depuis la 0083 : elle ne compte que les livrets pedagogiques, seul support ou la notion existe.';

-- ══════════════════════════════════════════════════════════════════════════
-- `catalog_list` accepte `p_niveau`
-- ══════════════════════════════════════════════════════════════════════════

drop function if exists public.catalog_list(
  text, text, smallint, smallint, text[], text,
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
  p_taille integer default 24,
  p_maintenant timestamptz default null,
  p_niveau text default null
)
  returns table (
    id uuid,
    slug text,
    type_document public.document_type,
    auteur text,
    illustrateur text,
    age_min smallint,
    age_max smallint,
    origine_culturelle text,
    themes text[],
    niveau text,
    objectifs text[],
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
    select case
             when nullif(btrim(coalesce(p_recherche, '')), '') is null then null
             else coalesce(
               -- Chaque lexeme devient un PREFIXE : « pe » trouve « petit ».
               to_tsquery(
                 'french',
                 (select string_agg(lexeme || ':*', ' & ')
                    from unnest(
                           tsvector_to_array(to_tsvector('french', p_recherche))
                         ) as lexeme)
               ),
               websearch_to_tsquery('french', p_recherche)
             )
           end as tsq
  ),
  prix as (
    select p.book_id, p.montant, p.devise, p.zone as zone_prix
    from public.book_prices p
    where p.zone = p_zone
  ),
  base as (
    select
      b.id,
      b.slug,
      b.type_document,
      b.auteur,
      b.illustrateur,
      b.age_min,
      b.age_max,
      b.origine_culturelle,
      b.themes,
      b.niveau,
      b.objectifs,
      b.couverture_url,
      b.inclus_abonnement,
      b.disponible_achat,
      b.gratuit,
      b.publie_le,
      t.titre,
      t.resume,
      t.nb_pages,
      (
        select array_agg(t2.langue order by t2.langue)
        from public.book_translations t2
        where t2.book_id = b.id and t2.statut = 'publie'
      ) as langues,
      pr.montant,
      pr.devise,
      pr.zone_prix,
      pop.score as score_popularite,
      case when r.tsq is null then 0
           else ts_rank(b.recherche, r.tsq) + ts_rank(t.recherche, r.tsq) end as pertinence
    from public.books b
    join public.book_translations t
      on t.book_id = b.id and t.langue = p_langue and t.statut = 'publie'
    left join prix pr on pr.book_id = b.id
    left join public.book_popularity pop on pop.book_id = b.id
    cross join requete r
    where b.statut = 'publie'
      and b.publie_le is not null
      and b.publie_le <= coalesce(p_maintenant, public.app_now())
      and (p_age_min is null or b.age_max >= p_age_min)
      and (p_age_max is null or b.age_min <= p_age_max)
      and (p_themes is null or b.themes && p_themes)
      and (p_origine is null or b.origine_culturelle ilike '%' || p_origine || '%')
      and (p_type_document is null or b.type_document = p_type_document)
      -- Le NIVEAU se compare au JETON, jamais a la chaine entiere : demander
      -- « MS » doit rendre « PS · MS · GS » comme « MS · GS ».
      and (
        p_niveau is null
        or btrim(p_niveau) = any (public.niveaux_du_livre(b.niveau))
      )
      and (
        p_acces is null
        or (p_acces = 'gratuit' and b.gratuit)
        or (p_acces = 'abonnement' and b.inclus_abonnement)
        or (p_acces = 'achat' and b.disponible_achat)
      )
      and (r.tsq is null or b.recherche @@ r.tsq or t.recherche @@ r.tsq)
  )
  select
    base.id,
    base.slug,
    base.type_document,
    base.auteur,
    base.illustrateur,
    base.age_min,
    base.age_max,
    base.origine_culturelle,
    base.themes,
    base.niveau,
    base.objectifs,
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
    count(*) over () as total
  from base
  order by
    case when p_tri = 'pertinence' then base.pertinence end desc nulls last,
    case when p_tri = 'popularite' then base.score_popularite end desc nulls last,
    case when p_tri = 'alphabetique' then base.titre end asc,
    case when p_tri = 'prix' then base.montant end asc nulls last,
    case when p_tri = 'nouveautes' then base.publie_le end desc,
    base.publie_le desc,
    base.id asc
  offset greatest(p_page - 1, 0) * p_taille
  limit p_taille;
$$;

comment on function public.catalog_list is
  'Catalogue public pagine. Rend `niveau` et `objectifs` depuis la 0079, la recherche est par PREFIXE depuis la 0078, et `p_niveau` filtre au JETON depuis la 0083.';

-- PostgREST garde en cache la signature d'une fonction supprimee puis recreee.
notify pgrst, 'reload schema';
