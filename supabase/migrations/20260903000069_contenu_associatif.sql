-- ═══════════════════════════════════════════════════════════════════════════
-- L'ESPACE DE L'ASSOCIATION DAVE, ET SON CONTENU RÉSERVÉ.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Décision de l'éditeur, 3 septembre 2026. La section « Blog » est remplacée
-- par « Association Dave ». Elle porte deux sortes de contenus :
--
--   `libre`    lisible par tout le monde, y compris un visiteur non connecté
--   `abonnes`  réservé aux abonnés du domaine `association` (migration 0067)
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ LE CORPS N'EST PAS LISIBLE DEPUIS LE NAVIGATEUR. LE RÉSUMÉ, SI.         │
-- │                                                                         │
-- │ Une politique RLS agit sur les LIGNES ; il en faudrait une par colonne   │
-- │ pour cacher le corps d'un contenu tout en montrant son titre. C'est donc │
-- │ le PRIVILÈGE qui porte la garantie, comme pour `users.role` (0010) :     │
-- │ `titre` et `chapeau` sont accordés en lecture, `corps` ne l'est à        │
-- │ personne. Un contenu verrouillé s'annonce — titre, chapeau, cadenas —    │
-- │ sans que son texte quitte le serveur.                                   │
-- │                                                                         │
-- │ Le corps ne sort que par une route serveur qui interroge d'abord         │
-- │ `access_for_association`. C'est exactement la mécanique des pages d'un   │
-- │ conte (CLAUDE.md règle 3), transposée à du texte.                        │
-- └─────────────────────────────────────────────────────────────────────────┘

create type public.association_access as enum ('libre', 'abonnes');

comment on type public.association_access is
  'Niveau d''accès d''un contenu associatif. `libre` = lisible par tous ; `abonnes` = réservé aux abonnés du domaine `association`.';

-- Énumération FERMÉE, pour la raison déjà retenue sur `region_conte` : une
-- catégorie en texte libre finit par exister en trois orthographes, et la
-- quatrième s'affiche sans couleur.
create type public.association_category as enum (
  'vie-associative',
  'actions',
  'accompagnement',
  'pedagogie',
  'culture',
  'besoins-specifiques'
);

-- ---------------------------------------------------------------------------
-- 1. LES CONTENUS
-- ---------------------------------------------------------------------------

create table public.association_contents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  categorie public.association_category not null,

  -- `abonnes` PAR DÉFAUT. Un contenu créé sans qu'on y pense est fermé, jamais
  -- ouvert : le défaut le plus sûr est celui dont l'erreur se répare, et
  -- ouvrir par accident ce qui devait être payant ne se répare pas.
  acces public.association_access not null default 'abonnes',

  -- Le même vocabulaire que les versions linguistiques d'un conte : deux
  -- états, et un brouillon n'existe pas pour le public.
  statut public.translation_status not null default 'brouillon',
  publie_le timestamptz,

  -- Durée de lecture, ÉCRITE et non estimée par un compteur de mots : c'est un
  -- geste éditorial, et un compteur se trompe sur un texte à listes.
  minutes smallint check (minutes > 0),
  image_url text,
  -- Mis en avant en tête de liste. Un seul à la fois, tenu par l'index partiel
  -- ci-dessous plutôt que par la bonne volonté des écrans.
  vedette boolean not null default false,
  ordre smallint not null default 0,

  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now(),

  constraint association_contents_publie_a_une_date
    check (statut <> 'publie' or publie_le is not null)
);

comment on table public.association_contents is
  'Contenus de l''espace Association Dave (§3.6, §4.1 F4 bis). `acces` dit lequel est réservé ; la décision d''accès elle-même vit dans `access_for_association`, nulle part ailleurs.';
comment on column public.association_contents.acces is
  'Niveau d''accès, posé CONTENU PAR CONTENU. Indépendant de tout abonnement de LECTURE : un abonné du catalogue n''entre pas ici (§3.6).';

create unique index association_contents_une_seule_vedette
  on public.association_contents ((true))
  where vedette and statut = 'publie';

create index association_contents_liste_idx
  on public.association_contents (statut, publie_le desc);

-- ---------------------------------------------------------------------------
-- 2. LES TEXTES, PAR LANGUE
--
-- Pas de `statut` par langue, contrairement à `book_translations`. La règle
-- d'internationalisation du projet est le repli sur le FRANÇAIS (CLAUDE.md) :
-- une traduction absente se replie, elle ne cache pas le contenu. Un état par
-- langue ferait un second interrupteur de publication, et deux interrupteurs
-- pour une même chose finissent par se contredire.
-- ---------------------------------------------------------------------------

create table public.association_content_translations (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.association_contents (id) on delete cascade,
  langue text not null check (langue in ('fr', 'en')),
  titre text not null check (length(btrim(titre)) > 0),
  chapeau text not null default '',
  -- Sections `{ titre?, paragraphes?[], points?[] }`, la forme que les écrans
  -- éditoriaux du site rendent déjà. En `jsonb` et non en Markdown : le Markdown
  -- mal formé se découvre en production, sur la page publiée.
  corps jsonb not null default '[]'::jsonb,
  maj_le timestamptz not null default public.app_now(),
  unique (content_id, langue),
  constraint association_corps_est_une_liste check (jsonb_typeof(corps) = 'array')
);

comment on column public.association_content_translations.corps is
  'Sections du texte. JAMAIS accordé en lecture à `anon` ni `authenticated` : c''est le PRIVILÈGE, et non une politique RLS, qui garde le contenu réservé (0069).';

-- ---------------------------------------------------------------------------
-- 3. LA DÉCISION D'ACCÈS — une seule implémentation, comme pour les contes
--
-- Même forme que `access_for_books` : par LOT, pour qu'une grille de vingt
-- contenus tienne en une requête, et `security definer` pour être appelable
-- depuis une politique RLS évaluée en tant qu'`anon`.
--
-- Le vocabulaire de `reason` est celui du catalogue, réemployé tel quel :
--
--   granted       administrateur
--   free          contenu `libre`, publié
--   subscription  contenu `abonnes`, ouvert par l'abonnement associatif
--   preview       publié, mais verrouillé — titre et chapeau visibles
--   none          brouillon : il n'existe pas
--
-- `can_download` n'existe pas ici, et ce n'est pas un oubli : un contenu
-- associatif ne se télécharge pas. Le téléchargement reste le fait d'un achat
-- de titre, et de rien d'autre (§3.2 principe 1).
-- ---------------------------------------------------------------------------

create function public.access_for_association(
  p_user uuid,
  p_slugs text[],
  p_at timestamptz default public.app_now()
)
  returns table (
    slug text,
    can_read boolean,
    reason public.access_reason
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  with appelant as (
    select
      p_user is not null and public.is_admin(p_user) as est_admin,
      -- LE MÊME APPEL QUE `access_for_books`, AVEC L'AUTRE DOMAINE. C'est la
      -- seule différence entre les deux moteurs, et elle tient en un mot.
      public.abonnement_ouvre_droit(p_user, 'association', p_at) as abonne
    from (select 1) as _
  ),
  demandes as (
    select distinct c.slug, c.statut, c.acces
    from unnest(p_slugs) as demande(slug)
    join public.association_contents c on c.slug = demande.slug
  ),
  calcul as (
    select
      d.slug,
      a.est_admin,
      a.abonne,
      (d.statut = 'publie') as publie,
      (d.acces = 'libre') as libre
    from demandes d
    cross join appelant a
  )
  select
    c.slug,
    (c.est_admin or (c.publie and (c.libre or c.abonne))) as can_read,
    (case
      when c.est_admin then 'granted'
      when c.publie and c.libre then 'free'
      when c.publie and c.abonne then 'subscription'
      when c.publie then 'preview'
      else 'none'
    end)::public.access_reason as reason
  from calcul c;
$fn$;

comment on function public.access_for_association(uuid, text[], timestamptz) is
  'Décision d''accès au contenu associatif (§3.6). Unique implémentation : l''application et les politiques RLS l''appellent toutes deux. Ne rend jamais de droit de téléchargement — il n''y en a pas ici.';

grant execute on function public.access_for_association(uuid, text[], timestamptz)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. SÉCURITÉ — RLS et privilèges (CLAUDE.md règle 1)
-- ---------------------------------------------------------------------------

alter table public.association_contents             enable row level security;
alter table public.association_content_translations enable row level security;

-- Les métadonnées d'un contenu PUBLIÉ sont publiques, verrouillé ou non : c'est
-- ce qui permet d'annoncer ce que l'abonnement associatif contient. Un
-- brouillon, lui, n'existe pour personne d'autre que l'administration, qui
-- passe par `service_role`.
grant select on public.association_contents to anon, authenticated;

create policy association_contents_lecture_publiee on public.association_contents
  for select to anon, authenticated
  using (statut = 'publie');

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ LES TROIS COLONNES ACCORDÉES, ET CELLE QUI NE L'EST PAS.                 │
-- │                                                                           │
-- │ `corps` est absent de cette liste, et c'est TOUTE la protection du        │
-- │ contenu réservé. L'ajouter ici ouvrirait chaque texte payant à n'importe  │
-- │ quel visiteur muni de la clé publique — sans qu'aucun écran ne change     │
-- │ d'apparence, et donc sans que rien ne le signale.                         │
-- └───────────────────────────────────────────────────────────────────────────┘
grant select (id, content_id, langue, titre, chapeau, maj_le)
  on public.association_content_translations to anon, authenticated;

create policy association_translations_lecture_publiee on public.association_content_translations
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.association_contents c
      where c.id = association_content_translations.content_id
        and c.statut = 'publie'
    )
  );

-- ---------------------------------------------------------------------------
-- 5. LA LISTE PUBLIQUE
--
-- Rend le verdict d'accès EN MÊME TEMPS que la ligne. L'écran affiche un
-- cadenas parce que la base a dit `preview`, jamais parce qu'il aurait comparé
-- `acces` à l'état d'un abonnement — c'est ce que `frontend-architecture`
-- interdit, et ce que cette colonne rend inutile.
-- ---------------------------------------------------------------------------

create function public.association_liste(
  p_user uuid default null,
  p_langue text default 'fr',
  p_at timestamptz default public.app_now()
)
  returns table (
    slug text,
    categorie public.association_category,
    acces public.association_access,
    publie_le timestamptz,
    minutes smallint,
    image_url text,
    vedette boolean,
    titre text,
    chapeau text,
    can_read boolean,
    reason public.access_reason
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select
    c.slug,
    c.categorie,
    c.acces,
    c.publie_le,
    c.minutes,
    c.image_url,
    c.vedette,
    -- REPLI SUR LE FRANÇAIS, jamais sur le slug (CLAUDE.md, internationalisation).
    coalesce(t.titre, fr.titre) as titre,
    coalesce(t.chapeau, fr.chapeau) as chapeau,
    a.can_read,
    a.reason
  from public.association_contents c
  left join public.association_content_translations t
    on t.content_id = c.id and t.langue = p_langue
  left join public.association_content_translations fr
    on fr.content_id = c.id and fr.langue = 'fr'
  join public.access_for_association(
         p_user,
         array(select slug from public.association_contents where statut = 'publie'),
         p_at
       ) a on a.slug = c.slug
  where c.statut = 'publie'
  order by c.vedette desc, c.ordre, c.publie_le desc, c.slug;
$fn$;

comment on function public.association_liste(uuid, text, timestamptz) is
  'Contenus associatifs publiés, avec le verdict d''accès de chacun pour l''appelant. L''écran LIT `can_read` ; il ne le déduit pas.';

grant execute on function public.association_liste(uuid, text, timestamptz)
  to anon, authenticated, service_role;

/**
 * Un contenu, corps compris — ET SEULEMENT SI LE DROIT EST OUVERT.
 *
 * Le corps est rendu `null` quand `can_read` est faux, plutôt que la fonction
 * ne rende aucune ligne : l'écran a besoin du titre et du chapeau pour dire ce
 * qui est verrouillé et proposer l'abonnement. Rendre zéro ligne obligerait
 * l'appelant à faire un second appel, et c'est dans ce second appel qu'un jour
 * quelqu'un oublierait la vérification.
 */
create function public.association_contenu(
  p_user uuid,
  p_slug text,
  p_langue text default 'fr',
  p_at timestamptz default public.app_now()
)
  returns table (
    slug text,
    categorie public.association_category,
    acces public.association_access,
    publie_le timestamptz,
    minutes smallint,
    image_url text,
    titre text,
    chapeau text,
    corps jsonb,
    can_read boolean,
    reason public.access_reason
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select
    c.slug,
    c.categorie,
    c.acces,
    c.publie_le,
    c.minutes,
    c.image_url,
    coalesce(t.titre, fr.titre) as titre,
    coalesce(t.chapeau, fr.chapeau) as chapeau,
    case when a.can_read then coalesce(t.corps, fr.corps) else null end as corps,
    a.can_read,
    a.reason
  from public.association_contents c
  left join public.association_content_translations t
    on t.content_id = c.id and t.langue = p_langue
  left join public.association_content_translations fr
    on fr.content_id = c.id and fr.langue = 'fr'
  join public.access_for_association(p_user, array[c.slug], p_at) a on a.slug = c.slug
  where c.slug = p_slug
    and (c.statut = 'publie' or a.can_read);
$fn$;

comment on function public.association_contenu(uuid, text, text, timestamptz) is
  'Un contenu associatif. Le CORPS n''est rendu que si `can_read` : la condition est écrite ici, une fois, et aucun appelant n''a à la refaire.';

grant execute on function public.association_contenu(uuid, text, text, timestamptz)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. L'ADMINISTRATION
-- ---------------------------------------------------------------------------

create function public.admin_lister_contenus_association()
  returns table (
    id uuid,
    slug text,
    categorie public.association_category,
    acces public.association_access,
    statut public.translation_status,
    publie_le timestamptz,
    vedette boolean,
    ordre smallint,
    titre text,
    langues text[]
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select
    c.id,
    c.slug,
    c.categorie,
    c.acces,
    c.statut,
    c.publie_le,
    c.vedette,
    c.ordre,
    coalesce(fr.titre, c.slug) as titre,
    array(
      select t.langue from public.association_content_translations t
      where t.content_id = c.id order by t.langue
    ) as langues
  from public.association_contents c
  left join public.association_content_translations fr
    on fr.content_id = c.id and fr.langue = 'fr'
  order by c.statut, c.publie_le desc nulls first, c.cree_le desc;
$fn$;

comment on function public.admin_lister_contenus_association() is
  'Tous les contenus associatifs, brouillons compris, pour le back-office.';

revoke all on function public.admin_lister_contenus_association() from public, anon, authenticated;
grant execute on function public.admin_lister_contenus_association() to service_role;

create function public.admin_lire_contenu_association(p_id uuid)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'categorie', c.categorie,
    'acces', c.acces,
    'statut', c.statut,
    'publie_le', c.publie_le,
    'minutes', c.minutes,
    'image_url', c.image_url,
    'vedette', c.vedette,
    'ordre', c.ordre,
    'versions', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'langue', t.langue,
                   'titre', t.titre,
                   'chapeau', t.chapeau,
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
$fn$;

comment on function public.admin_lire_contenu_association(uuid) is
  'Un contenu associatif et toutes ses versions linguistiques, corps compris, pour l''écran d''édition.';

revoke all on function public.admin_lire_contenu_association(uuid) from public, anon, authenticated;
grant execute on function public.admin_lire_contenu_association(uuid) to service_role;

create function public.admin_creer_contenu_association(
  p_acteur uuid,
  p_slug text,
  p_categorie public.association_category,
  p_titre text,
  p_chapeau text default '',
  p_acces public.association_access default 'abonnes',
  p_minutes smallint default null,
  p_image_url text default null
)
  returns public.association_contents
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_contenu public.association_contents;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  insert into public.association_contents (slug, categorie, acces, minutes, image_url)
  values (btrim(lower(p_slug)), p_categorie, p_acces, p_minutes,
          nullif(btrim(coalesce(p_image_url, '')), ''))
  returning * into v_contenu;

  -- La version française est créée d'office : c'est elle qui fait foi, et sur
  -- laquelle toutes les autres se replient. Un contenu sans version française
  -- s'afficherait sous son slug.
  insert into public.association_content_translations (content_id, langue, titre, chapeau)
  values (v_contenu.id, 'fr', btrim(p_titre), btrim(coalesce(p_chapeau, '')));

  return v_contenu;
end;
$fn$;

comment on function public.admin_creer_contenu_association(uuid, text, public.association_category, text, text, public.association_access, smallint, text) is
  'Crée un contenu associatif, toujours en BROUILLON, avec sa version française.';

revoke all on function public.admin_creer_contenu_association(uuid, text, public.association_category, text, text, public.association_access, smallint, text)
  from public, anon, authenticated;
grant execute on function public.admin_creer_contenu_association(uuid, text, public.association_category, text, text, public.association_access, smallint, text)
  to service_role;

create function public.admin_modifier_contenu_association(
  p_acteur uuid,
  p_id uuid,
  p_categorie public.association_category default null,
  p_acces public.association_access default null,
  p_minutes smallint default null,
  p_image_url text default null,
  p_vedette boolean default null,
  p_ordre smallint default null
)
  returns public.association_contents
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_contenu public.association_contents;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if not exists (select 1 from public.association_contents where id = p_id) then
    raise exception 'Contenu % introuvable.', p_id using errcode = 'no_data_found';
  end if;

  -- La mise en vedette est EXCLUSIVE, et l'index partiel le fait respecter.
  -- Retirer la précédente ici plutôt que de laisser l'écriture échouer évite de
  -- demander à l'éditeur de deviner quel autre contenu il doit d'abord
  -- déclasser.
  if p_vedette is true then
    update public.association_contents set vedette = false, maj_le = public.app_now()
    where vedette and id <> p_id;
  end if;

  update public.association_contents
  set categorie = coalesce(p_categorie, categorie),
      acces = coalesce(p_acces, acces),
      minutes = coalesce(p_minutes, minutes),
      image_url = case when p_image_url is null then image_url
                       else nullif(btrim(p_image_url), '') end,
      vedette = coalesce(p_vedette, vedette),
      ordre = coalesce(p_ordre, ordre),
      maj_le = public.app_now()
  where id = p_id
  returning * into v_contenu;

  return v_contenu;
end;
$fn$;

comment on function public.admin_modifier_contenu_association(uuid, uuid, public.association_category, public.association_access, smallint, text, boolean, smallint) is
  'Modifie les attributs d''un contenu associatif. La mise en vedette déclasse la précédente : l''exclusivité est tenue en base, pas par l''écran.';

revoke all on function public.admin_modifier_contenu_association(uuid, uuid, public.association_category, public.association_access, smallint, text, boolean, smallint)
  from public, anon, authenticated;
grant execute on function public.admin_modifier_contenu_association(uuid, uuid, public.association_category, public.association_access, smallint, text, boolean, smallint)
  to service_role;

create function public.admin_poser_version_association(
  p_acteur uuid,
  p_id uuid,
  p_langue text,
  p_titre text,
  p_chapeau text default null,
  p_corps jsonb default null
)
  returns public.association_content_translations
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_version public.association_content_translations;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if not exists (select 1 from public.association_contents where id = p_id) then
    raise exception 'Contenu % introuvable.', p_id using errcode = 'no_data_found';
  end if;

  insert into public.association_content_translations
    (content_id, langue, titre, chapeau, corps)
  values
    (p_id, p_langue, btrim(p_titre), btrim(coalesce(p_chapeau, '')),
     coalesce(p_corps, '[]'::jsonb))
  on conflict (content_id, langue) do update
    set titre = btrim(p_titre),
        chapeau = coalesce(btrim(p_chapeau), association_content_translations.chapeau),
        corps = coalesce(p_corps, association_content_translations.corps),
        maj_le = public.app_now()
  returning * into v_version;

  return v_version;
end;
$fn$;

comment on function public.admin_poser_version_association(uuid, uuid, text, text, text, jsonb) is
  'Pose ou remplace une version linguistique d''un contenu associatif.';

revoke all on function public.admin_poser_version_association(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_poser_version_association(uuid, uuid, text, text, text, jsonb)
  to service_role;

/**
 * Publication et dépublication.
 *
 * `publie_le` est posée à la PREMIÈRE publication et conservée ensuite :
 * dépublier puis republier un contenu ne doit pas le faire réapparaître en
 * tête de liste comme une nouveauté.
 */
create function public.admin_publier_contenu_association(
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
  set statut = case when p_publie then 'publie' else 'brouillon' end,
      publie_le = case when p_publie then coalesce(publie_le, public.app_now()) else publie_le end,
      maj_le = public.app_now()
  where id = p_id
  returning * into v_contenu;

  return v_contenu;
end;
$fn$;

comment on function public.admin_publier_contenu_association(uuid, uuid, boolean) is
  'Publie ou dépublie un contenu associatif. La publication exige une version française complète ; `publie_le` n''est posée qu''une fois.';

revoke all on function public.admin_publier_contenu_association(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_publier_contenu_association(uuid, uuid, boolean) to service_role;

create function public.admin_supprimer_contenu_association(p_acteur uuid, p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_statut public.translation_status;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  select statut into v_statut from public.association_contents where id = p_id;
  if not found then
    raise exception 'Contenu % introuvable.', p_id using errcode = 'no_data_found';
  end if;

  -- Un contenu PUBLIÉ a une adresse que des gens ont pu partager. Le dépublier
  -- d'abord est un geste explicite ; le supprimer d'un clic ne l'est pas.
  if v_statut = 'publie' then
    raise exception 'Depubliez ce contenu avant de le supprimer.'
      using errcode = 'check_violation';
  end if;

  delete from public.association_contents where id = p_id;
end;
$fn$;

comment on function public.admin_supprimer_contenu_association(uuid, uuid) is
  'Supprime un contenu associatif en BROUILLON. Un contenu publié doit d''abord être dépublié.';

revoke all on function public.admin_supprimer_contenu_association(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_supprimer_contenu_association(uuid, uuid) to service_role;
