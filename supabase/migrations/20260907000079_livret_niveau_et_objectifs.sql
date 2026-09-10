-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0079 — LE LIVRET DIT SON NIVEAU ET SES OBJECTIFS.                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Décision de l'éditeur du 7 septembre 2026.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ DEUX CHAMPS QUI NE VALENT QUE POUR UN SUPPORT — ET QUI RESTENT SUR       │
-- │ `books`.                                                                 │
-- │                                                                          │
-- │ Un conte n'a ni niveau scolaire ni objectifs pédagogiques ; un livret    │
-- │ n'existe pas sans eux. La tentation serait une table `livrets` à part.   │
-- │ On ne le fait pas, et pour la raison qui gouverne déjà `type_document` : │
-- │ le support est une ÉTIQUETTE DE RANGEMENT, pas une seconde nature. Une   │
-- │ table séparée obligerait `catalog_list`, `access_for_books` et les       │
-- │ écrans d'administration à connaître deux chemins — et `CLAUDE.md`        │
-- │ interdit précisément qu'une règle s'écrive deux fois.                    │
-- │                                                                          │
-- │ Les deux colonnes sont donc NULLABLES sur `books`, et nulles sur un      │
-- │ conte. Aucune contrainte ne les rend obligatoires sur un livret : elles  │
-- │ sont éditoriales, et un livret sans objectifs reste publiable — c'est le │
-- │ même arbitrage que `description`, ajoutée à la 0070.                     │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI SUR `books` ET NON SUR `book_translations`.                    │
-- │                                                                          │
-- │ `niveau` est une clé de RANGEMENT — « PS · MS · GS » désigne des classes │
-- │ de maternelle, pas une phrase à lire. Un regroupement qui changerait de  │
-- │ composition selon la langue consultée ne regrouperait rien : c'est le    │
-- │ raisonnement exact qui a mis `themes` sur `books` à la 0070.             │
-- │                                                                          │
-- │ `objectifs` est plus discutable : ce sont des phrases. Elles suivent     │
-- │ pourtant `niveau` sur `books`, parce qu'elles décrivent ce que le livret │
-- │ FAIT ACQUÉRIR — une propriété du support, énoncée par l'éditeur, et non  │
-- │ un texte de vitrine. Le texte destiné au lecteur, lui, reste `resume` et │
-- │ `description`, sur `book_translations`.                                  │
-- │                                                                          │
-- │ Si le jour vient où les objectifs doivent être traduits, ils            │
-- │ déménageront par une migration corrective. Les mettre en double          │
-- │ aujourd'hui coûterait plus cher que ce déménagement.                     │
-- └──────────────────────────────────────────────────────────────────────────┘

alter table public.books
  add column if not exists niveau text,
  add column if not exists objectifs text[] not null default '{}';

comment on column public.books.niveau is
  'Niveau scolaire visé par un livret pédagogique — « PS · MS · GS ». Nul sur un conte : la notion ne s''y applique pas. Saisie libre de l''éditeur, comme `themes` : aucune énumération, parce que les systèmes scolaires diffèrent d''un pays à l''autre et que la plateforme sert plusieurs pays.';

comment on column public.books.objectifs is
  'Ce que le livret fait acquérir, une phrase par objectif. Tableau vide par défaut, jamais nul : une liste vide se parcourt, un NULL demande une garde à chaque lecture.';

-- ══════════════════════════════════════════════════════════════════════════
-- `catalog_list` rend les deux nouvelles colonnes
-- ══════════════════════════════════════════════════════════════════════════
--
-- Le corps est repris à l'identique de la 0078 : seules les deux colonnes
-- s'ajoutent à la signature de retour et à la projection. Une migration
-- corrective ne profite pas du passage pour changer autre chose.

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
  p_maintenant timestamptz default null
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
  'Catalogue public paginé. Rend `niveau` et `objectifs` depuis la 0079 : ils ne valent que pour un livret pédagogique, et sont nuls ou vides sur un conte. La recherche est par PRÉFIXE depuis la 0078.';
