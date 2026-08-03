-- ---------------------------------------------------------------------------
-- Corrections apportees par l'etape F0
--
--  1. Politique de REFUS EXPLICITE sur `refresh_token_families`.
--  2. `dev_reset_demo_state` efface les lignees de jetons avant les comptes.
--
-- La fonction ci-dessous est une EXTRACTION VERBATIM de la migration 0031,
-- obtenue par script et non reecrite de memoire (docs/PLAN.md 5 decies).
-- Une seule instruction y est ajoutee ; `npm run diff:sql` le montre.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Le refus doit etre ECRIT, pas seulement obtenu
--
-- +------------------------------------------------------------------------+
-- | RLS ACTIVE SANS POLITIQUE REFUSE DEJA TOUT. CE N'EST PAS SUFFISANT.    |
-- |                                                                        |
-- | CLAUDE.md regle 1 exige une politique EXPLICITE sur chaque table, et    |
-- | tests/integration/schema.test.ts l'enumere. La raison tient en une      |
-- | phrase : un refus obtenu par ABSENCE ne se distingue pas d'un oubli.    |
-- | Relisant la migration dans un an, personne ne saurait dire si la        |
-- | politique manque par intention ou par etourderie.                       |
-- |                                                                        |
-- | Meme parti pris que `promo_codes` (migration 0010) : `using (false)`.   |
-- +------------------------------------------------------------------------+
-- ---------------------------------------------------------------------------

create policy refresh_token_families_aucun_acces_client on public.refresh_token_families
  for all to anon, authenticated
  using (false)
  with check (false);

comment on table public.refresh_token_families is
  'Empreintes des jetons de rafraichissement, par famille. Refus explicite a tout client : lire cette table donnerait de quoi reconnaitre un jeton vole.';

-- ---------------------------------------------------------------------------
-- 2. La remise a zero efface les lignees avant les comptes
-- ---------------------------------------------------------------------------

create or replace function public.dev_reset_demo_state()
  returns public.dev_reset_report
  language plpgsql
  security definer
  set search_path = public, auth, pg_temp
as $$
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
$$;
