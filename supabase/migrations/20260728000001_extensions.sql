-- 0001 — Extensions
--
-- Les extensions vivent dans le schéma `extensions`, jamais dans `public`,
-- pour que `public` ne contienne que le modèle métier.

create extension if not exists pgcrypto with schema extensions;

comment on schema public is
  'Modèle métier de la plateforme de contes. Toutes les tables y sont protégées par RLS en refus par défaut.';
