-- ===========================================================================
-- 0076 — LA PUBLICATION D'UN TÉMOIGNAGE NE MARCHAIT PAS DAVANTAGE
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE MÊME DÉFAUT QUE LA 0075, DANS UNE FONCTION ÉCRITE LE MÊME JOUR.       │
-- │                                                                          │
-- │ La 0073 écrivait :                                                       │
-- │                                                                          │
-- │   set statut = case when p_publie then 'publie' else 'brouillon' end     │
-- │                                                                          │
-- │ Un `case` dont les deux branches sont des littéraux non typés rend du    │
-- │ `text`, et `statut` est de type `public.translation_status`. PostgreSQL  │
-- │ refuse l'affectation — code 42804 — et l'`update` échoue à l'exécution,  │
-- │ jamais à la création de la fonction. La 0073 s'est donc appliquée sans   │
-- │ un mot, et AUCUN témoignage n'a jamais pu être publié ni dépublié.       │
-- │                                                                          │
-- │ Autrement dit : les trois citations de la page d'accueil, reprises de    │
-- │ `src/i18n/fr.json` par la 0073, étaient les seules que le site pouvait   │
-- │ montrer. Toute nouvelle signature serait restée en brouillon, et le      │
-- │ refus serait remonté en `indisponible` — « Réessayez dans un instant ».  │
-- │                                                                          │
-- │ C'est `tests/integration/admin-temoignages.test.ts` qui l'a trouvé, en   │
-- │ exigeant que la publication RÉUSSISSE après avoir vérifié qu'elle        │
-- │ échoue à bon droit sans texte français. Le refus attendu masquait le     │
-- │ refus subi — exactement comme pour les contenus associatifs.             │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Le reste du corps est repris VERBATIM de la 0073 : la conversion est le seul
-- changement, et rien d'autre ne doit se glisser dans une migration corrective.
--
-- `create or replace` suffit : ni les paramètres ni le type de retour ne
-- changent, seul le corps est réécrit.
-- ===========================================================================

create or replace function public.admin_publier_temoignage(
  p_acteur uuid,
  p_id uuid,
  p_publie boolean
)
  returns public.testimonials
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_temoignage public.testimonials;
  v_texte text;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if p_publie then
    -- Ce qui manque pour publier, en un seul endroit : une version française
    -- avec un texte. Publier une signature sans citation afficherait un
    -- guillemet vide en page d'accueil.
    select v.texte into v_texte
    from public.testimonial_translations v
    where v.testimonial_id = p_id and v.langue = 'fr' and length(btrim(v.texte)) > 0;

    if v_texte is null then
      raise exception 'Ce temoignage n''a pas de texte francais.'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.testimonials
  -- LA CONVERSION EST ÉCRITE SUR LE `case` ENTIER, et non sur chaque branche :
  -- une seule des deux suffirait à typer l'expression, mais la lire à moitié
  -- convertie invite à retirer « celle qui ne sert à rien ».
  set statut = (case when p_publie then 'publie' else 'brouillon' end)::public.translation_status,
      maj_le = public.app_now()
  where id = p_id
  returning * into v_temoignage;

  if not found then
    raise exception 'Temoignage % introuvable.', p_id using errcode = 'no_data_found';
  end if;

  return v_temoignage;
end;
$fn$;

comment on function public.admin_publier_temoignage(uuid, uuid, boolean) is
  'Publie ou dépublie un témoignage. La publication exige un texte français. Corrigée en 0076 : le statut était affecté sans conversion de type, et l''update échouait toujours.';
