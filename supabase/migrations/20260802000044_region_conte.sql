-- ---------------------------------------------------------------------------
-- `books.region` — enumeration a cinq valeurs, qui pilote la couleur
--
-- +--------------------------------------------------------------------------+
-- | DEUX CHAMPS, ET LA DISTINCTION EST TOUT LE SUJET.                        |
-- |                                                                          |
-- | `origine_culturelle` reste du TEXTE LIBRE. La specification la definit   |
-- | comme « pays / peuple / tradition », et la fiche livre affiche « Conte    |
-- | akan — Ghana » : cela n'entre pas dans cinq valeurs, et c'est la finesse  |
-- | editoriale qui distingue cette plateforme.                                |
-- |                                                                          |
-- | `region` est une ENUMERATION FERMEE. Elle ne sert qu'a une chose :       |
-- | choisir une couleur. C'est pourquoi elle peut etre close, quand l'autre   |
-- | ne le peut pas.                                                          |
-- +--------------------------------------------------------------------------+
--
-- +--------------------------------------------------------------------------+
-- | POURQUOI DES CLES ASCII ET NON LES LIBELLES D'AFFICHAGE.                 |
-- |                                                                          |
-- | Le defaut qui a motive cette migration est une APOSTROPHE : le corpus     |
-- | ecrivait « Afrique de l'Ouest » avec une apostrophe droite, un test avec  |
-- | une apostrophe typographique. Deux chaines distinctes pour la meme        |
-- | region, sans que rien ne le signale.                                      |
-- |                                                                          |
-- | Stocker `afrique_ouest` rend cette classe de defaut IMPOSSIBLE : la cle  |
-- | ne contient aucun caractere qui puisse s'ecrire de deux facons. Les       |
-- | libelles vivent dans les fichiers de traduction du frontend, ou ils sont  |
-- | de toute facon differents en francais et en anglais.                      |
-- +--------------------------------------------------------------------------+
--
-- Ajouter une sixieme region est un `alter type ... add value`, operation
-- triviale en PostgreSQL. Le cout de la fermeture est faible ; celui de
-- l'ouverture etait une couleur qui ment.
-- ---------------------------------------------------------------------------

create type public.region_conte as enum (
  'afrique_ouest',
  'sahel',
  'afrique_centrale',
  'afrique_australe',
  'afrique_est'
);

alter table public.books add column region public.region_conte;

comment on column public.books.region is
  'Region du conte, enumeration fermee. Pilote la couleur d''affichage, et rien d''autre. Distincte de origine_culturelle, qui reste du texte libre.';

create index books_region_idx on public.books (region) where statut = 'publie';

-- ---------------------------------------------------------------------------
-- Alignement du corpus
--
-- Le rapprochement des DEUX orthographes existantes se fait ici, et une seule
-- fois : la comparaison tolere les deux apostrophes, l'accentuation et la
-- casse. Apres cette migration, plus personne ne compare `origine_culturelle`
-- pour egalite.
-- ---------------------------------------------------------------------------

update public.books
   set region = case
     when lower(regexp_replace(coalesce(origine_culturelle, ''), '[''\u2019]', '', 'g')) like '%ouest%'
       then 'afrique_ouest'::public.region_conte
     when lower(coalesce(origine_culturelle, '')) like '%sahel%'
       then 'sahel'::public.region_conte
     when lower(coalesce(origine_culturelle, '')) like '%central%'
       then 'afrique_centrale'::public.region_conte
     when lower(coalesce(origine_culturelle, '')) like '%austral%'
       then 'afrique_australe'::public.region_conte
     when lower(regexp_replace(coalesce(origine_culturelle, ''), '[''\u2019]', '', 'g')) like '%est%'
       then 'afrique_est'::public.region_conte
     else null
   end
 where region is null;

-- ---------------------------------------------------------------------------
-- La region devient exigible a la PUBLICATION
--
-- La fonction ci-dessous est une EXTRACTION VERBATIM de la migration 0024,
-- obtenue par script (docs/PLAN.md §5 decies). Un seul bloc `union all` y est
-- ajoute, plus `create` -> `create or replace` ; `npm run diff:sql` le montre.
--
-- Le choix de la publication et non d'une contrainte `not null` est celui de
-- toute la chaine depuis l'arbitrage du 29 juillet : INGESTION PERMISSIVE,
-- PUBLICATION STRICTE. Un PDF depose ne connait pas sa region ; c'est
-- l'editeur qui la pose, et rien ne doit l'empecher de deposer d'abord.
-- ---------------------------------------------------------------------------

create or replace function public.manques_pour_publication(p_book_id uuid)
  returns text[]
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select coalesce(array_agg(manque order by manque), '{}')
  from (
    select 'auteur' as manque
    from public.books b
    where b.id = p_book_id
      and (
        b.auteur is null
        or btrim(b.auteur) = ''
        -- La valeur que pose l'ingestion quand le PDF ne porte pas d'auteur.
        --
        -- Les variantes sont énumérées plutôt que repliées par `unaccent` :
        -- l'extension n'est pas installée, et l'ajouter pour cette seule
        -- comparaison coûterait plus qu'elle ne rapporte. La liste couvre les
        -- deux orthographes plausibles, casse indifférente.
        --
        -- Un test vérifie que la constante `AUTEUR_A_RENSEIGNER` du code
        -- applicatif figure bien parmi ces valeurs : sans lui, changer l'une
        -- sans l'autre rouvrirait la porte en silence.
        or lower(btrim(b.auteur)) in ('à renseigner', 'a renseigner')
      )

    union all

    select 'origine_culturelle'
    from public.books b
    where b.id = p_book_id
      and (b.origine_culturelle is null or btrim(b.origine_culturelle) = '')

    union all

    -- La REGION, qui pilote la couleur d'affichage. Distincte de
    -- `origine_culturelle`, qui reste du texte libre et porte la finesse
    -- editoriale (« conte akan — Ghana »). Un titre publie sans region
    -- s'afficherait sans couleur, ou pire avec une couleur de repli qui
    -- mentirait sur son origine.
    select 'region'
    from public.books b
    where b.id = p_book_id
      and b.region is null

    union all

    select 'age'
    from public.books b
    where b.id = p_book_id
      and (b.age_min is null or b.age_max is null)

    union all

    -- Un prix manquant dans une zone active. Le manque nomme la zone : dire
    -- « prix manquant » sans préciser laquelle obligerait l'éditeur à chercher.
    select 'prix_' || z.zone::text
    from public.books b
    cross join public.active_price_zones z
    where b.id = p_book_id
      and b.disponible_achat
      and z.active
      and not exists (
        select 1 from public.book_prices p
        where p.book_id = b.id and p.zone = z.zone
      )
  ) as manques;
$$;
