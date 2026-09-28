-- ---------------------------------------------------------------------------
-- LE CORPS D'UN CONTENU PASSE DES SECTIONS AUX BLOCS.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI CHANGER UN MODÈLE QUI MARCHE.                                   │
-- │                                                                          │
-- │ `corps` portait des SECTIONS : `{titre, paragraphes[], points[]}`. Le    │
-- │ modèle tient pour un article sage, et il a servi huit contenus. Il ne    │
-- │ sait pas dire deux choses que le document du 28 septembre exige : une    │
-- │ CITATION, et une PHOTO AVEC SA LÉGENDE. Il en interdit une troisième —   │
-- │ un paragraphe ne peut pas exister hors d'une section, donc un article    │
-- │ ne peut pas commencer par du texte.                                      │
-- │                                                                          │
-- │ Un éditeur par blocs ne peut pas produire ce que le modèle ne porte pas. │
-- │ Le convertir maintenant coûte vingt-deux sections ; le convertir après   │
-- │ l'écran coûterait l'écran.                                               │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Cinq types de blocs, et pas un de plus :
--   intertitre  { "type": "intertitre", "texte": "…" }
--   paragraphe  { "type": "paragraphe", "texte": "…" }
--   liste       { "type": "liste",      "elements": ["…", "…"] }
--   citation    { "type": "citation",   "texte": "…" }
--   photo       { "type": "photo",      "url": "…", "legende": "…" }
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La conversion — l'ordre de lecture est préservé
-- ---------------------------------------------------------------------------

/*
 * Chaque section devient : son titre en intertitre (s'il y en a un), puis ses
 * paragraphes un par un, puis ses points en une liste. C'est exactement
 * l'ordre dans lequel l'article se lisait ; aucun texte ne bouge, aucun ne se
 * perd.
 */
with blocs as (
  select
    t.id,
    jsonb_agg(z.bloc order by s.ord, z.rang) as corps
  from public.association_content_translations t
  cross join lateral jsonb_array_elements(t.corps) with ordinality as s(section, ord)
  cross join lateral (
    select jsonb_build_object('type', 'intertitre', 'texte', btrim(s.section->>'titre')) as bloc,
           0 as rang
    where length(btrim(coalesce(s.section->>'titre', ''))) > 0

    union all

    select jsonb_build_object('type', 'paragraphe', 'texte', p.valeur), 1 + p.ord::int
    from jsonb_array_elements_text(
           case when jsonb_typeof(s.section->'paragraphes') = 'array'
                then s.section->'paragraphes' else '[]'::jsonb end
         ) with ordinality as p(valeur, ord)

    union all

    select jsonb_build_object('type', 'liste', 'elements', s.section->'points'), 100000
    where jsonb_typeof(s.section->'points') = 'array'
      and jsonb_array_length(s.section->'points') > 0
  ) z
  group by t.id
)
update public.association_content_translations t
set corps = blocs.corps
from blocs
where blocs.id = t.id;

-- ---------------------------------------------------------------------------
-- 2. La forme est vérifiée EN BASE
-- ---------------------------------------------------------------------------

/*
 * Une contrainte `check` ne peut pas porter de sous-requête ; elle appelle
 * donc une fonction `immutable`, ce qui est la seule façon d'exprimer
 * « chaque élément du tableau ressemble à un bloc connu ».
 *
 * Pourquoi la vérifier du tout : ce `jsonb` est écrit par un écran, lu par un
 * autre, et un bloc de type inconnu ne casse RIEN — il disparaît
 * silencieusement au rendu. Le texte serait en base, invisible, et personne
 * ne saurait qu'il manque.
 */
create or replace function public.corps_associatif_valide(p_corps jsonb)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select jsonb_typeof(p_corps) = 'array'
     and not exists (
       select 1
       from jsonb_array_elements(p_corps) b
       where jsonb_typeof(b) <> 'object'
          or coalesce(b->>'type', '') not in
             ('intertitre', 'paragraphe', 'liste', 'citation', 'photo')
          -- Un bloc de texte sans texte est un bloc vide : il occuperait une
          -- place à l'écran sans rien dire.
          or (b->>'type' in ('intertitre', 'paragraphe', 'citation')
              and length(btrim(coalesce(b->>'texte', ''))) = 0)
          or (b->>'type' = 'liste' and jsonb_typeof(b->'elements') <> 'array')
          or (b->>'type' = 'photo' and length(btrim(coalesce(b->>'url', ''))) = 0)
     );
$$;

comment on function public.corps_associatif_valide(jsonb) is
  'La forme d''un corps en blocs. Appelée par la contrainte de `association_content_translations` : un bloc inconnu ne se rendrait nulle part, et son texte serait perdu sans bruit.';

alter table public.association_content_translations
  add constraint association_corps_en_blocs check (public.corps_associatif_valide(corps));
