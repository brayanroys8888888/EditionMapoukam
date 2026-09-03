-- ===========================================================================
-- 0075 — LA PUBLICATION D'UN CONTENU ASSOCIATIF NE MARCHAIT PAS DU TOUT
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UN DÉFAUT QUI NE POUVAIT PAS ÊTRE VU À L'ŒIL.                            │
-- │                                                                          │
-- │ La 0069 écrivait :                                                       │
-- │                                                                          │
-- │   set statut = case when p_publie then 'publie' else 'brouillon' end     │
-- │                                                                          │
-- │ Un `case` dont les deux branches sont des littéraux non typés rend du     │
-- │ `text`, et `statut` est de type `public.translation_status`. PostgreSQL   │
-- │ refuse l'affectation — code 42804 — et l'`update` échoue à l'exécution,   │
-- │ jamais à la création de la fonction. La migration s'est donc appliquée    │
-- │ sans un mot, et AUCUN contenu associatif n'a jamais pu être publié ni     │
-- │ dépublié.                                                                │
-- │                                                                          │
-- │ Rien ne le signalait : le refus remontait en `indisponible`, c'est-à-dire │
-- │ le message d'une panne passagère — « Réessayez dans un instant ». Un      │
-- │ éditeur aurait réessayé, indéfiniment.                                    │
-- │                                                                          │
-- │ C'est le test d'administration des contenus qui l'a trouvé, en exigeant   │
-- │ que la publication RÉUSSISSE après avoir vérifié qu'elle échoue à bon     │
-- │ droit sans version française. Le refus attendu masquait le refus subi.    │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Le reste du corps est repris VERBATIM de la 0069 : la conversion est le seul
-- changement, et rien d'autre ne doit se glisser dans une migration corrective.
-- ===========================================================================

create or replace function public.admin_publier_contenu_association(
  p_acteur uuid,
  p_id uuid,
  p_publie boolean
)
  returns public.association_contents
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_contenu public.association_contents;
  v_titre text;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  select * into v_contenu from public.association_contents where id = p_id;
  if not found then
    raise exception 'Contenu % introuvable.', p_id using errcode = 'no_data_found';
  end if;

  if p_publie then
    -- Ce qui manque pour publier, en un seul endroit : une version française
    -- avec un titre et un corps non vide. Publier un contenu au corps vide
    -- afficherait une page blanche derrière un cadenas payant.
    select t.titre into v_titre
    from public.association_content_translations t
    where t.content_id = p_id and t.langue = 'fr'
      and length(btrim(t.titre)) > 0
      and jsonb_array_length(t.corps) > 0;

    if v_titre is null then
      raise exception 'Ce contenu n''a pas de version francaise complete (titre et corps).'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.association_contents
  -- LA CONVERSION EST ÉCRITE SUR LE `case` ENTIER, et non sur chaque branche :
  -- une seule des deux suffirait à typer l'expression, mais la lire à moitié
  -- convertie invite à retirer « celle qui ne sert à rien ».
  set statut = (case when p_publie then 'publie' else 'brouillon' end)::public.translation_status,
      publie_le = case when p_publie then coalesce(publie_le, public.app_now()) else publie_le end,
      maj_le = public.app_now()
  where id = p_id
  returning * into v_contenu;

  return v_contenu;
end;
$fn$;

comment on function public.admin_publier_contenu_association(uuid, uuid, boolean) is
  'Publie ou dépublie un contenu associatif. La publication exige une version française complète ; `publie_le` n''est posée qu''une fois. Corrigée en 0075 : le statut était affecté sans conversion de type, et l''update échouait toujours.';
