-- ---------------------------------------------------------------------------
-- LE CORPS D'UN CONTENU ACCEPTE DEUX MÉDIAS DE PLUS : VIDÉO ET AUDIO.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI DANS LE CORPS, ALORS QUE `video_url` EXISTE DÉJÀ.               │
-- │                                                                          │
-- │ `association_contents.video_url` porte LA vidéo d'un replay : une seule, │
-- │ à la place de l'article, avec sa durée. C'est le contenu lui-même.       │
-- │                                                                          │
-- │ Ce que la migration ajoute est autre chose : un média POSÉ DANS le       │
-- │ texte, entre deux paragraphes, comme une photo l'est déjà — le           │
-- │ témoignage d'une mère au milieu d'un récit de terrain, les trois         │
-- │ minutes d'un atelier au milieu d'un compte rendu. Sans lui, l'éditeur    │
-- │ n'a que deux issues : couper le média, ou le mettre en tête et faire     │
-- │ passer l'article pour un replay.                                         │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Sept types de blocs désormais :
--   intertitre  { "type": "intertitre", "texte": "…" }
--   paragraphe  { "type": "paragraphe", "texte": "…" }
--   liste       { "type": "liste",      "elements": ["…", "…"] }
--   citation    { "type": "citation",   "texte": "…" }
--   photo       { "type": "photo",      "url": "…", "legende": "…" }
--   video       { "type": "video",      "url": "…", "legende": "…" }
--   audio       { "type": "audio",      "url": "…", "legende": "…" }
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE QUE CETTE MIGRATION NE FAIT PAS : LIMITER LE NOMBRE DE VIDÉOS.        │
-- │                                                                          │
-- │ « Un replay ne porte qu'une vidéo » est une règle ÉDITORIALE, et elle    │
-- │ vit avec ses sœurs dans `/api/admin/association/redaction` — au même     │
-- │ endroit que « un replay ne se publie pas sans son lien » et « un article │
-- │ se publie avec au moins un paragraphe ».                                 │
-- │                                                                          │
-- │ Elle ne descend pas ici pour deux raisons. Elle ne protège aucune        │
-- │ donnée : un second lien de vidéo n'est pas incohérent, il est de trop.   │
-- │ Et elle croise DEUX tables — le type vit sur `association_contents`, le  │
-- │ corps sur `association_content_translations` — ce qu'une contrainte      │
-- │ `check` ne sait pas dire, et ce qu'un déclencheur dirait au prix d'un    │
-- │ verrou sur chaque écriture de l'une ou de l'autre.                       │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

/*
 * `create or replace` : même arité, même type de retour, donc un vrai
 * remplacement et non une surcharge. La contrainte `association_corps_en_blocs`
 * appelle cette fonction par son nom ; elle suit sans être retouchée.
 *
 * La règle ne se resserre pas, elle s'élargit : les lignes déjà en base
 * restent valides, et PostgreSQL n'a donc rien à revalider.
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
             ('intertitre', 'paragraphe', 'liste', 'citation', 'photo', 'video', 'audio')
          -- Un bloc de texte sans texte est un bloc vide : il occuperait une
          -- place à l'écran sans rien dire.
          or (b->>'type' in ('intertitre', 'paragraphe', 'citation')
              and length(btrim(coalesce(b->>'texte', ''))) = 0)
          or (b->>'type' = 'liste' and jsonb_typeof(b->'elements') <> 'array')
          -- Les trois médias suivent la même règle que la photo : sans
          -- adresse, le lecteur voit un cadre vide et croit au chargement
          -- qui n'est jamais arrivé.
          or (b->>'type' in ('photo', 'video', 'audio')
              and length(btrim(coalesce(b->>'url', ''))) = 0)
     );
$$;

comment on function public.corps_associatif_valide(jsonb) is
  'La forme d''un corps en blocs — sept types depuis la 0108. Appelée par la contrainte de `association_content_translations` : un bloc inconnu ne se rendrait nulle part, et son texte serait perdu sans bruit.';
