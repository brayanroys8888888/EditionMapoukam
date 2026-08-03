-- ---------------------------------------------------------------------------
-- La cle de comparaison replie aussi les ACCENTS
--
-- +--------------------------------------------------------------------------+
-- | TROISIEME OCCURRENCE DE LA MEME CLASSE, EN DEUX HEURES.                  |
-- |                                                                          |
-- |   1. « Afrique de l'Ouest » : apostrophe droite contre typographique.    |
-- |   2. « Cote d'Ivoire » : la meme, plus l'accent circonflexe du « o ».    |
-- |                                                                          |
-- | `sans_apostrophe` repliait les apostrophes et pas les accents, si bien   |
-- | que « Côte d'Ivoire » ne trouvait aucune region. Le defaut se deplace    |
-- | d'un caractere a chaque fois qu'on ne ferme qu'un caractere.             |
-- +--------------------------------------------------------------------------+
--
-- +--------------------------------------------------------------------------+
-- | POURQUOI `translate` ET NON `unaccent`.                                  |
-- |                                                                          |
-- | La migration 0024 a deja tranche ce point pour la detection de           |
-- | « À renseigner » : « l'extension n'est pas installee, et l'ajouter pour  |
-- | cette seule comparaison couterait plus qu'elle ne rapporte ». La         |
-- | decision tenait a l'EXTENSION, pas au repliement lui-meme.               |
-- |                                                                          |
-- | `translate` est integre a PostgreSQL, n'ajoute aucune dependance, et     |
-- | couvre le latin accentue — c'est-a-dire tout ce qu'un catalogue          |
-- | francophone ecrira. La decision de 0024 est donc respectee, et le defaut |
-- | ferme.                                                                    |
-- +--------------------------------------------------------------------------+
-- ---------------------------------------------------------------------------

create or replace function public.sans_apostrophe(p_texte text)
  returns text
  language sql
  immutable
  set search_path = public, pg_temp
as $fn$
  select translate(
    lower(regexp_replace(coalesce(p_texte, ''), '[' || chr(39) || chr(8217) || ']', '', 'g')),
    'àáâãäåèéêëìíîïòóôõöùúûüçñ',
    'aaaaaaeeeeiiiiooooouuuucn'
  );
$fn$;

comment on function public.sans_apostrophe(text) is
  'Cle de comparaison : minuscules, apostrophes (droites ET typographiques) retirees, accents latins replies. Trois occurrences du meme defaut ont motive chacune de ces trois normalisations.';
