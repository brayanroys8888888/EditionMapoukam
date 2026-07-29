-- 0031 — La remise à zéro efface aussi les copies filigranées
--
-- Migration corrective. `dev_reset_demo_state` (migration 0015) ne connaît pas
-- `download_copies`, créée à l'étape 11 — et cette table référence `users` en
-- `on delete restrict` (migration 0012 : un compte ne se supprime plus, il
-- s'anonymise, et une suppression accidentelle doit échouer plutôt qu'emporter
-- l'historique).
--
-- Constaté par les tests : la remise à zéro échouait sur une violation de clé
-- étrangère dès qu'un téléchargement avait eu lieu. Le garde-fou a fait son
-- travail — il a signalé une table oubliée.
--
-- La fonction est reprise À L'IDENTIQUE, une seule ligne ajoutée : recopier le
-- reste garantit qu'aucun ordre de suppression n'a dérivé au passage.
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ LES FICHIERS, EUX, RESTENT DANS LE STOCKAGE.                              │
-- │                                                                            │
-- │ Le SQL ne peut pas les atteindre. La console doit purger les copies côté   │
-- │ application, sans quoi la remise à zéro laisserait des objets que plus     │
-- │ aucune ligne ne désigne — et qui porteraient encore l'adresse email de     │
-- │ leur acheteur.                                                            │
-- └────────────────────────────────────────────────────────────────────────────┘

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
