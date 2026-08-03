-- ---------------------------------------------------------------------------
-- L'interrupteur commercial passe par la route d'administration, et est TRACE
--
-- +--------------------------------------------------------------------------+
-- | POURQUOI PAR LA MEME FONCTION QUE LES AUTRES REGLAGES.                   |
-- |                                                                          |
-- | `abonnement_ouvert` est un LEVIER COMMERCIAL au meme titre que la        |
-- | fenetre de nouveaute ou la periode de grace : il decide si la plateforme |
-- | encaisse un abonnement. Lui donner sa propre route l'aurait sorti du     |
-- | declencheur d'audit qui enregistre la ligne ENTIERE de                   |
-- | `business_settings` avant et apres — et c'est precisement cette trace   |
-- | qui compte pour un geste de cette portee.                                |
-- |                                                                          |
-- | Le declencheur n'a pas a etre modifie : il journalise la ligne, pas une  |
-- | liste de colonnes. Une colonne ajoutee y entre sans que personne n'y     |
-- | pense — c'est l'interet d'avoir trace la DONNEE plutot que le CHEMIN.    |
-- +--------------------------------------------------------------------------+
--
-- Extraction verbatim de la migration 0036 : un parametre et une affectation
-- ajoutes, plus `create` -> `create or replace`. `npm run diff:sql` le montre.
--
-- L'ancienne signature a six arguments est retiree APRES la nouvelle : sans
-- cela, PostgreSQL garderait deux surcharges et l'appel deviendrait ambigu.
-- ---------------------------------------------------------------------------

create or replace function public.admin_modifier_parametres(
  p_acteur uuid,
  p_fenetre_nouveaute_jours integer default null,
  p_periode_grace_jours integer default null,
  p_jours_essai integer default null,
  p_tolerance_renouvellement_heures integer default null,
  p_retention_copies_mois integer default null,
  p_abonnement_ouvert boolean default null
)
  returns public.business_settings
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_parametres public.business_settings;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  update public.business_settings
  set fenetre_nouveaute_jours = coalesce(p_fenetre_nouveaute_jours, fenetre_nouveaute_jours),
      periode_grace_jours = coalesce(p_periode_grace_jours, periode_grace_jours),
      jours_essai = coalesce(p_jours_essai, jours_essai),
      tolerance_renouvellement_heures =
        coalesce(p_tolerance_renouvellement_heures, tolerance_renouvellement_heures),
      retention_copies_mois = coalesce(p_retention_copies_mois, retention_copies_mois),
      abonnement_ouvert = coalesce(p_abonnement_ouvert, abonnement_ouvert),
      maj_le = public.app_now()
  where id = 1
  returning * into v_parametres;

  return v_parametres;
end;
$$;

drop function if exists public.admin_modifier_parametres(uuid, integer, integer, integer, integer, integer);

revoke all on function public.admin_modifier_parametres(uuid, integer, integer, integer, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_modifier_parametres(uuid, integer, integer, integer, integer, integer, boolean)
  to service_role;

comment on function public.admin_modifier_parametres(uuid, integer, integer, integer, integer, integer, boolean) is
  'Modifie les reglages metier, acteur obligatoire. Le declencheur d''audit enregistre la ligne ENTIERE avant et apres : ces parametres interagissent, et relire un etat complet vaut mieux que recomposer une suite de deltas.';
