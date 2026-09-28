-- ---------------------------------------------------------------------------
-- L'ASSOCIATION DAVE — les échanges entre adhérents.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UN COMMENTAIRE NAÎT « EN ATTENTE », ET SON AUTEUR NE POSE PAS SON ÉTAT. │
-- │                                                                          │
-- │ C'est la règle des avis de lecteurs (migration 0072), et elle vaut ici   │
-- │ pour la même raison : la publication n'est pas à la portée de celui qui  │
-- │ écrit. La maquette affiche le message tout de suite ; le document de     │
-- │ référence dit que c'est une simulation, et qu'en production il part en   │
-- │ modération. Son auteur le voit, avec la mention « en attente ».          │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create type public.statut_commentaire as enum ('en_attente', 'publie', 'masque');

create table public.association_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.association_contents (id) on delete cascade,

  /*
   * `cascade` depuis le compte, là où `book_reviews` est en `restrict`.
   *
   * La différence est voulue. Un avis est public et porte sur un titre du
   * catalogue : il survit à son auteur, et sa disparition changerait la note
   * d'un livre. Un commentaire est un message privé entre adhérents ; quand
   * le compte s'en va, il s'en va. `anonymize_user` l'efface de son côté,
   * plus bas dans ce même fichier.
   */
  user_id uuid not null references public.users (id) on delete cascade,

  texte text not null check (length(btrim(texte)) between 1 and 2000),
  statut public.statut_commentaire not null default 'en_attente',

  cree_le timestamptz not null default public.app_now(),
  modere_par uuid references public.users (id) on delete set null,
  modere_le timestamptz
);

create index association_comments_file_idx
  on public.association_comments (statut, cree_le);
create index association_comments_par_contenu_idx
  on public.association_comments (content_id, statut, cree_le desc);

comment on table public.association_comments is
  'Les échanges entre adhérents, sous un article. Modérés AVANT affichage : un commentaire naît `en_attente` et son auteur ne pose pas son statut.';

-- ---------------------------------------------------------------------------
-- Les cœurs
-- ---------------------------------------------------------------------------

create table public.association_comment_likes (
  comment_id uuid not null references public.association_comments (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  pose_le timestamptz not null default public.app_now(),

  -- « Un seul par adhérent et par message » — la clé primaire le dit, et
  -- aucun écran n'a donc à le vérifier.
  primary key (comment_id, user_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.association_comments enable row level security;
alter table public.association_comment_likes enable row level security;

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QU'UN ADHÉRENT VOIT : LES MESSAGES PUBLIÉS, ET LES SIENS.            │
 * │                                                                          │
 * │ Les siens même en attente — sans quoi il croirait son message perdu et   │
 * │ le réécrirait. Ceux des autres seulement une fois approuvés : c'est tout │
 * │ l'objet de la modération.                                                │
 * │                                                                          │
 * │ Un message MASQUÉ reste visible à son auteur. Le lui cacher ne           │
 * │ l'effacerait pas — il le verrait disparaître sans savoir pourquoi, et    │
 * │ le réécrirait à l'identique.                                             │
 * │                                                                          │
 * │ `anon` n'a aucune politique : les échanges sont réservés, point.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
create policy association_commentaires_lecture on public.association_comments
  for select to authenticated
  using (
    user_id = auth.uid()
    or (statut = 'publie' and public.abonnement_ouvre_droit(auth.uid(), 'association'))
  );

/*
 * Écrire exige TROIS choses, et chacune ferme une porte différente :
 *   · c'est sa propre ligne — on n'écrit pas au nom d'un autre ;
 *   · l'adhésion ouvre le droit — un compte expiré ne commente plus ;
 *   · l'article ACCEPTE les commentaires — l'éditeur peut les fermer.
 *
 * Le `statut` n'est pas dans la condition : la valeur par défaut est
 * `en_attente`, et une politique qui laisserait poser le statut laisserait
 * un auteur publier lui-même.
 */
create policy association_commentaires_ecrire on public.association_comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and statut = 'en_attente'
    and public.abonnement_ouvre_droit(auth.uid(), 'association')
    and exists (
      select 1 from public.association_contents c
      where c.id = content_id
        and c.statut = 'publie'
        and c.commentaires_ouverts
    )
  );

/*
 * Effacer son propre message, oui. Le MODIFIER, non : un message approuvé
 * puis réécrit contournerait la modération, exactement comme un avis modifié
 * repasse en attente (0072). Ici on retire, on ne corrige pas.
 */
create policy association_commentaires_retirer on public.association_comments
  for delete to authenticated
  using (user_id = auth.uid());

create policy association_coeurs_lecture on public.association_comment_likes
  for select to authenticated
  using (public.abonnement_ouvre_droit(auth.uid(), 'association'));

create policy association_coeurs_poser on public.association_comment_likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.abonnement_ouvre_droit(auth.uid(), 'association')
  );

create policy association_coeurs_retirer on public.association_comment_likes
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Les privilèges de colonne
-- ---------------------------------------------------------------------------

/*
 * `modere_par` n'est pas accordé : QUI a modéré regarde l'équipe, pas les
 * adhérents. Le savoir transformerait une décision de l'association en
 * décision d'une personne, et c'est à elle qu'on s'adresserait ensuite.
 */
grant select (id, content_id, user_id, texte, statut, cree_le, modere_le)
  on public.association_comments to authenticated;
grant insert (content_id, user_id, texte) on public.association_comments to authenticated;
grant delete on public.association_comments to authenticated;

grant select, insert, delete on public.association_comment_likes to authenticated;

-- ---------------------------------------------------------------------------
-- L'ANONYMISATION ET LA REMISE À ZÉRO CONNAISSENT LES COMMENTAIRES
-- ---------------------------------------------------------------------------

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE TABLE QUI PORTE DU TEXTE ÉCRIT PAR UNE PERSONNE.                    │
 * │                                                                          │
 * │ Elle doit donc être connue de l'anonymisation le JOUR où elle naît, pas  │
 * │ plus tard : une obligation reportée est une obligation oubliée, et       │
 * │ celle-ci ne se rattrape pas — le texte reste en base jusqu'à ce que      │
 * │ quelqu'un s'en aperçoive.                                                │
 * │                                                                          │
 * │ Les deux fonctions sont reprises de la base VIVANTE, telles quelles, et  │
 * │ patchées d'une seule ligne, à l'endroit exact où `book_reviews` est déjà │
 * │ traité. `npm run diff:sql anonymize_user` montre l'écart : une ligne     │
 * │ ajoutée, aucune retirée.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id uuid)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
  delete from public.association_comments where user_id = p_user_id;
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
$function$;

CREATE OR REPLACE FUNCTION public.dev_reset_demo_state()
 RETURNS dev_reset_report
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
  delete from public.association_comments where true;
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
$function$;
