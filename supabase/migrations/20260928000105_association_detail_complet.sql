-- ---------------------------------------------------------------------------
-- CORRECTIF — la lecture d'un contenu ne rendait pas ses champs neufs.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UNE PERTE DE DONNÉES QUI NE DIT RIEN.                                    │
-- │                                                                          │
-- │ `admin_lire_contenu_association` date d'avant les migrations 0096 et     │
-- │ suivantes : elle ne rend ni le TYPE, ni les publics, ni le lien de la    │
-- │ vidéo, ni le fichier, ni l'atelier, ni la programmation, ni le texte     │
-- │ alternatif.                                                              │
-- │                                                                          │
-- │ L'écran de rédaction la lit pour se remplir. Ouvrir une publication      │
-- │ existante lui donnait donc des valeurs PAR DÉFAUT à la place des         │
-- │ vraies — et le premier enregistrement les écrivait. Un replay perdait    │
-- │ son lien, une fiche son fichier, et l'écran affichait un succès.         │
-- │                                                                          │
-- │ Une fonction de lecture incomplète est dangereuse exactement parce       │
-- │ qu'elle réussit : c'est le formulaire qu'elle remplit qui détruit.       │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create or replace function public.admin_lire_contenu_association(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'categorie', c.categorie,
    'acces', c.acces,
    'statut', c.statut,
    -- L'état RÉEL, par l'unique implémentation : « programmé » ne se déduit
    -- pas d'un `statut` seul, et l'écran ne doit pas le recalculer.
    'etat', public.statut_publication(c.statut, c.programme_le),
    'publie_le', c.publie_le,
    'programme_le', c.programme_le,
    'minutes', c.minutes,
    'image_url', c.image_url,
    'vedette', c.vedette,
    'ordre', c.ordre,
    'type_publication', c.type_publication,
    'publics', c.publics,
    'signe_par', c.signe_par,
    'commentaires_ouverts', c.commentaires_ouverts,
    'prevenir_adherents', c.prevenir_adherents,
    'vues', c.vues,
    'video_url', c.video_url,
    'video_minutes', c.video_minutes,
    'fichier_pdf', c.fichier_pdf,
    'pdf_pages', c.pdf_pages,
    'evenement_id', c.evenement_id,
    'versions', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'langue', t.langue,
                   'titre', t.titre,
                   'chapeau', t.chapeau,
                   'texte_alternatif', t.texte_alternatif,
                   'corps', t.corps
                 ) order by t.langue
               )
        from public.association_content_translations t
        where t.content_id = c.id
      ),
      '[]'::jsonb
    )
  )
  from public.association_contents c
  where c.id = p_id;
$$;

comment on function public.admin_lire_contenu_association(uuid) is
  'Le détail COMPLET d''un contenu associatif — c''est l''écran de rédaction qui le relit pour se remplir. Tout champ absent d''ici serait écrasé au premier enregistrement.';
