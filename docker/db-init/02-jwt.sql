-- Le secret de signature, posé sur la BASE.
--
-- Certaines fonctions SQL de Supabase (et les utilitaires du tableau de bord)
-- le relisent depuis les réglages de la base plutôt que depuis leur
-- environnement. Le même secret que celui de gotrue, PostgREST et storage :
-- trois services qui n'en partagent que la valeur, jamais la source.

\set secret `echo "$JWT_SECRET"`
\set expiration `echo "$JWT_EXP"`

alter database postgres set "app.settings.jwt_secret" to :'secret';
alter database postgres set "app.settings.jwt_exp"    to :'expiration';
