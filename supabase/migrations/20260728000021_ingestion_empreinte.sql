-- 0021 — Idempotence de la chaîne d'ingestion (§7.4.3)
--
-- Migration corrective : `ingestion_jobs` (0009) suit l'avancement d'une
-- ingestion, mais rien n'y permet de reconnaître un fichier DÉJÀ ingéré.
-- Conformément à CLAUDE.md — « les migrations SQL sont numérotées, jamais
-- modifiées après application » — la table n'est pas retouchée en amont : les
-- colonnes manquantes sont ajoutées ici.
--
-- POURQUOI CETTE COLONNE EXISTE
--
-- Le dépôt d'un PDF est une action manuelle, faite depuis le back-office. Un
-- double clic, un envoi relancé après une coupure réseau, un fichier redéposé
-- parce que l'éditeur n'est pas sûr que le premier soit passé : chacun de ces
-- gestes créerait un second livre en brouillon, avec ses pages et ses images en
-- double dans le stockage. L'empreinte du CONTENU — et non le nom du fichier,
-- qui change à chaque enregistrement — permet de reconnaître le cas et de
-- rendre l'ingestion déjà faite au lieu de la refaire.

alter table public.ingestion_jobs
  add column empreinte text,
  -- Jeton de stockage du titre : préfixe commun aux pages, à la source et aux
  -- fichiers téléchargeables. Conservé pour qu'une ingestion interrompue puisse
  -- être nettoyée sans avoir à deviner où ses fichiers ont atterri.
  add column jeton text;

comment on column public.ingestion_jobs.empreinte is
  'SHA-256 du PDF source. Rend l''ingestion idempotente : redéposer le même fichier rend le résultat existant au lieu de créer un doublon (§7.4.3).';
comment on column public.ingestion_jobs.jeton is
  'Préfixe de stockage du titre, commun aux trois bucket. Permet le nettoyage d''une ingestion interrompue.';

-- ---------------------------------------------------------------------------
-- Unicité PARTIELLE, et c'est le point important.
--
-- La contrainte ne porte que sur les ingestions TERMINÉES. Un échec — PDF
-- corrompu, poppler absent, coupure du stockage — ne doit pas interdire de
-- redéposer le même fichier une fois le problème corrigé. Une contrainte
-- d'unicité simple aurait transformé chaque échec en impasse définitive, et la
-- seule issue aurait été une suppression manuelle en base.
-- ---------------------------------------------------------------------------

create unique index ingestion_jobs_empreinte_terminee_idx
  on public.ingestion_jobs (empreinte)
  where statut = 'termine' and empreinte is not null;

create index ingestion_jobs_empreinte_idx on public.ingestion_jobs (empreinte)
  where empreinte is not null;
