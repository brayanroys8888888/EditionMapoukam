-- ---------------------------------------------------------------------------
-- La bande de chiffres de l'écran Association DAVE.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ QUATRE CHIFFRES, ET TOUS LES QUATRE COMPTÉS EN BASE.                     │
-- │                                                                          │
-- │ « À renouveler » demande de savoir quelles adhésions arrivent à leur      │
-- │ terme dans les trente jours. Cette comparaison ne peut pas se faire dans  │
-- │ l'écran : le temps du projet est celui de `app_now()`, que la console de  │
-- │ simulation déplace, et une date comparée en TypeScript répondrait selon   │
-- │ l'horloge du serveur de rendu. C'est la règle de CLAUDE.md — l'état réel  │
-- │ d'un abonnement se lit contre `app_now()`, jamais autrement.              │
-- │                                                                          │
-- │ Les quatre tiennent donc dans UN aller-retour, et l'écran ne fait que     │
-- │ les afficher.                                                            │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ DEUX DES QUATRE NE SONT PAS CEUX DU PROTOTYPE, ET C'EST DÉLIBÉRÉ.        │
-- │                                                                          │
-- │ Le prototype affiche « À MODÉRER » (commentaires en attente) et          │
-- │ « PROCHAINE PUBLICATION » (une date programmée). Ni les commentaires ni   │
-- │ la programmation n'existent : le cahier des charges §F10 bis ne connaît   │
-- │ que `brouillon` et `publie`, sans file de modération ni calendrier.       │
-- │                                                                          │
-- │ Plutôt que deux cases vides, deux chiffres qui répondent à la même        │
-- │ question — « qu'est-ce qui demande mon attention cette semaine ? » :      │
-- │ les BROUILLONS en attente, et la DERNIÈRE publication parue.              │
-- └──────────────────────────────────────────────────────────────────────────┘
create or replace function public.admin_stats_association(
  p_at timestamptz default public.app_now()
)
returns table (
  adherents bigint,
  a_renouveler bigint,
  brouillons bigint,
  derniere_publication timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with observes as (
    select
      s.fin_periode,
      public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, p_at) as observe
    from public.subscriptions s
    where s.domaine = 'association'
  ),
  -- La borne haute de la fenêtre, nommée : elle se lit une fois, et la
  -- comparaison qui suit reste celle d'une échéance.
  fenetre as (select p_at + interval '30 days' as terme)
  select
    -- « Adhérents » compte comme `admin_stats_abonnements` compte les siens :
    -- une adhésion résiliée court jusqu'à son terme, et son adhérent en est
    -- toujours un. Deux définitions du mot donneraient deux totaux sur deux
    -- écrans, et c'est toujours celui qu'on regarde qui aurait l'air juste.
    (select count(*) from observes where observe in ('actif', 'annule')),

    -- « À renouveler » : l'adhésion court encore, et son terme tombe dans les
    -- trente jours. Une adhésion déjà échue n'est plus à renouveler, elle est
    -- perdue — d'où la borne basse.
    (select count(*) from observes, fenetre f
      where observe in ('actif', 'annule')
        and fin_periode > p_at
        and fin_periode <= f.terme),

    (select count(*) from public.association_contents where statut <> 'publie'),

    (select max(publie_le) from public.association_contents where statut = 'publie')
$$;

comment on function public.admin_stats_association(timestamptz) is
  'Les quatre chiffres de l''écran Association DAVE : adhérents, adhésions arrivant à terme sous trente jours, contenus en brouillon, date de la dernière publication. Lus contre app_now(), jamais contre l''horloge du serveur de rendu.';
