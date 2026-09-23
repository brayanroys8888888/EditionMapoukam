#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║ APPLIQUER LES MIGRATIONS — dans l'ordre, une fois chacune.              ║
# ║                                                                          ║
# ║ Le suivi se fait dans `supabase_migrations.schema_migrations`, LA MÊME   ║
# ║ table que celle du CLI Supabase. C'est délibéré : une base reprise d'un  ║
# ║ projet hébergé arrive avec cette table déjà remplie, et ce script doit   ║
# ║ alors ne rejouer QUE les migrations qui manquent. Une table à lui seul   ║
# ║ rejouerait les 87, et la première échouerait sur un type déjà créé.      ║
# ║                                                                          ║
# ║ Ce qu'il ne fait PAS : `seed.sql`. Le jeu de démonstration écrit dix     ║
# ║ contes fictifs et des comptes d'essai — et `access.test.ts` attend       ║
# ║ exactement dix livres, ce qui rend l'erreur silencieuse longtemps.       ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

psql --variable ON_ERROR_STOP=1 --quiet <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text primary key,
  statements text[],
  name       text
);
SQL

applique=0
ignorees=0

for fichier in /migrations/*.sql; do
  nom=$(basename "$fichier")
  version=${nom%%_*}

  deja=$(psql --tuples-only --no-align \
    --command "select 1 from supabase_migrations.schema_migrations where version = '${version}'")

  if [ -n "$deja" ]; then
    ignorees=$((ignorees + 1))
    continue
  fi

  echo "→ ${nom}"

  # `--single-transaction` couvre le `-f` ET le `-c` : la migration et son
  # enregistrement passent ensemble, ou aucun des deux. Une migration appliquée
  # mais non enregistrée serait rejouée au prochain lancement, et échouerait
  # sur un objet déjà créé.
  psql --single-transaction --variable ON_ERROR_STOP=1 --quiet \
    --file "$fichier" \
    --command "insert into supabase_migrations.schema_migrations (version, name)
               values ('${version}', '${nom}')"

  applique=$((applique + 1))
done

echo
echo "Migrations appliquées : ${applique} — déjà en place : ${ignorees}"
psql --tuples-only --no-align --command \
  "select 'dernière version en base : ' || max(version) from supabase_migrations.schema_migrations"
