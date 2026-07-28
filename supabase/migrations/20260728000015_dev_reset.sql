-- 0015 — Remise à zéro de l'état de démonstration
--
-- LA SEULE ÉCRITURE EN BASE DE LA CONSOLE DE SIMULATION, ET POURQUOI.
--
-- CLAUDE.md pose que la console ne modifie jamais la base directement : sinon
-- elle ne testerait rien, puisqu'elle court-circuiterait le gestionnaire de
-- webhooks. Cette règle vise les TRANSITIONS MÉTIER — payer, souscrire,
-- annuler — qui doivent toutes passer par un événement signé.
--
-- Remettre le jeu de démonstration à zéro n'est pas une transition métier :
-- c'est l'équivalent de `npm run db:reset`, en plus rapide et sans redémarrer
-- les conteneurs. Une console dotée d'un bouton « réinitialiser » qui ne
-- réinitialise rien ne servirait à personne.
--
-- Deux garde-fous, pour que cette exception reste une exception :
--   * la fonction refuse de s'exécuter si l'artefact `dev_clock_activation`
--     est absent — c'est-à-dire sur toute base où les seeds de développement
--     n'ont pas été joués, donc en production ;
--   * elle n'efface QUE des données transactionnelles, jamais le catalogue.

create type public.dev_reset_report as (
  commandes integer,
  abonnements integer,
  droits integer,
  webhooks integer,
  comptes integer
);

create function public.dev_reset_demo_state()
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

comment on function public.dev_reset_demo_state() is
  'Remet l''état de démonstration à zéro. Refuse de s''exécuter si l''artefact dev_clock_activation est absent. N''efface aucune donnée de catalogue.';

revoke all on function public.dev_reset_demo_state() from public, anon, authenticated;
grant execute on function public.dev_reset_demo_state() to service_role;
