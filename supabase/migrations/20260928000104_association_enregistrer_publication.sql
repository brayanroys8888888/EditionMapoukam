-- ---------------------------------------------------------------------------
-- ÉCRIRE UNE PUBLICATION — le contenu et sa version, d'un seul geste.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UNE TRANSACTION, PARCE QUE L'ÉDITEUR N'A QU'UN BOUTON.                  │
-- │                                                                          │
-- │ L'écran de rédaction enregistre en même temps ce qui vit sur le CONTENU  │
-- │ (type, publics, diffusion, fichiers) et ce qui vit sur sa VERSION        │
-- │ (titre, chapeau, corps). Deux appels successifs laisseraient, sur une    │
-- │ coupure, un contenu dont le type a changé et dont le texte est resté     │
-- │ l'ancien — et rien à l'écran ne dirait lequel des deux croire.           │
-- │                                                                          │
-- │ Une fonction, une transaction, et le refus porte sur tout.               │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create or replace function public.admin_enregistrer_publication(
  p_acteur uuid,
  p_id uuid,
  p_slug text,
  p_langue text,
  p_type public.type_publication,
  p_categorie public.association_category,
  p_acces public.association_access,
  p_titre text,
  p_chapeau text,
  p_texte_alternatif text,
  p_corps jsonb,
  p_publics public.public_association[] default '{}',
  p_signe_par text default null,
  p_image_url text default null,
  p_video_url text default null,
  p_video_minutes smallint default null,
  p_fichier_pdf text default null,
  p_pdf_pages smallint default null,
  p_evenement_id uuid default null,
  p_vedette boolean default false,
  p_commentaires_ouverts boolean default true,
  p_prevenir_adherents boolean default false,
  p_programme_le timestamptz default null,
  p_publier boolean default false
)
returns public.association_contents
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_contenu public.association_contents;
  v_minutes smallint;
  v_mots integer;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  /*
   * LE TEMPS DE LECTURE EST CALCULÉ, JAMAIS SAISI.
   *
   * 200 mots par minute, minimum une. Le calculer ici plutôt que dans l'écran
   * garantit qu'un contenu importé, ou modifié par une autre voie, porte la
   * même durée que celui qu'un éditeur vient d'écrire. Deux estimations
   * différentes pour un même texte seraient invisibles et toutes deux
   * plausibles.
   */
  select coalesce(sum(
           array_length(
             regexp_split_to_array(btrim(coalesce(b->>'texte', '')), '\s+'), 1
           )
         ), 0)
    into v_mots
  from jsonb_array_elements(coalesce(p_corps, '[]'::jsonb)) b
  where coalesce(b->>'texte', '') <> '';

  v_minutes := greatest(1, ceil(v_mots / 200.0))::smallint;

  if p_id is null then
    insert into public.association_contents (
      slug, categorie, acces, type_publication, minutes, image_url,
      publics, signe_par, video_url, video_minutes, fichier_pdf, pdf_pages,
      evenement_id, vedette, commentaires_ouverts, prevenir_adherents,
      programme_le, statut, publie_le
    )
    values (
      p_slug, p_categorie, p_acces, p_type, v_minutes, p_image_url,
      p_publics,
      coalesce(nullif(btrim(p_signe_par), ''), 'Le bureau de l''Association DAVE'),
      p_video_url, p_video_minutes, p_fichier_pdf, p_pdf_pages,
      p_evenement_id, false, p_commentaires_ouverts, p_prevenir_adherents,
      case when p_publier then null else p_programme_le end,
      case when p_publier then 'publie'::public.translation_status
           else 'brouillon'::public.translation_status end,
      case when p_publier then public.app_now() end
    )
    returning * into v_contenu;
  else
    update public.association_contents
    set categorie = p_categorie,
        acces = p_acces,
        type_publication = p_type,
        minutes = v_minutes,
        image_url = p_image_url,
        publics = p_publics,
        signe_par = coalesce(nullif(btrim(p_signe_par), ''), signe_par),
        video_url = p_video_url,
        video_minutes = p_video_minutes,
        fichier_pdf = p_fichier_pdf,
        pdf_pages = p_pdf_pages,
        evenement_id = p_evenement_id,
        commentaires_ouverts = p_commentaires_ouverts,
        prevenir_adherents = p_prevenir_adherents,
        programme_le = case when p_publier then null else p_programme_le end,
        statut = case when p_publier then 'publie'::public.translation_status else statut end,
        /*
         * `publie_le` ne se réécrit PAS sur un contenu déjà paru.
         *
         * C'est sa date de PREMIÈRE parution : la réécrire à chaque
         * correction remonterait l'article en tête de liste et ferait croire
         * aux adhérents à une nouveauté. Dépublier puis republier la garde
         * aussi — même règle, déjà inscrite au cahier des charges §F10 bis.
         */
        publie_le = case
          when p_publier and publie_le is null then public.app_now()
          else publie_le
        end,
        maj_le = public.app_now()
    where id = p_id
    returning * into v_contenu;

    if not found then
      raise exception 'Publication % introuvable.', p_id using errcode = 'no_data_found';
    end if;
  end if;

  /*
   * LA MISE À LA UNE EST EXCLUSIVE, et la base s'en charge.
   *
   * Un index partiel garantit déjà qu'il n'y a qu'une vedette publiée ; sans
   * ce retrait préalable, poser la seconde échouerait sur une violation
   * d'unicité, et l'éditeur lirait un message de contrainte au lieu de voir
   * son article passer devant.
   */
  if p_vedette then
    update public.association_contents set vedette = false, maj_le = public.app_now()
    where vedette and id <> v_contenu.id;

    update public.association_contents set vedette = true, maj_le = public.app_now()
    where id = v_contenu.id
    returning * into v_contenu;
  end if;

  insert into public.association_content_translations
    (content_id, langue, titre, chapeau, texte_alternatif, corps)
  values
    (v_contenu.id, p_langue, p_titre, coalesce(p_chapeau, ''),
     coalesce(p_texte_alternatif, ''), coalesce(p_corps, '[]'::jsonb))
  on conflict (content_id, langue) do update
    set titre = excluded.titre,
        chapeau = excluded.chapeau,
        texte_alternatif = excluded.texte_alternatif,
        corps = excluded.corps,
        maj_le = public.app_now();

  return v_contenu;
end;
$$;

comment on function public.admin_enregistrer_publication is
  'Écrit une publication associative et sa version dans la MÊME transaction. Le temps de lecture est calculé ici (200 mots/minute, minimum 1), jamais saisi.';
