-- ═══════════════════════════════════════════════════════════════════════════
-- LES AVIS DES LECTEURS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Décision de l'éditeur, 3 septembre 2026 : les avis sont écrits par LES
-- CLIENTS depuis leur compte, pas saisis par l'administration. C'est la seule
-- version qui ait une valeur — un avis rédigé au back-office n'est pas un avis,
-- c'est une accroche publicitaire, et le lecteur le sent.
--
-- Cela fait de cette table la PREMIÈRE de ce dépôt où un visiteur écrit du
-- texte destiné à être lu par d'autres visiteurs. Trois questions en découlent,
-- et elles sont toutes tranchées ici plutôt que dans l'application.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 1. QUI PEUT ÉCRIRE ? — celui qui a réellement le titre.                 │
-- │                                                                         │
-- │ La condition d'écriture est `access_for(...).can_read`, l'unique         │
-- │ implémentation du droit d'accès (CLAUDE.md, décision D1). Elle couvre    │
-- │ donc les trois chemins : l'achat, l'abonnement, et le titre offert.      │
-- │                                                                         │
-- │ La question avait d'abord été posée en termes d'« achat vérifié ». Ce    │
-- │ vocabulaire vient des boutiques à modèle unique. Ici il exclurait les    │
-- │ abonnés — c'est-à-dire le chemin de lecture MAJORITAIRE de la            │
-- │ plateforme — et n'autoriserait aucun avis sur un titre offert, qui est   │
-- │ pourtant la porte d'entrée du catalogue. « A réellement le titre » est   │
-- │ ce que l'expression voulait dire ; `can_read` est la seule façon de      │
-- │ l'écrire sans réinventer la règle.                                       │
-- │                                                                         │
-- │ La condition est dans la POLITIQUE RLS, pas dans la route. Une route     │
-- │ peut oublier un `where` ; une politique s'applique à toute requête, y    │
-- │ compris à celle qu'un client fabriquerait lui-même avec son jeton.       │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 2. QUAND EST-CE PUBLIÉ ? — après modération, jamais avant.              │
-- │                                                                         │
-- │ `statut` naît à `en_attente` et rien du côté client ne peut le porter à  │
-- │ `publie` : la colonne n'est pas dans le `grant insert`, ni dans le       │
-- │ `grant update`. Ce n'est pas une redondance avec la politique, c'est un  │
-- │ verrou d'une autre nature — un privilège de colonne refuse la valeur     │
-- │ avant même qu'une politique soit évaluée.                                │
-- │                                                                         │
-- │ Et un avis MODIFIÉ repasse en modération : le déclencheur                │
-- │ `book_reviews_remise_en_moderation` s'en charge. Sans lui, il suffirait  │
-- │ de faire approuver un texte anodin puis de le remplacer.                 │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 3. QUEL NOM S'AFFICHE ? — celui que l'auteur a choisi, copié ici.       │
-- │                                                                         │
-- │ `auteur_affiche` est une colonne de cette table, et non une jointure     │
-- │ vers `users.nom_complet`. Deux raisons, et la seconde suffirait :         │
-- │                                                                         │
-- │  · une jointure obligerait à ouvrir `users` en lecture publique pour     │
-- │    afficher un avis — on exposerait l'annuaire des comptes pour rendre   │
-- │    trois lignes de texte ;                                               │
-- │  · le nom affiché est un choix éditorial de l'auteur au moment où il     │
-- │    écrit. Renommer son compte ne doit pas réécrire rétroactivement la    │
-- │    signature d'un avis déjà publié et déjà lu.                           │
-- └─────────────────────────────────────────────────────────────────────────┘

-- ---------------------------------------------------------------------------
-- 1. LE STATUT DE MODÉRATION
--
-- Une énumération à trois valeurs plutôt qu'un booléen `publie` : « rejeté »
-- et « en attente » ne sont pas le même état. Confondus, un avis refusé
-- reviendrait indéfiniment dans la file de modération, et son auteur ne
-- pourrait jamais savoir pourquoi il n'apparaît pas.
-- ---------------------------------------------------------------------------

create type public.review_status as enum ('en_attente', 'publie', 'rejete');

comment on type public.review_status is
  'Cycle de vie d''un avis de lecteur. `en_attente` à la création et après toute modification du texte ; `publie` ou `rejete` par un administrateur.';

-- ---------------------------------------------------------------------------
-- 2. LA TABLE
-- ---------------------------------------------------------------------------

create table public.book_reviews (
  id uuid primary key default gen_random_uuid(),

  book_id uuid not null references public.books (id) on delete cascade,

  -- `on delete restrict`, comme toute clé étrangère vers `users` depuis la
  -- migration 0012 : il n'y a plus de suppression physique de compte, et une
  -- suppression accidentelle doit échouer plutôt qu'emporter l'historique en
  -- silence. L'effacement d'un compte passe par `anonymize_user`, qui traite
  -- cette table explicitement — voir la section 6.
  user_id uuid not null references public.users (id) on delete restrict,

  note smallint not null,
  texte text not null,
  auteur_affiche text not null,

  statut public.review_status not null default 'en_attente',

  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now(),

  modere_le timestamptz,
  modere_par uuid references public.users (id) on delete restrict,
  motif_rejet text,

  -- Un lecteur, un avis par titre. Sans cette contrainte, dix envois du même
  -- formulaire feraient dix avis identiques — et la moyenne suivrait.
  unique (book_id, user_id),

  constraint book_reviews_note_de_1_a_5
    check (note between 1 and 5),

  -- Les bornes sont ici et non dans le formulaire. Un texte de trois
  -- caractères n'est pas un avis, un texte de dix mille est un abus de la
  -- file de modération, et l'un comme l'autre atteindraient la table si la
  -- seule barrière était en TypeScript.
  constraint book_reviews_texte_utile
    check (length(btrim(texte)) between 10 and 2000),

  constraint book_reviews_auteur_affiche_utile
    check (length(btrim(auteur_affiche)) between 1 and 60),

  -- Un avis modéré porte la date de sa modération, et un avis en attente n'en
  -- porte pas. Sans cette égalité, « publié » et « publié par personne » se
  -- ressembleraient dans la table.
  constraint book_reviews_moderation_datee
    check ((statut = 'en_attente') = (modere_le is null)),

  -- Un motif n'a de sens que pour un refus.
  constraint book_reviews_motif_reserve_au_rejet
    check (motif_rejet is null or statut = 'rejete')
);

comment on table public.book_reviews is
  'Avis écrits par les lecteurs sur un titre du catalogue (§4.2). Un avis par lecteur et par titre. Écriture réservée à qui a réellement accès au titre — la condition est `access_for().can_read`, dans la politique RLS. Publication après modération, jamais avant. Données personnelles : effacées par anonymize_user().';

comment on column public.book_reviews.auteur_affiche is
  'Nom d''affichage choisi par l''auteur au moment où il écrit. Copié ici et non joint depuis `users` : afficher un avis ne doit pas exiger d''ouvrir l''annuaire des comptes, et renommer son compte ne doit pas réécrire une signature déjà publiée.';
comment on column public.book_reviews.statut is
  'Modération. Aucune écriture cliente ne peut porter cette colonne à `publie` : elle n''est ni dans le `grant insert` ni dans le `grant update` accordés à `authenticated`.';
comment on column public.book_reviews.motif_rejet is
  'Motif du refus, visible de son SEUL auteur (politique `book_reviews_lecture_propre`). Un refus muet est incompréhensible pour qui l''a reçu.';

-- Les deux lectures qui existent : la liste publique d'un titre, et « mes
-- avis » depuis le compte. La file de modération, elle, tient dans un index
-- partiel — les avis en attente sont par construction une petite minorité.
create index book_reviews_titre_idx
  on public.book_reviews (book_id, cree_le desc)
  where statut = 'publie';
create index book_reviews_auteur_idx on public.book_reviews (user_id, cree_le desc);
create index book_reviews_file_moderation_idx
  on public.book_reviews (cree_le)
  where statut = 'en_attente';

-- ---------------------------------------------------------------------------
-- 3. LE RETOUR EN MODÉRATION
--
-- Modifier un avis le renvoie en attente. C'est la seule façon d'empêcher le
-- tour de passe-passe évident : faire approuver un texte inoffensif, puis le
-- remplacer par autre chose.
--
-- Le déclencheur ne se déclenche que si le CONTENU change. Sans cette
-- condition, la modération elle-même — qui écrit `statut` et `modere_le` —
-- annulerait son propre effet à chaque passage.
-- ---------------------------------------------------------------------------

create function public.book_reviews_remise_en_moderation()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $fn$
begin
  new.maj_le := public.app_now();

  if new.texte is distinct from old.texte
     or new.note is distinct from old.note
     or new.auteur_affiche is distinct from old.auteur_affiche
  then
    new.statut := 'en_attente';
    new.modere_le := null;
    new.modere_par := null;
    new.motif_rejet := null;
  end if;

  return new;
end;
$fn$;

comment on function public.book_reviews_remise_en_moderation() is
  'Tout avis dont le texte, la note ou la signature change repasse en attente de modération. Empêche de faire approuver un texte puis de le remplacer.';

create trigger book_reviews_remise_en_moderation
  before update on public.book_reviews
  for each row execute function public.book_reviews_remise_en_moderation();

-- ---------------------------------------------------------------------------
-- 4. LES POLITIQUES
--
-- Refus par défaut : RLS activé, et aucun privilège qui ne soit accordé
-- colonne par colonne ci-dessous.
-- ---------------------------------------------------------------------------

alter table public.book_reviews enable row level security;

-- Lecture publique : les avis PUBLIÉS des titres PUBLIÉS. La seconde condition
-- n'est pas décorative — sans elle, la présence d'un avis trahirait
-- l'existence d'un titre en préparation.
create policy book_reviews_lecture_publique on public.book_reviews
  for select to anon, authenticated
  using (
    statut = 'publie'
    and exists (
      select 1 from public.books b where b.id = book_id and b.statut = 'publie'
    )
  );

-- Lecture de ses propres avis, quel que soit leur statut : c'est ainsi que son
-- auteur voit « en attente de validation » ou lit le motif d'un refus.
create policy book_reviews_lecture_propre on public.book_reviews
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy book_reviews_ecriture on public.book_reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.books b where b.id = book_id and b.statut = 'publie'
    )
    -- L'unique implémentation du droit d'accès. On n'écrit pas ici « a acheté
    -- ou est abonné » : ce serait une seconde implémentation, et c'est
    -- toujours la copie qui finit par avoir tort.
    and (public.access_for((select auth.uid()), book_id)).can_read
  );

-- La mise à jour ne peut porter que sur `note`, `texte` et `auteur_affiche` —
-- voir les privilèges de colonne ci-dessous. La politique dit QUELLES LIGNES ;
-- le privilège dit QUELLES COLONNES. Il faut les deux.
create policy book_reviews_correction on public.book_reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Retirer son avis est un droit, y compris une fois publié.
create policy book_reviews_retrait on public.book_reviews
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. LES PRIVILÈGES, COLONNE PAR COLONNE
--
-- `anon` ne voit pas `user_id` : afficher un avis ne demande pas de savoir
-- QUEL COMPTE l'a écrit, et l'identifiant permettrait de recoller entre eux
-- les avis d'une même personne à travers tout le catalogue.
--
-- Personne, côté client, ne voit `modere_par` ni ne peut écrire `statut`,
-- `modere_le`, `modere_par` ou `motif_rejet`. La modération n'est pas une
-- opération que l'on demande poliment au client de ne pas faire.
-- ---------------------------------------------------------------------------

grant select (id, book_id, note, texte, auteur_affiche, statut, cree_le)
  on public.book_reviews to anon;

grant select (id, book_id, user_id, note, texte, auteur_affiche, statut, cree_le, maj_le, motif_rejet)
  on public.book_reviews to authenticated;

grant insert (book_id, user_id, note, texte, auteur_affiche)
  on public.book_reviews to authenticated;

grant update (note, texte, auteur_affiche)
  on public.book_reviews to authenticated;

grant delete on public.book_reviews to authenticated;

grant all on public.book_reviews to service_role;

-- ---------------------------------------------------------------------------
-- 6. L'EFFACEMENT D'UN COMPTE
--
-- `anonymize_user` efface les données personnelles et conserve les pièces
-- comptables. Un avis est une donnée personnelle : il porte un texte écrit par
-- la personne et la signature qu'elle a choisie. Il est donc effacé, comme les
-- favoris et la progression de lecture.
--
-- Corps repris VERBATIM de la migration 0014, à une ligne près. Le `delete`
-- est placé AVANT celui de `entitlements` : sans droit, plus rien ne dirait
-- pourquoi cet avis avait pu être écrit.
-- ---------------------------------------------------------------------------

create or replace function public.anonymize_user(p_user_id uuid)
  returns public.users
  language plpgsql
  security definer
  set search_path = public, auth, pg_temp
as $fn$
declare
  v_utilisateur public.users;
  v_jeton text;
begin
  select * into v_utilisateur from public.users where id = p_user_id for update;
  if not found then
    raise exception 'Compte % introuvable.', p_user_id using errcode = 'no_data_found';
  end if;
  if v_utilisateur.statut = 'anonymise' then
    -- Idempotent : réanonymiser ne doit ni échouer ni effacer deux fois.
    return v_utilisateur;
  end if;

  -- Jeton non réversible. `gen_random_uuid()` et non un hachage de l'adresse :
  -- un hachage resterait vulnérable à une attaque par dictionnaire, l'espace
  -- des adresses email étant énumérable.
  v_jeton := 'anonyme-' || replace(gen_random_uuid()::text, '-', '') || '@anonymise.invalid';

  -- 1. Données personnelles supprimées définitivement.
  delete from public.book_reviews    where user_id = p_user_id;
  delete from public.entitlements    where user_id = p_user_id;
  delete from public.reading_progress where user_id = p_user_id;
  delete from public.download_logs   where user_id = p_user_id;
  delete from public.favorites       where user_id = p_user_id;
  delete from public.cart_items
    where cart_id in (select id from public.carts where user_id = p_user_id);
  delete from public.carts           where user_id = p_user_id;

  -- 2. Le compte perd son identité, mais garde sa ligne : les commandes et les
  --    factures y restent rattachées.
  update public.users
  set email = v_jeton,
      nom_complet = null,
      statut = 'anonymise',
      anonymise_le = public.app_now(),
      maj_le = public.app_now()
  where id = p_user_id
  returning * into v_utilisateur;

  -- 3. Suppression de l'identité d'authentification. C'est elle qui libère
  --    l'ancienne adresse email pour une nouvelle inscription.
  delete from auth.users where id = p_user_id;

  -- 4. Conservées en l'état : orders, order_items, subscriptions, invoices,
  --    payment_events, promo_redemptions. Ce sont des pièces comptables ou
  --    leur support direct.

  return v_utilisateur;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. LA REMISE À ZÉRO DE DÉMONSTRATION
--
-- `book_reviews` référence `users` en `on delete restrict`. Sans ce `delete`,
-- la remise à zéro échouerait dès qu'un compte de démonstration aurait laissé
-- un avis — et le message parlerait d'une contrainte, pas d'un avis.
--
-- Corps repris VERBATIM de la migration 0043, à une ligne près.
-- ---------------------------------------------------------------------------

create or replace function public.dev_reset_demo_state()
  returns public.dev_reset_report
  language plpgsql
  security definer
  set search_path = public, auth, pg_temp
as $fn$
declare
  v_rapport public.dev_reset_report := (0, 0, 0, 0, 0);
begin
  if not exists (select 1 from public.dev_clock_activation) then
    raise exception
      'Remise à zéro refusée : l''artefact d''activation de développement est absent. Cette fonction n''a pas sa place sur cette base.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Les `where true` ne sont pas décoratifs : Supabase active `pg_safeupdate`
  -- sur le rôle de l'API, qui refuse tout DELETE ou UPDATE sans clause WHERE.
  -- C'est un garde-fou contre l'effacement accidentel d'une table entière —
  -- exactement ce que cette fonction fait, mais délibérément.
  --
  -- Données transactionnelles, dans l'ordre imposé par les dépendances.
  delete from public.payment_events where true;
  delete from public.promo_redemptions where true;
  delete from public.invoices where true;
  delete from public.entitlements where true;
  delete from public.reading_progress where true;
  delete from public.download_logs where true;
  -- Ajoutée à l'étape 11. Placée AVANT la suppression des comptes, qu'elle
  -- bloquerait autrement : `download_copies` référence `users` en
  -- `on delete restrict` (migration 0012).
  delete from public.download_copies where true;
  -- Ajoutee a l'etape F0. Meme raison que la ligne ci-dessus, a la lettre :
  -- `refresh_token_families` reference `users` en `on delete restrict`, et
  -- bloquerait donc la suppression des comptes de demonstration.
  delete from public.refresh_token_families where true;
  -- Ajoutee le 3 septembre 2026. Meme raison, encore : `book_reviews`
  -- reference `users` en `on delete restrict`.
  delete from public.book_reviews where true;
  delete from public.favorites where true;
  delete from public.cart_items where true;
  delete from public.carts where true;
  delete from public.order_items where true;

  with effacees as (delete from public.orders where true returning 1)
  select count(*)::integer into v_rapport.commandes from effacees;

  with effaces as (delete from public.subscriptions where true returning 1)
  select count(*)::integer into v_rapport.abonnements from effaces;

  with effaces as (delete from public.webhook_events where true returning 1)
  select count(*)::integer into v_rapport.webhooks from effaces;

  delete from public.email_log where true;
  update public.invoice_counters set dernier_numero = 0 where true;

  -- Comptes de démonstration uniquement. Les comptes réels d'un poste de
  -- développement — celui du développeur, notamment — ne sont pas touchés.
  with effaces as (
    delete from public.users
    where email like '%@exemple.test' or email like '%@anonymise.invalid'
    returning id
  ), auth_effaces as (
    delete from auth.users where id in (select id from effaces) returning 1
  )
  select count(*)::integer into v_rapport.comptes from auth_effaces;

  v_rapport.droits := 0;
  return v_rapport;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 8. LA SYNTHÈSE PUBLIQUE — moyenne et effectif
--
-- En LOT, comme les droits et les couvertures : une fiche ou une liste de
-- suggestions ne doit pas produire un aller-retour par titre.
--
-- La moyenne est calculée ICI, sur les seuls avis publiés. Elle n'est pas
-- calculée dans l'interface : le frontend ne recalcule jamais une valeur
-- métier, et « la note d'un titre » en est une — c'est elle qui apparaîtra à
-- côté du prix.
-- ---------------------------------------------------------------------------

create function public.book_review_summary(p_books uuid[])
  returns table (
    book_id uuid,
    moyenne numeric,
    nombre integer
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select
    r.book_id,
    round(avg(r.note)::numeric, 1) as moyenne,
    count(*)::integer as nombre
  from public.book_reviews r
  join public.books b on b.id = r.book_id and b.statut = 'publie'
  where r.statut = 'publie'
    and r.book_id = any(p_books)
  group by r.book_id;
$fn$;

comment on function public.book_review_summary(uuid[]) is
  'Note moyenne et nombre d''avis PUBLIÉS, en lot. Un titre sans avis publié n''a pas de ligne — l''absence de note et la note zéro ne sont pas la même chose.';

grant execute on function public.book_review_summary(uuid[])
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. L'ADMINISTRATION — la file de modération
-- ---------------------------------------------------------------------------

create function public.admin_lister_avis(
  p_statut public.review_status default null,
  p_book uuid default null
)
  returns table (
    id uuid,
    book_id uuid,
    livre_titre text,
    livre_slug text,
    user_id uuid,
    auteur_affiche text,
    auteur_email text,
    note smallint,
    texte text,
    statut public.review_status,
    cree_le timestamptz,
    maj_le timestamptz,
    modere_le timestamptz,
    motif_rejet text
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select
    r.id,
    r.book_id,
    coalesce(t.titre, b.slug) as livre_titre,
    b.slug as livre_slug,
    r.user_id,
    r.auteur_affiche,
    u.email as auteur_email,
    r.note,
    r.texte,
    r.statut,
    r.cree_le,
    r.maj_le,
    r.modere_le,
    r.motif_rejet
  from public.book_reviews r
  join public.books b on b.id = r.book_id
  join public.users u on u.id = r.user_id
  left join public.book_translations t on t.book_id = b.id and t.langue = 'fr'
  where (p_statut is null or r.statut = p_statut)
    and (p_book is null or r.book_id = p_book)
  -- Les avis en attente d'abord, et les plus anciens en tête : une file de
  -- modération se traite dans l'ordre d'arrivée, sans quoi les premiers
  -- arrivés sont les derniers servis.
  order by
    case r.statut when 'en_attente' then 0 when 'rejete' then 1 else 2 end,
    r.cree_le asc;
$fn$;

comment on function public.admin_lister_avis(public.review_status, uuid) is
  'File de modération des avis, les plus anciens en attente en tête. Rend l''adresse email de l''auteur — c''est la seule surface où elle apparaît, et c''est ce qui permet de traiter une contestation.';

revoke all on function public.admin_lister_avis(public.review_status, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_lister_avis(public.review_status, uuid) to service_role;

/**
 * Publier ou refuser un avis.
 *
 * L'acteur est le PREMIER paramètre et vient de la session vérifiée, jamais du
 * corps de la requête (CLAUDE.md). `admin_poser_acteur` revérifie le rôle EN
 * BASE : c'est le troisième des trois contrôles indépendants, et le seul que
 * l'application ne puisse pas oublier.
 */
create function public.admin_moderer_avis(
  p_acteur uuid,
  p_avis uuid,
  p_decision public.review_status,
  p_motif text default null
)
  returns public.book_reviews
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_avis public.book_reviews;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if p_decision = 'en_attente' then
    raise exception 'Moderer un avis, c''est le publier ou le refuser — pas le remettre en attente.'
      using errcode = 'check_violation';
  end if;

  -- Un refus SANS motif est un refus que son auteur ne comprendra pas, et
  -- qu'il renverra tel quel. Le motif est donc exigé ici plutôt que suggéré
  -- par le formulaire.
  if p_decision = 'rejete' and length(btrim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Un refus doit porter son motif.'
      using errcode = 'check_violation';
  end if;

  update public.book_reviews
  set statut = p_decision,
      modere_le = public.app_now(),
      modere_par = p_acteur,
      motif_rejet = case when p_decision = 'rejete' then btrim(p_motif) else null end
  where id = p_avis
  returning * into v_avis;

  if not found then
    raise exception 'Avis % introuvable.', p_avis using errcode = 'no_data_found';
  end if;

  return v_avis;
end;
$fn$;

comment on function public.admin_moderer_avis(uuid, uuid, public.review_status, text) is
  'Publie ou refuse un avis. Un refus doit porter son motif : il est rendu à son auteur, et un refus muet revient toujours.';

revoke all on function public.admin_moderer_avis(uuid, uuid, public.review_status, text)
  from public, anon, authenticated;
grant execute on function public.admin_moderer_avis(uuid, uuid, public.review_status, text) to service_role;

create function public.admin_supprimer_avis(p_acteur uuid, p_avis uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
begin
  perform public.admin_poser_acteur(p_acteur, null);
  delete from public.book_reviews where id = p_avis;
end;
$fn$;

comment on function public.admin_supprimer_avis(uuid, uuid) is
  'Efface un avis. Le refus laisse une trace lisible par son auteur ; la suppression sert aux contenus qui n''ont pas à rester en base du tout.';

revoke all on function public.admin_supprimer_avis(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_supprimer_avis(uuid, uuid) to service_role;
