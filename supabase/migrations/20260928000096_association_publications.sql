-- ---------------------------------------------------------------------------
-- L'ASSOCIATION DAVE — le modèle de publication.
--
-- Décision du propriétaire du 28 septembre 2026 : les fonctionnalités du
-- document « 11 — Association DAVE : fonctionnalités complètes » sont
-- implémentées, bien qu'absentes du cahier des charges. Ce fichier ouvre la
-- série ; il ne touche qu'aux PUBLICATIONS.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE TYPE N'EST PAS LA CATÉGORIE, ET LES DEUX RESTENT.                     │
-- │                                                                          │
-- │ `categorie` range par THÈME — vie associative, actions, pédagogie… Elle  │
-- │ existe, elle est renseignée sur les huit contenus, et la page publique   │
-- │ s'en sert. `type_publication` range par FORME : un compte rendu, un      │
-- │ récit, une fiche, un replay. C'est elle qui décide du comportement au    │
-- │ clic — lire, télécharger, regarder — et des rubriques de l'espace.       │
-- │                                                                          │
-- │ Deux questions différentes, deux colonnes. Les confondre obligerait à    │
-- │ choisir entre « ce dont ça parle » et « ce que c'est », et l'espace      │
-- │ adhérent a besoin des deux.                                              │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create type public.type_publication as enum (
  'compte_rendu',
  'recit_terrain',
  'fiche_pdf',
  'replay'
);

comment on type public.type_publication is
  'La FORME d''une publication associative. Décide du comportement au clic (lire, télécharger, regarder) et de la rubrique. Distincte de `association_category`, qui range par thème.';

/*
 * Les publics visés. Ils servent à cibler les e-mails et les suggestions ;
 * ils ne ferment AUCUN accès — un adhérent voit tout l'espace, quel que soit
 * son profil. Un public qui filtrerait la lecture serait un second moteur de
 * droits, et il faudrait alors le tenir d'accord avec `access_for_*`.
 */
create type public.public_association as enum (
  'parents',
  'enseignants',
  'pro_handicap',
  'donateurs',
  'partenaires'
);

-- ---------------------------------------------------------------------------
-- Les colonnes neuves
-- ---------------------------------------------------------------------------

alter table public.association_contents
  add column type_publication public.type_publication not null default 'recit_terrain',

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LA PROGRAMMATION NE TOUCHE PAS À `translation_status`.                 │
   * │                                                                        │
   * │ Cet enum est PARTAGÉ avec les traductions de livres. Y ajouter         │
   * │ « programmé » rendrait la valeur disponible sur un titre du catalogue, │
   * │ où elle ne veut rien dire — et un écran finirait par l'y afficher.     │
   * │                                                                        │
   * │ L'état réel se DÉDUIT donc de deux colonnes, par une seule fonction    │
   * │ (`statut_publication` ci-dessous), exactement comme l'état d'un        │
   * │ abonnement se déduit de `statut` et `fin_periode`.                     │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  add column programme_le timestamptz,

  -- Qui signe. Par défaut le bureau : c'est le cas courant, et l'oubli du
  -- champ ne doit pas produire un article non signé.
  add column signe_par text not null default 'Le bureau de l''Association DAVE',

  add column publics public.public_association[] not null default '{}',

  -- « Commentaires ouverts » — l'éditeur décide article par article.
  add column commentaires_ouverts boolean not null default true,

  -- Comptées, jamais estimées. Incrémentées par `association_compter_vue`.
  add column vues bigint not null default 0,

  -- Replay
  add column video_url text,
  add column video_minutes smallint,

  -- Fiche PDF
  add column fichier_pdf text,
  add column pdf_pages smallint,

  -- L'atelier dont ce contenu rend compte. La table arrive à la migration
  -- suivante ; la contrainte de clé étrangère y sera posée avec elle.
  add column evenement_id uuid,

  -- L'e-mail « nouveau contenu », demandé puis envoyé. Deux colonnes et non
  -- une : « on a demandé » et « c'est parti » sont deux faits distincts, et
  -- les confondre rendrait un second envoi impossible à distinguer d'un oubli.
  add column prevenir_adherents boolean not null default false,
  add column email_envoye_le timestamptz;

alter table public.association_contents
  add constraint association_contents_video_minutes_check
    check (video_minutes is null or video_minutes > 0),
  add constraint association_contents_pdf_pages_check
    check (pdf_pages is null or pdf_pages > 0),

  /*
   * Une date de programmation n'a de sens que sur un contenu PAS ENCORE
   * publié. Sur un contenu en ligne, elle raconterait une mise en ligne à
   * venir qui a déjà eu lieu.
   */
  add constraint association_contents_programme_si_brouillon
    check (programme_le is null or statut <> 'publie');

comment on column public.association_contents.vues is
  'Compteur de lectures, incrémenté par `association_compter_vue`. Approximatif par construction : il ne distingue pas deux lectures d''un même adhérent.';
comment on column public.association_contents.publics is
  'Publics VISÉS — ciblage des e-mails et des suggestions. N''ouvre et ne ferme aucun accès.';

-- ---------------------------------------------------------------------------
-- Le texte alternatif de la couverture — PAR LANGUE
-- ---------------------------------------------------------------------------

/*
 * Il décrit une image pour qui ne la voit pas : c'est du texte destiné au
 * lecteur, donc il vit à côté du titre et du chapeau. Posé sur
 * `association_contents`, il ferait lire une description française à un
 * lecteur anglophone — exactement la raison pour laquelle `description` vit
 * sur `book_translations` et non sur `books` (migration 0070).
 */
alter table public.association_content_translations
  add column texte_alternatif text not null default '';

-- ---------------------------------------------------------------------------
-- L'ÉTAT RÉEL D'UNE PUBLICATION — unique implémentation
-- ---------------------------------------------------------------------------

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS ÉTATS, DÉDUITS DE DEUX COLONNES, PAR UNE SEULE FONCTION.          │
 * │                                                                          │
 * │ `publie`    — `statut = 'publie'`. En ligne, point.                      │
 * │ `programme` — un brouillon qui porte une date. Il deviendra visible      │
 * │               quand la tâche de publication le basculera.                │
 * │ `brouillon` — tout le reste.                                             │
 * │                                                                          │
 * │ La fonction ne compare PAS la date à l'heure courante pour décider de la │
 * │ visibilité : un contenu programmé dont l'heure est passée reste          │
 * │ `programme` tant que personne ne l'a publié. Sans cela, la visibilité    │
 * │ dépendrait de l'horloge au moment de la lecture, et deux écrans lus à    │
 * │ une seconde d'intervalle pourraient se contredire.                       │
 * │                                                                          │
 * │ C'est la bascule qui publie, pas le temps qui passe.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
create type public.statut_publication as enum ('brouillon', 'programme', 'publie');

create or replace function public.statut_publication(
  p_statut public.translation_status,
  p_programme_le timestamptz
)
returns public.statut_publication
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when p_statut = 'publie' then 'publie'::public.statut_publication
    when p_programme_le is not null then 'programme'::public.statut_publication
    else 'brouillon'::public.statut_publication
  end;
$$;

comment on function public.statut_publication(public.translation_status, timestamptz) is
  'L''état réel d''une publication associative. UNIQUE implémentation : tout écran et toute fonction passent par elle, jamais par une comparaison faite ailleurs.';

-- ---------------------------------------------------------------------------
-- LE FICHIER ET LA VIDÉO — protégés par un PRIVILÈGE ABSENT
-- ---------------------------------------------------------------------------

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MÊME TECHNIQUE QUE `corps`, ET POUR LA MÊME RAISON.                      │
 * │                                                                          │
 * │ `fichier_pdf` et `video_url` désignent des ressources réservées. Une     │
 * │ POLITIQUE qui les filtrerait laisserait la requête réussir, et une       │
 * │ valeur nulle se confondrait avec « ce contenu n'a pas de fichier ». Le   │
 * │ privilège retiré fait ÉCHOUER la requête qui les demande, avec un code   │
 * │ d'erreur, avant qu'une ligne soit lue.                                   │
 * │                                                                          │
 * │ Le chemin légitime est une fonction qui vérifie le droit puis rend une   │
 * │ URL signée de courte durée — elle arrive avec l'espace adhérent.         │
 * │                                                                          │
 * │ Ne jamais « réparer » ce refus en rendant le privilège.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `pdf_pages` et `video_minutes` RESTENT lisibles : une carte annonce « 12
 * pages » ou « 52 min » sans donner accès à la ressource, et c'est ce qui
 * donne envie d'adhérer.
 */
revoke select (fichier_pdf, video_url) on public.association_contents from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Compter une lecture
-- ---------------------------------------------------------------------------

/*
 * `security definer` : la table n'accorde pas l'écriture, et ce n'est pas au
 * lecteur d'avoir le droit de modifier une publication pour que sa lecture
 * soit comptée. La fonction n'incrémente QUE ce compteur.
 *
 * Elle ne compte que les contenus PUBLIÉS : une lecture d'aperçu par
 * l'éditeur, sur un brouillon, n'est pas une lecture.
 */
create or replace function public.association_compter_vue(p_id uuid)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  update public.association_contents
     set vues = vues + 1
   where id = p_id and statut = 'publie';
$$;

grant execute on function public.association_compter_vue(uuid) to anon, authenticated;
