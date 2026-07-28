-- 0005 — Devises (docs/PLAN.md D4 point 3)
--
-- Toutes les devises n'ont pas deux décimales. Le franc CFA (XAF, XOF) n'a pas
-- de sous-unité : 1 500 FCFA se stocke `1500`, alors que 4,99 EUR se stocke
-- `499`. Une division par 100 codée en dur produirait donc « 15,00 FCFA ».
--
-- Cette table est la seule autorité sur le nombre de décimales. Une règle
-- ESLint interdit `/ 100` et `* 100` dans tout le dépôt ; le formatage passe
-- par src/lib/money, qui lit ces valeurs.
--
-- Données de référence, et non jeu de démonstration : elles vivent donc dans
-- une migration, pas dans seed.sql.

create table public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  decimals smallint not null check (decimals between 0 and 4),
  symbole text not null,
  libelle text not null
);

comment on table public.currencies is
  'Devises acceptées et nombre de décimales de leur sous-unité. Autorité unique : aucune conversion ne doit être codée en dur ailleurs.';
comment on column public.currencies.decimals is
  'Nombre de décimales de la sous-unité. EUR = 2 (centimes), XAF et XOF = 0 (pas de sous-unité).';

insert into public.currencies (code, decimals, symbole, libelle) values
  ('EUR', 2, '€',    'Euro'),
  ('XAF', 0, 'FCFA', 'Franc CFA (BEAC)'),
  ('XOF', 0, 'FCFA', 'Franc CFA (BCEAO)');
