-- 0011 — Privilèges du rôle de service (migration corrective)
--
-- CONSTAT
--
-- Les tables créées par les migrations 0002 à 0009 n'accordaient à
-- `service_role` que REFERENCES, TRIGGER et TRUNCATE — ni SELECT, ni INSERT,
-- ni UPDATE, ni DELETE. Toute requête du serveur passant par PostgREST
-- échouait donc en « permission denied for table … ».
--
-- ORIGINE
--
-- Ce n'est pas une conséquence des révocations de la migration 0010, qui ne
-- visaient qu'`anon` et `authenticated`. Les privilèges par défaut du rôle
-- `postgres` dans le schéma `public` — celui sous lequel les migrations
-- s'exécutent — n'accordent à `service_role` que `Dxtm`. Les octrois complets
-- dont bénéficient les tables créées depuis la console de Supabase viennent
-- d'un autre chemin, qui ne s'applique pas ici.
--
-- Vérifié empiriquement : une table créée à l'instant dans `public` reçoit
-- exactement les mêmes privilèges partiels.
--
-- POURQUOI LE DÉFAUT N'A PAS ÉTÉ REMARQUÉ PLUS TÔT
--
-- À l'étape 1, `service_role` n'était sollicité que par l'API
-- d'administration de Supabase Auth, qui ne passe pas par PostgREST. La
-- première lecture de `public.users` par le serveur a eu lieu à l'étape 2.
--
-- PARTI PRIS
--
-- On accorde explicitement, plutôt que de compter sur un défaut hérité. C'est
-- la même logique que la migration 0010 : les privilèges du projet se lisent
-- dans le projet, et ne dépendent pas de la façon dont la base a été
-- provisionnée.

-- Tables existantes.
grant select, insert, update, delete on all tables in schema public to service_role;

-- Tables créées par les migrations suivantes.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

-- Les identifiants sont des UUID, mais une séquence pourrait apparaître.
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- Rappel de la frontière : `service_role` contourne RLS, c'est précisément
-- pourquoi il ne quitte jamais le serveur (CLAUDE.md règle 2) et pourquoi le
-- code qui l'emploie vérifie lui-même les droits contre `entitlements`
-- (règle 4). Les rôles `anon` et `authenticated` conservent les privilèges
-- restreints posés par la migration 0010.
