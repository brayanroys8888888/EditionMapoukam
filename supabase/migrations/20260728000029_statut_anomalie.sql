-- 0029 — L'état dérivé `anomalie` (arbitrage N2)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ RENDRE VISIBLE, CE N'EST PAS S'ABSTENIR DE TRANSITION : C'EST NOMMER      │
-- │ L'ANOMALIE.                                                                │
-- │                                                                            │
-- │ La migration 0025 laissait un abonnement `actif` à période échue tel quel, │
-- │ au motif qu'aucune décision n'avait été prise à son sujet. C'était une     │
-- │ erreur de raisonnement : un tel abonnement RESSEMBLE EXACTEMENT à un       │
-- │ abonnement sain. Dans la liste des abonnés, dans le tableau de bord, dans  │
-- │ les comptages, rien ne le distingue. Il ne se voit pas — il se fond dans   │
-- │ la masse — et il fausse les statistiques en comptant un abonné actif qui   │
-- │ ne paie plus. C'est la corruption même que `statut_effectif` supprimait    │
-- │ pour les annulés et les impayés.                                          │
-- │                                                                            │
-- │ L'état `anomalie` le rend DÉTECTABLE au lieu de le laisser se confondre    │
-- │ avec un abonnement sain. Il signale presque toujours la même chose : un    │
-- │ webhook perdu, ou un défaut d'intégration du prestataire.                 │
-- └────────────────────────────────────────────────────────────────────────────┘

-- ---------------------------------------------------------------------------
-- Un type DISTINCT, et non une valeur ajoutée à `subscription_status`.
--
-- `anomalie` n'est jamais rapportée par un prestataire et ne doit jamais être
-- écrite dans `subscriptions.statut` : c'est un CONSTAT, pas un état du
-- contrat. L'ajouter à l'énumération stockée aurait rendu possible de l'y
-- écrire, et il aurait fallu une contrainte pour l'interdire — autant que le
-- type lui-même rende la chose impossible.
-- ---------------------------------------------------------------------------

create type public.subscription_status_effectif as enum (
  'essai',
  'actif',
  'annule',
  'impaye',
  'expire',
  -- Période payée échue sans qu'aucun événement ne soit arrivé. Ni actif, ni
  -- expiré : quelque chose ne s'est pas produit qui aurait dû.
  'anomalie'
);

comment on type public.subscription_status_effectif is
  'Statut observé d''un abonnement. Reprend les statuts rapportés par le prestataire, plus `anomalie` — qui n''est jamais stockée, seulement dérivée.';

-- ---------------------------------------------------------------------------
-- Délai de tolérance.
--
-- Un renouvellement peut être « en vol » : le prestataire prélève, son
-- événement met quelques minutes à arriver. Sans tolérance, chaque abonnement
-- clignoterait en anomalie à chaque échéance, et le signal deviendrait du
-- bruit — donc inutile.
-- ---------------------------------------------------------------------------

alter table public.business_settings
  add column tolerance_renouvellement_heures integer not null default 48
    check (tolerance_renouvellement_heures between 0 and 720);

comment on column public.business_settings.tolerance_renouvellement_heures is
  'Délai accordé après la fin de période avant qu''un abonnement `actif` ne soit signalé en anomalie. 48 h par défaut : un renouvellement peut être en vol, et un signal qui se déclenche à chaque échéance ne serait plus lu.';

-- ---------------------------------------------------------------------------
-- Le calcul.
-- ---------------------------------------------------------------------------

drop function if exists public.statut_effectif_de(uuid, timestamptz);
drop function if exists public.statut_effectif(public.subscription_status, timestamptz, timestamptz, timestamptz);

/**
 * Statut observé, colonnes explicites.
 *
 * Forme de référence : c'est ici que la règle est écrite, une seule fois. Les
 * autres variantes s'y ramènent.
 */
create function public.statut_effectif(
  p_statut public.subscription_status,
  p_fin_periode timestamptz,
  p_impaye_depuis timestamptz,
  p_at timestamptz default public.app_now()
)
  returns public.subscription_status_effectif
  language sql
  stable
as $$
  select case
    -- Annulé : l'accès court jusqu'au terme de la période payée (§9.1). Passé
    -- ce terme, l'abonnement est effectivement terminé.
    when p_statut = 'annule' and p_fin_periode <= p_at
      then 'expire'::public.subscription_status_effectif

    -- Impayé : la grâce court depuis le premier échec. Passée, c'est fini.
    when p_statut = 'impaye'
      and p_impaye_depuis is not null
      and p_impaye_depuis + make_interval(
            days => (select periode_grace_jours from public.business_settings where id = 1)
          ) <= p_at
      then 'expire'::public.subscription_status_effectif

    -- ANOMALIE : la période payée est échue depuis plus que la tolérance, et
    -- ni renouvellement ni échec de prélèvement ne sont arrivés. L'abonnement
    -- n'est pas sain, et il n'est pas non plus expiré de plein droit : c'est
    -- un webhook qui manque.
    --
    -- `essai` est inclus : un essai qui s'achève sans premier prélèvement est
    -- exactement le même signal.
    when p_statut in ('actif', 'essai')
      and p_fin_periode + make_interval(
            hours => (select tolerance_renouvellement_heures from public.business_settings where id = 1)
          ) <= p_at
      then 'anomalie'::public.subscription_status_effectif

    else p_statut::text::public.subscription_status_effectif
  end;
$$;

comment on function public.statut_effectif(public.subscription_status, timestamptz, timestamptz, timestamptz) is
  'Statut observé d''un abonnement. Affichage et statistiques lisent CETTE valeur, jamais subscriptions.statut — qui conserve la distinction annulé/impayé nécessaire à l''analyse de rétention.';

/**
 * Statut observé d'une ligne d'abonnement.
 *
 * Prend la LIGNE entière, ce qui en fait une colonne calculée exploitable
 * directement dans une lecture : `select *, statut_effectif from subscriptions`.
 * Évite surtout qu'un appelant ne rassemble les colonnes lui-même et n'en
 * oublie une — un `impaye_depuis` omis ferait paraître éternel un abonnement
 * impayé.
 */
create function public.statut_effectif(s public.subscriptions)
  returns public.subscription_status_effectif
  language sql
  stable
as $$
  select public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, public.app_now());
$$;

comment on function public.statut_effectif(public.subscriptions) is
  'Colonne calculée : statut observé d''un abonnement à l''instant courant. Se lit comme une colonne ordinaire.';

-- ---------------------------------------------------------------------------
-- Les anomalies, listées.
--
-- Le back-office (étape 13) les affiche en évidence, avec leur nombre et depuis
-- quand. `depuis` est rendu ici plutôt que calculé côté application : c'est la
-- base qui connaît l'instant de référence, l'horloge simulée comprise.
-- ---------------------------------------------------------------------------

create function public.abonnements_en_anomalie(p_at timestamptz default public.app_now())
  returns table (
    subscription_id uuid,
    user_id uuid,
    statut_rapporte public.subscription_status,
    fin_periode timestamptz,
    depuis interval
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select
    s.id,
    s.user_id,
    s.statut,
    s.fin_periode,
    p_at - s.fin_periode as depuis
  from public.subscriptions s
  where public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, p_at) = 'anomalie'
  order by s.fin_periode asc;
$$;

comment on function public.abonnements_en_anomalie(timestamptz) is
  'Abonnements dont la période est échue sans événement de renouvellement. Signale presque toujours un webhook perdu ou un défaut d''intégration.';

-- ---------------------------------------------------------------------------
-- Comptage par statut observé.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UNE ANOMALIE N'EST COMPTÉE NI EN ACTIF NI EN EXPIRÉ.                     │
-- │                                                                          │
-- │ Elle a son propre compteur. La ranger avec les actifs gonflerait le      │
-- │ nombre d'abonnés payants ; la ranger avec les expirés masquerait le      │
-- │ défaut d'intégration. Les deux fausseraient l'analyse de rétention de    │
-- │ l'étape 14, chacune dans un sens différent.                              │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create function public.compter_abonnements(p_at timestamptz default public.app_now())
  returns table (statut public.subscription_status_effectif, nombre bigint)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select
    e.statut,
    count(s.id) as nombre
  from unnest(enum_range(null::public.subscription_status_effectif)) as e(statut)
  left join public.subscriptions s
    on public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, p_at) = e.statut
  group by e.statut
  order by e.statut;
$$;

comment on function public.compter_abonnements(timestamptz) is
  'Comptage par statut OBSERVÉ. Les anomalies ont leur propre ligne : les ranger avec les actifs gonflerait le nombre d''abonnés payants, avec les expirés masquerait le défaut d''intégration.';

grant execute on function public.statut_effectif(public.subscription_status, timestamptz, timestamptz, timestamptz)
  to anon, authenticated, service_role;
grant execute on function public.statut_effectif(public.subscriptions) to anon, authenticated, service_role;
grant execute on function public.abonnements_en_anomalie(timestamptz) to service_role;
grant execute on function public.compter_abonnements(timestamptz) to service_role;
