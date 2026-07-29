-- 0032 — Progression de lecture : par livre ET par langue (§4.2 F7)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ RÉVISION DE docs/PLAN.md D2 POINT 6.                                      │
-- │                                                                            │
-- │ La règle disait : « la progression est conservée PAR LIVRE, pas par        │
-- │ langue. Basculer de version linguistique ne perd pas la page atteinte. »   │
-- │                                                                            │
-- │ L'INTENTION était juste, la MISE EN ŒUVRE ne pouvait pas tenir. Les        │
-- │ versions française et anglaise sont deux PDF distincts, produits par deux  │
-- │ passages séparés de la chaîne d'ingestion : rien ne garantit qu'elles      │
-- │ aient le même nombre de pages. Un texte traduit se recompose, et « page    │
-- │ 12 » en français peut simplement NE PAS EXISTER en anglais.                │
-- │                                                                            │
-- │ Conserver une page unique par livre revenait donc à promettre une reprise  │
-- │ qui, un jour, pointerait au-delà de la fin du livre ouvert.                │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- LA RÈGLE RÉVISÉE, qui préserve l'intention d'origine :
--
--   * la progression est stockée par (utilisateur, livre, LANGUE) ;
--   * à l'ouverture d'une langue sans progression propre, on RETOMBE sur la
--     progression la plus récente d'une autre langue du même livre ;
--   * cette reprise est BORNÉE au nombre de pages de la version ouverte.
--
-- Basculer de version linguistique ne perd donc toujours pas la page atteinte —
-- promesse tenue — mais on ne prétend plus qu'une page d'une version existe
-- dans une autre.

-- ---------------------------------------------------------------------------
-- La clé
-- ---------------------------------------------------------------------------

alter table public.reading_progress
  add column langue text not null default 'fr' check (langue in ('fr', 'en'));

-- Le défaut n'a de sens que pour la reprise des lignes existantes : au-delà,
-- la langue est toujours celle de la version réellement ouverte, et la laisser
-- deviner masquerait une erreur d'appel.
alter table public.reading_progress alter column langue drop default;

alter table public.reading_progress drop constraint reading_progress_pkey;
alter table public.reading_progress
  add constraint reading_progress_pkey primary key (user_id, book_id, langue);

comment on table public.reading_progress is
  'Progression de lecture, par livre ET par langue (révision de docs/PLAN.md D2 point 6). Deux versions linguistiques sont deux PDF distincts : leur pagination peut diverger.';
comment on column public.reading_progress.langue is
  'Version linguistique réellement lue. À l''ouverture d''une langue sans progression, la reprise retombe sur une autre langue, bornée au nombre de pages de la version ouverte.';

-- ---------------------------------------------------------------------------
-- L'horodatage
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ HEURE RÉELLE, ET NON L'HORLOGE MÉTIER INJECTABLE.                       │
-- │                                                                          │
-- │ C'est la SEULE colonne du schéma dans ce cas, et l'exception est          │
-- │ délibérée. `maj_le` ne sert pas à dater un fait métier : elle ARBITRE une │
-- │ concurrence — deux appareils qui synchronisent, dernier écrivain gagnant. │
-- │                                                                          │
-- │ Avec `app_now()`, la console de simulation pourrait reculer l'horloge et  │
-- │ faire perdre une écriture postérieure au profit d'une écriture antérieure.│
-- │ Pire : un test qui déplace le temps corromprait un arbitrage qui n'a rien │
-- │ à voir avec le métier.                                                    │
-- │                                                                          │
-- │ L'heure du SERVEUR, jamais celle du client : deux appareils aux horloges  │
-- │ décalées feraient reculer la progression.                                │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

alter table public.reading_progress alter column maj_le set default now();

comment on column public.reading_progress.maj_le is
  'Heure RÉELLE du serveur, non l''horloge métier injectable : cette colonne arbitre une concurrence entre appareils (dernier écrivain gagnant), elle ne date pas un fait métier.';

-- ---------------------------------------------------------------------------
-- Reprise de lecture.
--
-- Écrite en SQL parce qu'elle a besoin du nombre de pages de la version
-- ouverte, qui vit dans `book_pages` — table dont la lecture est réservée au
-- service de pages côté application. La calculer ici évite d'ouvrir un second
-- chemin d'accès à cette table.
-- ---------------------------------------------------------------------------

create function public.reprise_lecture(
  p_user_id uuid,
  p_book_id uuid,
  p_langue text
)
  returns table (page integer, langue_origine text, borne_appliquee boolean)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with version as (
    select t.id
    from public.book_translations t
    where t.book_id = p_book_id and t.langue = p_langue and t.statut = 'publie'
  ),
  pages as (
    select count(*)::integer as nb
    from public.book_pages bp
    join version v on v.id = bp.translation_id
  ),
  -- La progression de la langue demandée, si elle existe.
  propre as (
    select rp.derniere_page, rp.langue
    from public.reading_progress rp
    where rp.user_id = p_user_id and rp.book_id = p_book_id and rp.langue = p_langue
  ),
  -- À défaut, la plus récente d'une AUTRE langue du même livre.
  repli as (
    select rp.derniere_page, rp.langue
    from public.reading_progress rp
    where rp.user_id = p_user_id and rp.book_id = p_book_id and rp.langue <> p_langue
    order by rp.maj_le desc
    limit 1
  ),
  retenue as (
    select * from propre
    union all
    select * from repli where not exists (select 1 from propre)
    limit 1
  )
  select
    -- Bornée au nombre de pages de la version OUVERTE. Sans cette borne, une
    -- reprise pourrait pointer au-delà de la fin du livre.
    least(coalesce(r.derniere_page, 1), greatest((select nb from pages), 1)) as page,
    r.langue as langue_origine,
    coalesce(r.derniere_page, 1) > (select nb from pages) as borne_appliquee
  from retenue r
  union all
  -- Aucune progression : on ouvre à la première page.
  select 1, null::text, false
  where not exists (select 1 from retenue)
  limit 1;
$$;

comment on function public.reprise_lecture(uuid, uuid, text) is
  'Page de reprise pour une version linguistique. Retombe sur la progression d''une autre langue quand celle demandée n''en a pas, en la bornant au nombre de pages de la version ouverte (révision de D2 point 6).';

revoke all on function public.reprise_lecture(uuid, uuid, text) from public, anon;
grant execute on function public.reprise_lecture(uuid, uuid, text) to authenticated, service_role;
