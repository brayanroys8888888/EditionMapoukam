-- ═══════════════════════════════════════════════════════════════════════════
-- DEUX CHAMPS ÉDITORIAUX QUI EXISTAIENT SANS QUE PERSONNE PUISSE LES ÉCRIRE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Décision de l'éditeur, 3 septembre 2026. Deux manques, de natures opposées :
--
--   `themes`       la COLONNE existe depuis l'origine, le catalogue en fait
--                  une facette de recherche depuis la migration 0050 — et
--                  AUCUNE fonction `admin_*` ne permet de la poser. Tout ce
--                  qui s'y trouve vient des semences ; un titre ingéré depuis
--                  le back-office n'a jamais eu de thème, et n'en aurait
--                  jamais eu.
--
--   `description`  n'existe pas. Le `resume` tient aujourd'hui les deux rôles
--                  — l'accroche d'une carte et le texte long d'une fiche —
--                  et les tient donc mal : trop long pour une grille, trop
--                  court pour décider d'un achat.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI LA DESCRIPTION EST PORTÉE PAR LA VERSION LINGUISTIQUE.         │
-- │                                                                         │
-- │ Elle est du TEXTE destiné au lecteur, au même titre que le titre et le  │
-- │ résumé. La poser sur `books` aurait fait afficher un paragraphe français │
-- │ sur le site anglais — le défaut exact que `book_translations` existe     │
-- │ pour empêcher, et qu'aucun repli ne rattrape puisqu'il n'y aurait rien   │
-- │ sur quoi se replier.                                                    │
-- │                                                                         │
-- │ `themes`, à l'inverse, reste sur `books` : c'est une clé de RANGEMENT,  │
-- │ elle sert à regrouper des titres entre eux, et un regroupement qui       │
-- │ changerait de composition selon la langue consultée ne regrouperait      │
-- │ plus rien.                                                              │
-- └─────────────────────────────────────────────────────────────────────────┘

alter table public.book_translations
  add column description text;

comment on column public.book_translations.description is
  'Texte LONG de la fiche produit, distinct du résumé qui reste l''accroche des cartes et du référencement. Facultatif : un titre sans description affiche son résumé, et rien ne manque.';

-- ---------------------------------------------------------------------------
-- 1. ÉCRIRE LA DESCRIPTION
--
-- `drop` puis `create` : ajouter un paramètre à une fonction existante crée
-- une SURCHARGE, et tout appel par paramètres nommés devient alors ambigu
-- entre les deux — c'est-à-dire une erreur à l'exécution. C'est le
-- raisonnement des migrations 0053 et 0063, inchangé.
--
-- Le corps est repris VERBATIM de la migration 0058. Deux ajouts, et deux
-- seulement : le paramètre, et sa ligne dans le `update`.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_modifier_traduction(uuid, uuid, uuid, text, text);

create function public.admin_modifier_traduction(
  p_acteur uuid,
  p_book_id uuid,
  p_translation_id uuid,
  p_titre text default null,
  p_resume text default null,
  p_description text default null
)
  returns public.book_translations
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_traduction public.book_translations;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if p_titre is not null and btrim(p_titre) = '' then
    raise exception 'Le titre ne peut pas être vide.' using errcode = 'check_violation';
  end if;

  update public.book_translations
  set titre  = coalesce(nullif(btrim(p_titre), ''), titre),
      -- Le résumé peut être VIDÉ : passer une chaîne vide le remet à nul.
      -- C'est un champ facultatif, et l'éditeur doit pouvoir retirer un texte
      -- qu'il a écrit — ce que `coalesce` seul lui interdirait.
      resume = case when p_resume is null then resume
                    when btrim(p_resume) = '' then null
                    else btrim(p_resume) end,
      -- Même règle, pour la même raison. Un paragraphe écrit par erreur doit
      -- pouvoir disparaître sans qu'on aille le retirer en base.
      description = case when p_description is null then description
                         when btrim(p_description) = '' then null
                         else btrim(p_description) end,
      maj_le = public.app_now()
  where id = p_translation_id
    -- LA GARDE. Une version qui n'appartient pas à ce titre ne correspond à
    -- aucune ligne, et le `not found` ci-dessous répond « introuvable » — la
    -- même réponse qu'un identifiant inventé, qui ne dit donc rien de plus.
    and book_id = p_book_id
  returning * into v_traduction;

  if not found then
    raise exception 'Version % introuvable pour le titre %.', p_translation_id, p_book_id
      using errcode = 'no_data_found';
  end if;

  return v_traduction;
end;
$$;

comment on function public.admin_modifier_traduction(uuid, uuid, uuid, text, text, text) is
  'Corrige le titre, le résumé et la description d''une version linguistique, à condition qu''elle appartienne au titre indiqué. Le slug n''est jamais modifiable : il est dans l''URL publique du conte.';

revoke all on function public.admin_modifier_traduction(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_modifier_traduction(uuid, uuid, uuid, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. ÉCRIRE LES THÈMES
--
-- Corps repris VERBATIM de la migration 0062, plus le paramètre et sa ligne.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ `coalesce` GARDE SON SENS, ET LE TABLEAU VIDE N'EST PAS `null`.         │
-- │                                                                         │
-- │ `p_themes` nul ne touche à rien, comme tous les autres paramètres de     │
-- │ cette fonction. Un tableau VIDE, lui, efface : c'est ainsi que l'éditeur │
-- │ retire le dernier thème d'un titre. Les deux valeurs sont distinctes en  │
-- │ SQL, et c'est ce qui rend la nuance exprimable sans second paramètre.    │
-- │                                                                         │
-- │ Les libellés sont nettoyés ICI et non par l'écran : espaces rognés,      │
-- │ vides écartés, doublons supprimés, ordre stable. Un thème « courage » et │
-- │ un thème « Courage  » feraient deux pastilles de filtre pour une seule   │
-- │ idée — le défaut même qui a fermé l'énumération des régions.             │
-- └─────────────────────────────────────────────────────────────────────────┘

drop function if exists public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint,
  public.region_conte, text, public.document_type, public.page_orientation
);

create function public.admin_modifier_livre(
  p_acteur uuid,
  p_book_id uuid,
  p_gratuit boolean default null,
  p_inclus_abonnement boolean default null,
  p_disponible_achat boolean default null,
  p_auteur text default null,
  p_origine_culturelle text default null,
  p_age_min smallint default null,
  p_age_max smallint default null,
  p_nb_pages_extrait smallint default null,
  p_region public.region_conte default null,
  p_illustrateur text default null,
  p_type_document public.document_type default null,
  p_orientation public.page_orientation default null,
  p_themes text[] default null
)
  returns public.books
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_livre public.books;
  v_themes text[];
begin
  perform public.admin_poser_acteur(p_acteur, null);

  -- Nettoyage des thèmes, une fois, ici. `null` traverse intact et signifie
  -- toujours « ne touche pas ».
  if p_themes is not null then
    select coalesce(array_agg(distinct btrim(u.t) order by btrim(u.t)), '{}'::text[])
      into v_themes
    from unnest(p_themes) as u(t)
    where length(btrim(u.t)) > 0;
  end if;

  -- `coalesce` sur chaque champ : un paramètre absent ne modifie rien. Une mise
  -- à jour partielle ne doit pas remettre à nul ce qu'elle ne nomme pas.
  update public.books
  set gratuit            = coalesce(p_gratuit, gratuit),
      inclus_abonnement  = coalesce(p_inclus_abonnement, inclus_abonnement),
      disponible_achat   = coalesce(p_disponible_achat, disponible_achat),
      auteur             = coalesce(p_auteur, auteur),
      origine_culturelle = coalesce(p_origine_culturelle, origine_culturelle),
      age_min            = coalesce(p_age_min, age_min),
      age_max            = coalesce(p_age_max, age_max),
      nb_pages_extrait   = coalesce(p_nb_pages_extrait, nb_pages_extrait),
      region             = coalesce(p_region, region),
      illustrateur       = coalesce(p_illustrateur, illustrateur),
      -- Non nulles en base : `coalesce` y garde son sens de « ne touche pas »,
      -- et ne peut jamais servir à les effacer.
      type_document      = coalesce(p_type_document, type_document),
      orientation        = coalesce(p_orientation, orientation),
      themes             = coalesce(v_themes, themes),
      maj_le             = public.app_now()
  where id = p_book_id
  returning * into v_livre;

  if not found then
    raise exception 'Titre % introuvable.', p_book_id using errcode = 'no_data_found';
  end if;

  return v_livre;
end;
$$;

comment on function public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint,
  public.region_conte, text, public.document_type, public.page_orientation, text[]
) is
  'Modifie les champs métier d''un titre. `p_themes` y a été ajouté le 3 septembre 2026 : la colonne alimentait une facette du catalogue depuis la migration 0050 sans qu''aucune fonction ne permette de l''écrire. Un tableau vide efface, `null` ne touche à rien.';

revoke all on function public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint,
  public.region_conte, text, public.document_type, public.page_orientation, text[]
) from public, anon, authenticated;
grant execute on function public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint,
  public.region_conte, text, public.document_type, public.page_orientation, text[]
) to service_role;

-- ---------------------------------------------------------------------------
-- 3. RELIRE CE QU'ON VIENT DE POUVOIR ÉCRIRE
--
-- « Un champ qu'on peut écrire sans le relire est un champ qu'on écrase » —
-- le commentaire de la migration 0059, qui vaut ici mot pour mot. L'écran
-- d'édition préremplit ses zones de texte avec ce que rend cette fonction ;
-- sans `description`, le premier enregistrement d'une version l'effacerait.
--
-- Corps repris VERBATIM de la 0059, plus la clé `description` dans l'objet
-- d'une version. `region` reste rendue : la donnée existe toujours, même si
-- l'écran a cessé de l'afficher (migration 0071).
-- ---------------------------------------------------------------------------

drop function if exists public.admin_lire_livre(uuid);

create function public.admin_lire_livre(p_book_id uuid)
  returns table (
    id uuid,
    slug text,
    auteur text,
    illustrateur text,
    origine_culturelle text,
    region public.region_conte,
    age_min smallint,
    age_max smallint,
    themes text[],
    nb_pages_extrait smallint,
    statut public.book_status,
    gratuit boolean,
    inclus_abonnement boolean,
    disponible_achat boolean,
    publie_le timestamptz,
    prix jsonb,
    traductions jsonb,
    manques text[],
    publiable boolean
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select
    b.id,
    b.slug,
    b.auteur,
    b.illustrateur,
    b.origine_culturelle,
    b.region,
    b.age_min,
    b.age_max,
    b.themes,
    b.nb_pages_extrait,
    b.statut,
    b.gratuit,
    b.inclus_abonnement,
    b.disponible_achat,
    b.publie_le,
    coalesce((
      select jsonb_object_agg(bp.zone, jsonb_build_object('montant', bp.montant, 'devise', bp.devise))
      from public.book_prices bp where bp.book_id = b.id
    ), '{}'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', bt.id,
          'langue', bt.langue,
          'titre', bt.titre,
          'resume', bt.resume,
          'description', bt.description,
          'statut', bt.statut,
          'nb_pages', bt.nb_pages,
          -- Des ÉTATS, jamais des chemins. Le back-office a besoin de savoir
          -- si une version est complète ; il n'a aucun usage de la clé de
          -- stockage, et la lui donner reviendrait à lui donner le fichier.
          'lisible', bt.fichier_lecture is not null,
          'telechargeable', bt.fichier_telechargement is not null
        )
        order by bt.langue
      )
      from public.book_translations bt where bt.book_id = b.id
    ), '[]'::jsonb),
    public.manques_pour_publication(b.id),
    (cardinality(public.manques_pour_publication(b.id)) = 0)
  from public.books b
  where b.id = p_book_id;
$$;

comment on function public.admin_lire_livre(uuid) is
  'Un titre et tout ce que le back-office en édite : champs métier, thèmes, prix par zone, versions linguistiques avec leur identifiant, leur résumé et leur description, et ce qui lui manque pour être publiable — calculé par `manques_pour_publication()`, la fonction qu''applique le déclencheur.';

revoke all on function public.admin_lire_livre(uuid) from public, anon, authenticated;
grant execute on function public.admin_lire_livre(uuid) to service_role;
