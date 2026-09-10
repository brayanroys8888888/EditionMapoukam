-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0078 — LA RECHERCHE REPOND PENDANT QU'ON TAPE.                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE DEFAUT : « pe » NE TROUVAIT PAS « PETIT BAOBAB ».                    │
-- │                                                                          │
-- │ `websearch_to_tsquery('french', 'pe')` produit le lexeme `pe`, et `@@`   │
-- │ compare des lexemes ENTIERS : `pe` n'est pas `petit`. La recherche ne    │
-- │ rendait donc rien tant que le mot n'etait pas ecrit en entier, ce qui    │
-- │ vide la grille a chaque frappe et donne l'impression d'un catalogue      │
-- │ vide.                                                                     │
-- │                                                                          │
-- │ C'est le comportement normal du plein texte, et le mauvais pour un champ │
-- │ qui filtre pendant la frappe — ce que `11-realtime-behaviour.md` demande │
-- │ et que l'interface fait deja cote client.                                │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE QUI CHANGE, ET RIEN D'AUTRE.                                         │
-- │                                                                          │
-- │ Seule l'expression `tsq` est reecrite. La signature, les colonnes        │
-- │ rendues, les filtres, le tri, la pagination et le `security definer`     │
-- │ sont repris a l'identique de la 0071 : une migration corrective ne       │
-- │ profite pas du passage pour changer autre chose.                          │
-- │                                                                          │
-- │ Chaque lexeme de la saisie recoit `:*`, l'operateur de PREFIXE de        │
-- │ Postgres, et ils sont joints par `&` — « pe ba » trouve donc un titre    │
-- │ qui contient a la fois un mot commencant par « pe » et un mot commencant │
-- │ par « ba ». C'est la semantique de `websearch_to_tsquery` pour plusieurs │
-- │ mots, conservee.                                                          │
-- │                                                                          │
-- │ Le passage par `to_tsvector` n'est pas un detour : c'est lui qui applique │
-- │ la meme normalisation que l'index — memes regles de decoupage, memes     │
-- │ mots vides. Decouper la saisie a la main aurait produit des lexemes que  │
-- │ l'index ne connait pas.                                                   │
-- └──────────────────────────────────────────────────────────────────────────┘

create or replace function public.catalog_list(
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
               -- Repli : une saisie faite de mots vides ne produit aucun
               -- lexeme, et `string_agg` rend NULL. On retombe alors sur la
               -- requete plein texte d'origine, qui ne trouve rien — plutot
               -- que sur une requete nulle, qui rendrait TOUT le catalogue.
               websearch_to_tsquery('french', p_recherche)
             )
           end as tsq
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
