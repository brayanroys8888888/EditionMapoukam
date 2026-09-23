-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ LES MOTS DE PASSE DES RÔLES DE SERVICE.                                ║
-- ║                                                                        ║
-- ║ Les rôles EXISTENT DÉJÀ : l'image `supabase/postgres` les crée         ║
-- ║ (`anon`, `authenticated`, `service_role`, `authenticator`,             ║
-- ║ `supabase_auth_admin`, `supabase_storage_admin`…). Ce fichier ne fait   ║
-- ║ que leur donner le mot de passe attendu par gotrue, PostgREST et       ║
-- ║ storage-api, qui se connectent chacun sous le sien.                    ║
-- ║                                                                        ║
-- ║ Exécuté UNE SEULE FOIS, à la création du volume. Changer               ║
-- ║ POSTGRES_PASSWORD après coup ne rejoue pas ce fichier : il faut alors   ║
-- ║ passer les `alter user` à la main.                                     ║
-- ╚════════════════════════════════════════════════════════════════════════╝

\set motdepasse `echo "$POSTGRES_PASSWORD"`

-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ CHAQUE RÔLE EST TRAITÉ SÉPARÉMENT, ET SEULEMENT S'IL EXISTE.           │
-- │                                                                        │
-- │ La composition des rôles varie d'une version d'image à l'autre :       │
-- │ `supabase_functions_admin` n'est créé que si le service des fonctions  │
-- │ est présent, et il ne l'est pas dans cette pile.                       │
-- │                                                                        │
-- │ Or ce fichier est joué avec `ON_ERROR_STOP` : un `alter` sur un rôle   │
-- │ absent interrompt TOUT, et les rôles déclarés APRÈS lui n'obtiennent   │
-- │ jamais leur mot de passe. `supabase_storage_admin` venait après —      │
-- │ storage tombait donc en boucle de redémarrage sur un refus            │
-- │ d'authentification, `storage.buckets` n'était jamais créée, et la      │
-- │ migration 0020 du projet échouait. Quatre symptômes, aucun ne parlant  │
-- │ de ce fichier. Mesuré le 23 septembre 2026.                            │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- Le mot de passe passe par un réglage de session : psql n'interpole PAS ses
-- variables à l'intérieur d'un bloc entre dollars.
select set_config('mapoukam.motdepasse', :'motdepasse', false);

do $$
declare
  cible text;
begin
  foreach cible in array array[
    'authenticator',
    'pgbouncer',
    'supabase_auth_admin',
    'supabase_functions_admin',
    'supabase_storage_admin'
  ] loop
    if exists (select 1 from pg_roles where rolname = cible) then
      execute format(
        'alter role %I with password %L',
        cible,
        current_setting('mapoukam.motdepasse')
      );
    else
      raise notice 'role % absent de cette image : ignore', cible;
    end if;
  end loop;
end $$;

-- On ne laisse pas le mot de passe dans un réglage de session.
select set_config('mapoukam.motdepasse', '', false);
