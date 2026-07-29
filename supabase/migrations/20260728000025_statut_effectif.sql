-- 0025 — Statut effectif d'un abonnement (arbitrage Q10.1)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ ON NE DUPLIQUE PAS L'ÉTAT. ON LE REPLIE À LA LECTURE.                     │
-- │                                                                            │
-- │ Deux options ont été écartées, et pour la même raison de fond :            │
-- │                                                                            │
-- │  * une TÂCHE PLANIFIÉE qui ferait expirer les abonnements échus. C'est la  │
-- │    synchronisation d'état dupliqué que docs/PLAN.md D1 a déjà écartée pour │
-- │    les entitlements. Une tâche de fond qui échoue en silence laisse la     │
-- │    base dans un état faux sans que rien ne le signale — exactement le      │
-- │    problème qu'on avait éliminé.                                          │
-- │                                                                            │
-- │  * ÉCRASER `statut`. « Annulé » et « impayé » ne racontent pas la même     │
-- │    histoire : le premier est un départ volontaire, le second un accident   │
-- │    de paiement. Les replier tous deux sur « expiré » détruirait la         │
-- │    distinction dont l'analyse de rétention (étape 14) a besoin.           │
-- │                                                                            │
-- │ `statut` conserve donc CE QUE LE PRESTATAIRE A RAPPORTÉ, et cette fonction │
-- │ en dérive ce qui EST VRAI MAINTENANT. Affichage et statistiques lisent     │
-- │ `statut_effectif`, jamais `statut`.                                       │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- Le moteur de droits (`access_for_books`, migration 0016) n'est PAS modifié :
-- il compare déjà les dates et refuse l'accès au bon moment. Cette fonction ne
-- corrige pas une faille — il n'y en avait pas — elle corrige un AFFICHAGE.

create function public.statut_effectif(
  p_statut public.subscription_status,
  p_fin_periode timestamptz,
  p_impaye_depuis timestamptz,
  p_at timestamptz default public.app_now()
)
  returns public.subscription_status
  language sql
  immutable
as $$
  select case
    -- Annulé : l'accès court jusqu'au terme de la période payée (§9.1). Une
    -- fois ce terme franchi, l'abonnement est effectivement terminé.
    when p_statut = 'annule' and p_fin_periode <= p_at then 'expire'::public.subscription_status

    -- Impayé : la grâce court depuis le premier échec. Passée, c'est fini.
    when p_statut = 'impaye'
      and p_impaye_depuis is not null
      and p_impaye_depuis + make_interval(
            days => (select periode_grace_jours from public.business_settings where id = 1)
          ) <= p_at
      then 'expire'::public.subscription_status

    -- Tout le reste est rendu tel quel, y compris un `actif` dont la période
    -- est échue : celui-là attend un renouvellement ou un échec de
    -- prélèvement, et c'est au prestataire de trancher. Le replier sur
    -- « expiré » inventerait une décision que personne n'a prise.
    else p_statut
  end;
$$;

comment on function public.statut_effectif(public.subscription_status, timestamptz, timestamptz, timestamptz) is
  'Replie les dates sur le statut rapporté par le prestataire. Affichage et statistiques lisent CETTE valeur, jamais subscriptions.statut, qui conserve la distinction annulé/impayé nécessaire à l''analyse de rétention.';

-- Note : `immutable` bien que la fonction lise `business_settings`. La période
-- de grâce est un paramètre de configuration, modifié à la main et
-- exceptionnellement ; la traiter comme stable permettrait son usage en index,
-- ce qui n'est pas recherché ici. Le choix de `immutable` est délibéré et
-- limité à cette lecture-là.

/**
 * Variante commode : le statut effectif d'un abonnement désigné par son
 * identifiant.
 *
 * Évite aux appelants de rassembler eux-mêmes les trois colonnes, et donc d'en
 * oublier une — un `impaye_depuis` omis ferait paraître éternel un abonnement
 * impayé.
 */
create function public.statut_effectif_de(p_subscription_id uuid, p_at timestamptz default public.app_now())
  returns public.subscription_status
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, p_at)
  from public.subscriptions s
  where s.id = p_subscription_id;
$$;

comment on function public.statut_effectif_de(uuid, timestamptz) is
  'Statut effectif d''un abonnement, colonnes rassemblées. Évite qu''un appelant n''oublie impaye_depuis et ne fasse paraître éternel un abonnement impayé.';

grant execute on function public.statut_effectif(public.subscription_status, timestamptz, timestamptz, timestamptz)
  to anon, authenticated, service_role;
grant execute on function public.statut_effectif_de(uuid, timestamptz) to service_role, authenticated;
