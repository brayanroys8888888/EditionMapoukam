-- ═══════════════════════════════════════════════════════════════════════════
-- LES TÉMOIGNAGES DU SITE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Les trois témoignages de la page d'accueil — Sophie, Thomas, Aïcha — vivaient
-- dans `src/i18n/fr.json`, sous les clés `v2.avis1` à `v2.avis3`. Un texte
-- d'interface, donc : au même rang qu'un libellé de bouton, modifiable
-- uniquement par un déploiement.
--
-- Ce n'était pas un mauvais choix tant qu'ils étaient trois exemples posés là
-- pour dessiner la page. Ils cessent de l'être dès qu'on veut les changer.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI UNE TABLE À PART, ET NON `book_reviews`.                       │
-- │                                                                         │
-- │ Les deux s'appellent « avis » en français courant, et c'est exactement   │
-- │ pourquoi il faut les séparer en base :                                   │
-- │                                                                         │
-- │  · un avis de lecteur porte sur UN TITRE, il est écrit par son auteur    │
-- │    depuis son compte, il a une note sur cinq, et l'éditeur ne peut ni    │
-- │    l'écrire ni le réécrire — seulement le publier ou le refuser ;         │
-- │                                                                         │
-- │  · un témoignage porte sur LE SITE, il est choisi et mis en forme par    │
-- │    l'éditeur, il n'a pas de note, et il est traduit.                     │
-- │                                                                         │
-- │ Une table commune leur donnerait un `book_id` nullable, un `note`         │
-- │ nullable, une moitié de colonnes vides dans chaque ligne, et une         │
-- │ politique RLS qui devrait dire « écriture réservée à l'auteur, SAUF si   │
-- │ ». Ce « sauf si » est le début de toutes les failles.                     │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- La forme suit celle des livres et des contenus associatifs : une table
-- porteuse pour ce qui ne se traduit pas, une table de versions linguistiques
-- pour ce qui se traduit. Le NOM d'une personne ne se traduit pas ; sa
-- fonction — « maman de deux enfants », « enseignant » — si.

-- ---------------------------------------------------------------------------
-- 1. LES TABLES
-- ---------------------------------------------------------------------------

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),

  -- Le nom sous lequel la personne accepte d'apparaître. Sur la table
  -- porteuse et non sur les versions : traduire un prénom serait inventer une
  -- autre personne.
  auteur text not null,

  statut public.translation_status not null default 'brouillon',

  -- L'ordre d'affichage, décidé par l'éditeur. Ce n'est pas une date de
  -- création déguisée : la page d'accueil en montre trois, et lesquels tient
  -- de la composition, pas de la chronologie.
  ordre smallint not null default 0,

  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now(),

  constraint testimonials_auteur_utile
    check (length(btrim(auteur)) between 1 and 80)
);

comment on table public.testimonials is
  'Témoignages sur le SITE, affichés en page d''accueil (§4.1 F1). Choisis et mis en forme par l''éditeur — à ne pas confondre avec `book_reviews`, qui porte les avis écrits par les lecteurs sur un titre.';
comment on column public.testimonials.ordre is
  'Ordre d''affichage voulu par l''éditeur. La page d''accueil en montre trois : lesquels relève de la composition, pas de la chronologie.';

create table public.testimonial_translations (
  testimonial_id uuid not null references public.testimonials (id) on delete cascade,
  langue text not null,

  texte text not null,
  -- La fonction de la personne : « maman de deux enfants », « enseignant ».
  -- Facultative — un témoignage peut se passer de signature détaillée.
  role text,

  maj_le timestamptz not null default public.app_now(),

  primary key (testimonial_id, langue),

  constraint testimonial_translations_langue_connue
    check (langue in ('fr', 'en')),
  constraint testimonial_translations_texte_utile
    check (length(btrim(texte)) between 10 and 600)
);

comment on table public.testimonial_translations is
  'Versions linguistiques d''un témoignage. Le texte et la fonction se traduisent ; le nom de la personne, lui, est sur la table porteuse.';

create index testimonials_affichage_idx
  on public.testimonials (ordre, cree_le)
  where statut = 'publie';

-- ---------------------------------------------------------------------------
-- 2. LES POLITIQUES
--
-- Aucune écriture cliente, sur aucune des deux tables : un témoignage est un
-- contenu éditorial, il n'entre que par le back-office. Le refus est écrit,
-- pas seulement obtenu par l'absence de politique — une table sans politique
-- explicite est un oubli qui se lit comme une décision.
-- ---------------------------------------------------------------------------

alter table public.testimonials enable row level security;
alter table public.testimonial_translations enable row level security;

create policy testimonials_lecture_publique on public.testimonials
  for select to anon, authenticated
  using (statut = 'publie');

create policy testimonials_aucune_ecriture_cliente on public.testimonials
  for all to anon, authenticated
  using (false)
  with check (false);

create policy testimonial_translations_lecture_publique on public.testimonial_translations
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.testimonials t
      where t.id = testimonial_id and t.statut = 'publie'
    )
  );

create policy testimonial_translations_aucune_ecriture_cliente on public.testimonial_translations
  for all to anon, authenticated
  using (false)
  with check (false);

grant select on public.testimonials to anon, authenticated;
grant select on public.testimonial_translations to anon, authenticated;
grant all on public.testimonials to service_role;
grant all on public.testimonial_translations to service_role;

-- ---------------------------------------------------------------------------
-- 3. LA LECTURE PUBLIQUE
--
-- Repli sur le français, comme partout ailleurs dans ce dépôt : une clé
-- manquante en anglais rend le texte français, jamais un blanc. Un témoignage
-- publié mais non traduit doit s'afficher — sans quoi la page d'accueil
-- anglaise se viderait au premier ajout.
-- ---------------------------------------------------------------------------

create function public.temoignages(p_langue text default 'fr', p_limite integer default 3)
  returns table (
    id uuid,
    auteur text,
    texte text,
    role text
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select
    t.id,
    t.auteur,
    coalesce(v.texte, fr.texte) as texte,
    coalesce(v.role, fr.role) as role
  from public.testimonials t
  left join public.testimonial_translations v
    on v.testimonial_id = t.id and v.langue = p_langue
  left join public.testimonial_translations fr
    on fr.testimonial_id = t.id and fr.langue = 'fr'
  where t.statut = 'publie'
    and coalesce(v.texte, fr.texte) is not null
  order by t.ordre, t.cree_le
  limit greatest(p_limite, 0);
$fn$;

comment on function public.temoignages(text, integer) is
  'Témoignages publiés, dans l''ordre voulu par l''éditeur, avec repli sur le français. Un témoignage sans aucun texte n''est pas rendu : il serait une signature sans citation.';

grant execute on function public.temoignages(text, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. L'ADMINISTRATION
-- ---------------------------------------------------------------------------

create function public.admin_lister_temoignages()
  returns table (
    id uuid,
    auteur text,
    statut public.translation_status,
    ordre smallint,
    cree_le timestamptz,
    maj_le timestamptz,
    texte_fr text,
    langues text[]
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select
    t.id,
    t.auteur,
    t.statut,
    t.ordre,
    t.cree_le,
    t.maj_le,
    fr.texte as texte_fr,
    array(
      select v.langue from public.testimonial_translations v
      where v.testimonial_id = t.id order by v.langue
    ) as langues
  from public.testimonials t
  left join public.testimonial_translations fr
    on fr.testimonial_id = t.id and fr.langue = 'fr'
  order by t.statut, t.ordre, t.cree_le;
$fn$;

comment on function public.admin_lister_temoignages() is
  'Tous les témoignages, brouillons compris, pour le back-office.';

revoke all on function public.admin_lister_temoignages() from public, anon, authenticated;
grant execute on function public.admin_lister_temoignages() to service_role;

create function public.admin_lire_temoignage(p_id uuid)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'id', t.id,
    'auteur', t.auteur,
    'statut', t.statut,
    'ordre', t.ordre,
    'cree_le', t.cree_le,
    'maj_le', t.maj_le,
    'versions', coalesce((
      select jsonb_agg(
        jsonb_build_object('langue', v.langue, 'texte', v.texte, 'role', v.role)
        order by v.langue
      )
      from public.testimonial_translations v where v.testimonial_id = t.id
    ), '[]'::jsonb)
  )
  from public.testimonials t
  where t.id = p_id;
$fn$;

comment on function public.admin_lire_temoignage(uuid) is
  'Un témoignage et toutes ses versions linguistiques, pour l''écran d''édition.';

revoke all on function public.admin_lire_temoignage(uuid) from public, anon, authenticated;
grant execute on function public.admin_lire_temoignage(uuid) to service_role;

create function public.admin_enregistrer_temoignage(
  p_acteur uuid,
  p_id uuid,
  p_auteur text,
  p_ordre smallint,
  p_versions jsonb
)
  returns public.testimonials
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_temoignage public.testimonials;
  v_version jsonb;
  v_texte text;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if p_id is null then
    insert into public.testimonials (auteur, ordre)
    values (btrim(p_auteur), coalesce(p_ordre, 0))
    returning * into v_temoignage;
  else
    update public.testimonials
    set auteur = btrim(p_auteur),
        ordre = coalesce(p_ordre, ordre),
        maj_le = public.app_now()
    where id = p_id
    returning * into v_temoignage;

    if not found then
      raise exception 'Temoignage % introuvable.', p_id using errcode = 'no_data_found';
    end if;
  end if;

  -- Les versions arrivent en bloc : `[{ langue, texte, role }, …]`. Une langue
  -- ABSENTE du tableau est laissée telle quelle ; une langue présente avec un
  -- texte vide est SUPPRIMÉE. C'est ainsi que l'éditeur retire une traduction
  -- sans qu'un second bouton soit nécessaire — et la règle est écrite ici, une
  -- fois, plutôt que devinée par chaque écran.
  for v_version in select * from jsonb_array_elements(coalesce(p_versions, '[]'::jsonb))
  loop
    v_texte := btrim(coalesce(v_version->>'texte', ''));

    if v_texte = '' then
      delete from public.testimonial_translations
      where testimonial_id = v_temoignage.id and langue = v_version->>'langue';
    else
      insert into public.testimonial_translations (testimonial_id, langue, texte, role)
      values (
        v_temoignage.id,
        v_version->>'langue',
        v_texte,
        nullif(btrim(coalesce(v_version->>'role', '')), '')
      )
      on conflict (testimonial_id, langue) do update
      set texte = excluded.texte,
          role = excluded.role,
          maj_le = public.app_now();
    end if;
  end loop;

  return v_temoignage;
end;
$fn$;

comment on function public.admin_enregistrer_temoignage(uuid, uuid, text, smallint, jsonb) is
  'Crée ou met à jour un témoignage et ses versions linguistiques. Une langue absente du tableau est laissée intacte ; une langue au texte vide est supprimée.';

revoke all on function public.admin_enregistrer_temoignage(uuid, uuid, text, smallint, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_enregistrer_temoignage(uuid, uuid, text, smallint, jsonb)
  to service_role;

create function public.admin_publier_temoignage(
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
  set statut = case when p_publie then 'publie' else 'brouillon' end,
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
  'Publie ou dépublie un témoignage. La publication exige un texte français.';

revoke all on function public.admin_publier_temoignage(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_publier_temoignage(uuid, uuid, boolean) to service_role;

create function public.admin_supprimer_temoignage(p_acteur uuid, p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
begin
  perform public.admin_poser_acteur(p_acteur, null);
  delete from public.testimonials where id = p_id;
end;
$fn$;

comment on function public.admin_supprimer_temoignage(uuid, uuid) is
  'Supprime un témoignage et ses versions linguistiques.';

revoke all on function public.admin_supprimer_temoignage(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_supprimer_temoignage(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. LA REPRISE DES TROIS TÉMOIGNAGES EXISTANTS
--
-- Ce sont les textes qui étaient dans `src/i18n/fr.json` et `en.json`, repris
-- mot pour mot. Ce n'est pas un jeu de démonstration : c'est le CONTENU DE LA
-- PAGE D'ACCUEIL, qui doit continuer d'exister à la seconde où les écrans
-- cessent de lire les clés d'internationalisation. Sans cette section, la
-- section « Ce qu'en disent les familles » se viderait au déploiement.
--
-- `on conflict do nothing` sur un identifiant fixe : rejouer la migration sur
-- une base qui les a déjà ne créerait pas de doublons — et l'éditeur qui les
-- aurait déjà réécrits ne les verrait pas revenir à leur version d'origine.
-- ---------------------------------------------------------------------------

insert into public.testimonials (id, auteur, statut, ordre) values
  ('a51e0000-0000-4000-8000-000000000001', 'Sophie', 'publie', 1),
  ('a51e0000-0000-4000-8000-000000000002', 'Thomas', 'publie', 2),
  ('a51e0000-0000-4000-8000-000000000003', 'Aïcha',  'publie', 3)
on conflict (id) do nothing;

insert into public.testimonial_translations (testimonial_id, langue, texte, role) values
  ('a51e0000-0000-4000-8000-000000000001', 'fr',
   'Mes enfants de 5 et 7 ans adorent ces histoires. Les valeurs de courage et de gentillesse sont magnifiquement transmises.',
   'Maman de deux enfants'),
  ('a51e0000-0000-4000-8000-000000000001', 'en',
   'My children, 5 and 7, love these stories. The values of courage and kindness come across beautifully.',
   'Mother of two'),

  ('a51e0000-0000-4000-8000-000000000002', 'fr',
   'Je l’ai utilisé en classe pour aborder la culture africaine. Les enfants ont été fascinés par l’histoire et les personnages.',
   'Instituteur en maternelle'),
  ('a51e0000-0000-4000-8000-000000000002', 'en',
   'I used it in class to introduce African culture. The children were fascinated by the story and the characters.',
   'Nursery teacher'),

  ('a51e0000-0000-4000-8000-000000000003', 'fr',
   'J’en ai offert à mes petits-enfants. Ils réclament l’histoire chaque soir, et j’apprécie particulièrement la manière de raconter.',
   'Grand-mère'),
  ('a51e0000-0000-4000-8000-000000000003', 'en',
   'I gave them to my grandchildren. They ask for the story every night, and I especially like the way it is told.',
   'Grandmother')
on conflict (testimonial_id, langue) do nothing;
