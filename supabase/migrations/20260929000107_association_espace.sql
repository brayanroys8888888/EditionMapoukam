-- ---------------------------------------------------------------------------
-- L'ESPACE ADHÉRENT — tout ce qu'il affiche, en un aller-retour.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UNE FONCTION, ET NON SIX LECTURES.                                       │
-- │                                                                          │
-- │ L'écran montre le mot du mois, les rubriques, l'à-la-une, les derniers   │
-- │ contenus, l'agenda, la campagne et les fiches. Six requêtes depuis la    │
-- │ page, c'est six allers-retours — et §5.1 rappelle qu'une part            │
-- │ importante du public est sur connexion lente. Ici tout part ensemble.    │
-- │                                                                          │
-- │ La fonction ne DÉCIDE rien : l'appelant a déjà obtenu son verdict par    │
-- │ `association_acces_espace`. Elle lit.                                    │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE QUI N'EST PAS RENDU, ET POURQUOI.                                     │
-- │                                                                          │
-- │ `fichier_pdf` et `video_url` n'apparaissent NULLE PART ici. Ce sont des  │
-- │ ressources réservées, et leur adresse vaut l'accès : elle se recopie.    │
-- │ L'écran affiche « 12 pages », « 52 min », et le téléchargement passera   │
-- │ par une route qui vérifie le droit puis signe une URL de courte durée —  │
-- │ règle 3 de CLAUDE.md, Partie D du document.                              │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create or replace function public.association_espace(
  p_user uuid,
  p_langue text default 'fr',
  p_at timestamptz default public.app_now()
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with publiees as (
    select
      c.id, c.slug, c.type_publication, c.image_url, c.minutes, c.vedette,
      c.publie_le, c.pdf_pages, c.video_minutes, c.commentaires_ouverts,
      t.titre, t.chapeau, t.texte_alternatif,
      /*
       * « NOUVEAU » — moins de sept jours.
       *
       * Le document ajoute « et que l'adhérent ne l'a pas ouvert ». Cette
       * moitié-là demande de retenir ce que CHAQUE adhérent a lu, donc une
       * table de plus et une écriture à chaque lecture. Elle n'est pas là :
       * l'étiquette dit donc « récent », ce qui est vrai, plutôt que « non
       * lu », qui serait faux pour qui vient de le lire.
       */
      c.publie_le > p_at - interval '7 days' as recent
    from public.association_contents c
    join public.association_content_translations t
      on t.content_id = c.id and t.langue = p_langue
    where c.statut = 'publie'
  )
  select jsonb_build_object(
    'mot', (
      select jsonb_build_object('texte', w.texte, 'signature', w.signature, 'maj_le', w.maj_le)
      from public.association_words w where w.actif
    ),

    -- Les rubriques et leur compte. Toutes les quatre sont rendues, même
    -- vides : une rubrique qui disparaît quand elle se vide ferait croire
    -- qu'elle n'a jamais existé.
    'rubriques', (
      select jsonb_agg(jsonb_build_object('type', r.type, 'nb', r.nb) order by r.type)
      from (
        select e.type::text as type,
               (select count(*) from publiees p where p.type_publication::text = e.type::text) as nb
        from unnest(enum_range(null::public.type_publication)) e(type)
      ) r
    ),

    'a_la_une', (
      select jsonb_build_object(
        'slug', p.slug, 'titre', p.titre, 'chapeau', p.chapeau,
        'type', p.type_publication, 'image_url', p.image_url,
        'texte_alternatif', p.texte_alternatif,
        'publie_le', p.publie_le, 'minutes', p.minutes
      )
      from publiees p where p.vedette limit 1
    ),

    'contenus', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'slug', p.slug, 'titre', p.titre, 'chapeau', p.chapeau,
          'type', p.type_publication, 'image_url', p.image_url,
          'texte_alternatif', p.texte_alternatif,
          'publie_le', p.publie_le, 'minutes', p.minutes,
          'pdf_pages', p.pdf_pages, 'video_minutes', p.video_minutes,
          'recent', p.recent
        ) order by p.publie_le desc
      )
      from publiees p
    ), '[]'::jsonb),

    /*
     * L'AGENDA — les trois prochains, et RIEN de passé.
     *
     * Un atelier d'hier n'est pas une occasion manquée à afficher : il est
     * fini. L'espace montre ce à quoi on peut encore s'inscrire.
     */
    'agenda', coalesce((
      select jsonb_agg(a.ligne order by a.debut_le)
      from (
        select e.debut_le,
               jsonb_build_object(
                 'id', e.id, 'type', e.type_evenement, 'titre', e.titre,
                 'debut_le', e.debut_le, 'lieu', e.lieu,
                 'places', e.places,
                 'restantes', public.association_places_restantes(e.id),
                 -- « Suis-je inscrit ? » est une question PAR PERSONNE, et
                 -- c'est pourquoi elle se répond ici plutôt que dans l'écran.
                 'inscrit', exists (
                   select 1 from public.association_event_registrations r
                   where r.event_id = e.id and r.user_id = p_user
                 )
               ) as ligne
        from public.association_events e
        where e.debut_le > p_at
        order by e.debut_le
        limit 3
      ) a
    ), '[]'::jsonb),

    'campagne', (
      select jsonb_build_object(
        'intitule', c.intitule,
        'objectif_kits', c.objectif_kits,
        'total', public.association_campagne_total(c.id),
        'regions', coalesce((
          select jsonb_agg(jsonb_build_object('region', r.region, 'kits', r.kits) order by r.region)
          from public.association_campaign_regions r where r.campaign_id = c.id
        ), '[]'::jsonb)
      )
      from public.association_campaigns c where c.actif
    ),

    -- Les trois dernières fiches. Leur ADRESSE n'y est pas : seul le nombre
    -- de pages, qui se lit sans donner le fichier.
    'fiches', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'slug', f.slug, 'titre', f.titre, 'pdf_pages', f.pdf_pages, 'publie_le', f.publie_le
        ) order by f.publie_le desc
      )
      from (
        select p.slug, p.titre, p.pdf_pages, p.publie_le
        from publiees p where p.type_publication = 'fiche_pdf'
        order by p.publie_le desc limit 3
      ) f
    ), '[]'::jsonb),

    'replays', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'slug', v.slug, 'titre', v.titre, 'image_url', v.image_url,
          'video_minutes', v.video_minutes, 'publie_le', v.publie_le
        ) order by v.publie_le desc
      )
      from (
        select p.slug, p.titre, p.image_url, p.video_minutes, p.publie_le
        from publiees p where p.type_publication = 'replay'
        order by p.publie_le desc limit 4
      ) v
    ), '[]'::jsonb),

    'prochaine_publication', (
      select min(c.programme_le) from public.association_contents c
      where c.statut <> 'publie' and c.programme_le > p_at
    )
  );
$$;

comment on function public.association_espace(uuid, text, timestamptz) is
  'Tout ce que l''espace adhérent affiche, en un aller-retour. Ne rend NI `fichier_pdf` NI `video_url` : ces adresses valent l''accès, et passeront par une route qui signe une URL de courte durée.';

grant execute on function public.association_espace(uuid, text, timestamptz) to authenticated;
