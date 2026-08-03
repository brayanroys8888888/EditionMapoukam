-- ---------------------------------------------------------------------------
-- `region_depuis_origine` — une seule implementation du mappage
--
-- +--------------------------------------------------------------------------+
-- | POURQUOI UNE FONCTION PLUTOT QU'UN `UPDATE` RECOPIE.                     |
-- |                                                                          |
-- | Le mappage « origine editoriale -> region » est necessaire a DEUX        |
-- | endroits : la migration qui aligne l'existant, et le jeu de donnees de   |
-- | demonstration que `db:reset` rejoue. Deux copies, c'est exactement la    |
-- | classe de defaut recensee en §5 quinquies — et il serait cocasse de la   |
-- | reintroduire dans la migration meme qui la corrige.                      |
-- |                                                                          |
-- | Le mappage vit donc ici, une fois. La migration 0045 l'a precede et      |
-- | reste telle quelle : une migration appliquee ne se modifie jamais.       |
-- +--------------------------------------------------------------------------+
--
-- Cette fonction ne sert QU'A l'amorcage et a la reprise de donnees. En
-- exploitation, la region est posee par l'editeur depuis l'administration :
-- deviner « Ghana -> afrique_ouest » est acceptable pour un jeu de
-- demonstration, jamais pour une decision editoriale.
-- ---------------------------------------------------------------------------

-- Normalisation partagee : minuscules, sans apostrophe d'aucune sorte.
create function public.sans_apostrophe(p_texte text)
  returns text
  language sql
  immutable
  set search_path = public, pg_temp
as $fn$
  select lower(regexp_replace(coalesce(p_texte, ''), '[' || chr(39) || chr(8217) || ']', '', 'g'));
$fn$;

create function public.region_depuis_origine(p_origine text)
  returns public.region_conte
  language sql
  immutable
  set search_path = public, pg_temp
as $fn$
  select case
    -- Les apostrophes sont retirees AVANT toute comparaison : c'est le defaut
    -- qui a motive toute cette migration. « Cote d'Ivoire » s'ecrit avec une
    -- apostrophe droite ou typographique selon qui l'a saisi.
    when public.sans_apostrophe(p_origine) in
         ('ghana', 'cote divoire', 'benin', 'senegal', 'mali', 'nigeria')
      or public.sans_apostrophe(p_origine) like '%ouest%'
      then 'afrique_ouest'::public.region_conte

    when public.sans_apostrophe(p_origine) in
         ('burkina faso', 'niger', 'tchad', 'mauritanie')
      or public.sans_apostrophe(p_origine) like '%sahel%'
      then 'sahel'::public.region_conte

    when public.sans_apostrophe(p_origine) in
         ('cameroun', 'bassin du congo', 'gabon', 'congo')
      or public.sans_apostrophe(p_origine) like '%central%'
      then 'afrique_centrale'::public.region_conte

    when public.sans_apostrophe(p_origine) in
         ('afrique du sud', 'zimbabwe', 'namibie', 'botswana')
      or public.sans_apostrophe(p_origine) like '%austral%'
      then 'afrique_australe'::public.region_conte

    when public.sans_apostrophe(p_origine) in
         ('kenya', 'tanzanie', 'ethiopie', 'somalie')
      or public.sans_apostrophe(p_origine) like '%corne de l%'
      -- `est` en DERNIER : « ouest » le contient, et serait capte a tort si
      -- cette branche passait avant. L'ordre est la correction, pas un detail.
      or public.sans_apostrophe(p_origine) like '%est%'
      then 'afrique_est'::public.region_conte

    else null
  end;
$fn$;

comment on function public.region_depuis_origine(text) is
  'Devine la region depuis l''origine editoriale. Amorcage et reprise de donnees UNIQUEMENT : en exploitation, l''editeur pose la region a la main.';

comment on function public.sans_apostrophe(text) is
  'Minuscules, apostrophes droites ET typographiques retirees. Le defaut qui a motive books.region etait exactement cette difference.';

grant execute on function public.region_depuis_origine(text) to service_role;
grant execute on function public.sans_apostrophe(text) to service_role;
