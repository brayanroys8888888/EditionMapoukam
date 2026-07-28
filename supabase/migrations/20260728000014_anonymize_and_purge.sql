-- 0014 — Anonymisation et purge à échéance
--
-- Deux obligations symétriques, souvent traitées comme une seule :
--
--   * effacer les données de compte quand l'utilisateur le demande ;
--   * purger les pièces comptables une fois leur durée de conservation
--     écoulée — conserver indéfiniment est aussi une infraction.

-- ---------------------------------------------------------------------------
-- Anonymisation
--
-- Une seule transaction. Une anonymisation à moitié faite laisserait des
-- données personnelles derrière elle tout en donnant le compte pour effacé.
-- ---------------------------------------------------------------------------

create function public.anonymize_user(p_user_id uuid)
  returns public.users
  language plpgsql
  security definer
  set search_path = public, auth, pg_temp
as $$
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
$$;

comment on function public.anonymize_user(uuid) is
  'Efface les données de compte et conserve les pièces comptables (RGPD art. 17.3.b). Idempotente. L''état `anonymise` est terminal : le compte ne peut pas être réactivé.';

-- Retirer l'exécution à `public` la retire à TOUS les rôles non explicitement
-- nommés, `service_role` compris. L'octroi qui suit n'est donc pas une
-- redondance : sans lui, la route de suppression de compte échouerait.
revoke all on function public.anonymize_user(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_user(uuid) to service_role;

-- Un compte anonymisé est un état terminal : aucun retour en arrière, même par
-- le serveur. Sans ce garde-fou, une simple mise à jour de statut ressusciterait
-- un compte dont l'identité a été détruite.
create function public.refuser_reactivation_compte()
  returns trigger
  language plpgsql
as $$
begin
  if old.statut = 'anonymise' and new.statut <> 'anonymise' then
    raise exception
      'Un compte anonymisé ne peut pas être réactivé : son identité d''authentification a été supprimée (compte %).',
      old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger users_anonymisation_terminale
  before update on public.users
  for each row
  execute function public.refuser_reactivation_compte();

-- ---------------------------------------------------------------------------
-- Purge à échéance de conservation
--
-- Ordre imposé par les clés étrangères, et par le bon sens : la pièce
-- comptable d'abord, son support ensuite, le compte devenu orphelin en dernier.
-- ---------------------------------------------------------------------------

create type public.purge_report as (
  factures_supprimees integer,
  commandes_supprimees integer,
  comptes_supprimes integer
);

create function public.purge_expired_invoices(p_at timestamptz default public.app_now())
  returns public.purge_report
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_rapport public.purge_report := (0, 0, 0);
  v_commandes uuid[];
  v_comptes uuid[];
begin
  -- 1. Factures échues, et les commandes qu'elles couvraient.
  with echues as (
    delete from public.invoices
    where conservation_jusqu_au <= p_at
    returning order_id, user_id
  )
  select
    coalesce(array_agg(distinct order_id) filter (where order_id is not null), '{}'),
    coalesce(array_agg(distinct user_id), '{}'),
    count(*)::integer
  into v_commandes, v_comptes, v_rapport.factures_supprimees
  from echues;

  if v_rapport.factures_supprimees = 0 then
    return v_rapport;
  end if;

  -- 2. Commandes désormais sans facture. Une commande encore couverte par une
  --    autre facture n'est pas touchée.
  with supprimables as (
    select o.id from public.orders o
    where o.id = any (v_commandes)
      and not exists (select 1 from public.invoices f where f.order_id = o.id)
  ), effacees as (
    delete from public.orders where id in (select id from supprimables) returning id
  )
  select count(*)::integer into v_rapport.commandes_supprimees from effacees;

  -- 3. Comptes anonymisés devenus orphelins. Un compte encore vivant, ou
  --    porteur d'une commande ou d'un abonnement, reste en place.
  with orphelins as (
    select u.id from public.users u
    where u.id = any (v_comptes)
      and u.statut = 'anonymise'
      and not exists (select 1 from public.orders o where o.user_id = u.id)
      and not exists (select 1 from public.invoices f where f.user_id = u.id)
      and not exists (select 1 from public.subscriptions s where s.user_id = u.id)
  ), effaces as (
    delete from public.users where id in (select id from orphelins) returning id
  )
  select count(*)::integer into v_rapport.comptes_supprimes from effaces;

  return v_rapport;
end;
$$;

comment on function public.purge_expired_invoices(timestamptz) is
  'Supprime les factures dont la conservation est échue, puis les commandes devenues sans facture, puis les comptes anonymisés devenus orphelins. L''instant est paramétrable pour que les tests avancent l''horloge.';

revoke all on function public.purge_expired_invoices(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_expired_invoices(timestamptz) to service_role;
