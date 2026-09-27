-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0092 — L'ÉCRAN DES ABONNEMENTS : LISTE, COMPTEURS, CHIFFRES, DÉTAIL.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Deuxième écran du groupe Ventes, au prototype d'administration du
-- 17 septembre 2026. Même forme que la 0089-0091 pour les commandes : la liste
-- s'étend, les compteurs de segments et la bande de chiffres ont leur
-- fonction, le panneau a son détail.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LA FIN DE GRÂCE D'UN IMPAYÉ EST EXTRAITE, PAS RECOPIÉE.                 │
-- │                                                                          │
-- │ L'écran affiche « Terminé le … » pour un abonnement échu. Pour un        │
-- │ abonnement résilié, c'est la fin de la période payée ; pour un impayé,   │
-- │ c'est la fin de la GRÂCE — premier échec plus `periode_grace_jours`.     │
-- │                                                                          │
-- │ Ce calcul existait déjà, une fois, dans `statut_effectif` : c'est lui    │
-- │ qui décide qu'un impayé est échu. Le recopier ici aurait donné deux      │
-- │ réponses à « quand l'accès s'arrête-t-il ? », et le jour où la grâce     │
-- │ changerait de règle, l'écran annoncerait une date que les droits ne      │
-- │ respecteraient pas.                                                      │
-- │                                                                          │
-- │ Il devient donc `fin_grace_impaye`, et `statut_effectif` l'appelle. Même │
-- │ signature, même sémantique, même borne `<= p_at` : les tests de          │
-- │ `subscriptions.test.ts` et `bornes-temporelles.test.ts` le vérifient.    │
-- └──────────────────────────────────────────────────────────────────────────┘

create function public.fin_grace_impaye(p_impaye_depuis timestamptz)
returns timestamptz
language sql
stable
as $$
  select p_impaye_depuis + make_interval(
    days => (select periode_grace_jours from public.business_settings where id = 1)
  );
$$;

comment on function public.fin_grace_impaye(timestamptz) is
  'Instant où la grâce d''un abonnement impayé prend fin : premier échec de prélèvement plus periode_grace_jours. Unique implémentation, appelée par statut_effectif et par l''écran d''administration.';

-- Les mêmes privilèges que `statut_effectif`, qui l'appelle sans être
-- `security definer` : un appelant qui peut évaluer l'une doit pouvoir
-- évaluer l'autre, ou les politiques qui passent par elle tomberaient.
grant execute on function public.fin_grace_impaye(timestamptz)
  to anon, authenticated, service_role;

create or replace function public.statut_effectif(
  p_statut public.subscription_status,
  p_fin_periode timestamptz,
  p_impaye_depuis timestamptz,
  p_at timestamptz default public.app_now()
) returns public.subscription_status_effectif
language sql
stable
as $$
  select case
    -- Annulé : l'accès court jusqu'au terme de la période payée (§9.1). Passé
    -- ce terme, l'abonnement est effectivement terminé.
    when p_statut = 'annule' and p_fin_periode <= p_at
      then 'expire'::public.subscription_status_effectif

    -- Impayé : la grâce court depuis le premier échec. Passée, c'est fini.
    -- Le calcul de la fin de grâce vit dans `fin_grace_impaye` (0092).
    when p_statut = 'impaye'
      and p_impaye_depuis is not null
      and public.fin_grace_impaye(p_impaye_depuis) <= p_at
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

-- ══════════════════════════════════════════════════════════════════════════
-- La liste.
-- ══════════════════════════════════════════════════════════════════════════
--
-- `drop` puis `create` : le type de retour change. Les nouveaux paramètres
-- sont AJOUTÉS EN FIN, avec un défaut : un appel positionnel existant à trois
-- arguments reste valable.

drop function public.admin_lister_abonnements(text, integer, integer);

create function public.admin_lister_abonnements(
  p_statut text default null,
  p_page integer default 1,
  p_taille integer default 25,
  p_domaine text default null,
  p_recherche text default null
) returns table (
  id uuid,
  user_id uuid,
  nom text,
  email text,
  domaine public.subscription_domain,
  offre text,
  statut public.subscription_status,
  statut_observe public.subscription_status_effectif,
  debut_periode timestamptz,
  fin_periode timestamptz,
  fin_acces timestamptz,
  cree_le timestamptz,
  zone public.price_zone,
  devise text,
  montant bigint,
  total_lignes bigint
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with base as (
    select s.*, u.email as email_compte, u.nom_complet, u.statut as statut_compte,
           public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, public.app_now())
             as observe
    from public.subscriptions s
    join public.users u on u.id = s.user_id
    where (p_domaine is null or s.domaine::text = p_domaine)
      /*
       * La recherche porte sur le NOM et le COURRIEL — ce que l'écran montre.
       * Un compte anonymisé n'est retrouvable ni par l'un ni par l'autre :
       * même règle que la liste des commandes (0089), pour la même raison.
       */
      and (
        p_recherche is null
        or length(btrim(p_recherche)) = 0
        or (
          u.statut <> 'anonymise'
          and (
            u.nom_complet ilike '%' || btrim(p_recherche) || '%'
            or u.email ilike '%' || btrim(p_recherche) || '%'
          )
        )
      )
  ),
  filtre as (
    select * from base where p_statut is null or base.observe::text = p_statut
  ),
  compte as (select count(*) as total from filtre)
  select
    filtre.id,
    filtre.user_id,
    -- Masqués pour un compte anonymisé, comme partout ailleurs.
    case when filtre.statut_compte = 'anonymise' then null else filtre.nom_complet end,
    case when filtre.statut_compte = 'anonymise' then null else filtre.email_compte end,
    filtre.domaine,
    filtre.offre,
    filtre.statut,
    filtre.observe,
    filtre.debut_periode,
    filtre.fin_periode,
    /*
     * L'instant où l'accès s'arrête — ou s'est arrêté.
     *
     * Pour un impayé, la fin de GRÂCE ; pour tout le reste, la fin de la
     * période payée. C'est la même borne que celle qui fait basculer
     * `statut_effectif`, calculée par la même fonction.
     */
    case
      when filtre.statut = 'impaye' and filtre.impaye_depuis is not null
        then public.fin_grace_impaye(filtre.impaye_depuis)
      else filtre.fin_periode
    end,
    filtre.cree_le,
    filtre.zone,
    filtre.devise,
    filtre.montant,
    compte.total
  from filtre cross join compte
  -- Les anomalies EN PREMIER : elles ne se distinguent d'un abonnement sain par
  -- aucun autre signe (arbitrage N2).
  order by (filtre.observe = 'anomalie') desc, filtre.fin_periode asc, filtre.id
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

comment on function public.admin_lister_abonnements(text, integer, integer, text, text) is
  'Liste paginée des abonnements pour l''administration, au statut OBSERVÉ, avec le nom, le domaine et l''instant où l''accès s''arrête. Anomalies en tête. Ne rend ni le nom ni le courriel d''un compte anonymisé.';

revoke all on function public.admin_lister_abonnements(text, integer, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_lister_abonnements(text, integer, integer, text, text)
  to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- Les compteurs de segments.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Même contrat que `admin_compter_commandes_par_statut` (0090) : les AUTRES
-- filtres s'appliquent, jamais le statut lui-même ; TOUS les statuts sortent,
-- y compris à zéro ; le prédicat de recherche est repris mot pour mot de la
-- liste, et un test exige que les deux disent le même nombre.

create function public.admin_compter_abonnements_par_statut(
  p_domaine text default null,
  p_recherche text default null
) returns table (
  statut public.subscription_status_effectif,
  nb bigint
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with retenus as (
    select public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, public.app_now())
             as observe
    from public.subscriptions s
    join public.users u on u.id = s.user_id
    where (p_domaine is null or s.domaine::text = p_domaine)
      and (
        p_recherche is null
        or length(btrim(p_recherche)) = 0
        or (
          u.statut <> 'anonymise'
          and (
            u.nom_complet ilike '%' || btrim(p_recherche) || '%'
            or u.email ilike '%' || btrim(p_recherche) || '%'
          )
        )
      )
  )
  select valeur.statut, count(retenus.observe)
  from unnest(enum_range(null::public.subscription_status_effectif)) as valeur(statut)
  left join retenus on retenus.observe = valeur.statut
  group by valeur.statut
  order by valeur.statut;
$$;

comment on function public.admin_compter_abonnements_par_statut(text, text) is
  'Nombre d''abonnements par statut OBSERVÉ, pour les compteurs des segments. Suit les filtres de domaine et de recherche, jamais le statut. Rend les six statuts, y compris à zéro.';

revoke all on function public.admin_compter_abonnements_par_statut(text, text)
  from public, anon, authenticated;
grant execute on function public.admin_compter_abonnements_par_statut(text, text)
  to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- La bande de chiffres.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ « RÉCURRENT » NE COMPTE QUE CE QUI SERA PRÉLEVÉ À NOUVEAU.              │
-- │                                                                          │
-- │ Le prototype définit le récurrent mensuel comme la somme des montants    │
-- │ mensuels et des montants annuels ramenés au mois, sans dire sur quels    │
-- │ statuts. La réponse suit le mot : un abonnement en FIN PROGRAMMÉE ne     │
-- │ sera plus prélevé, un ESSAI ne l'a pas encore été, un IMPAYÉ a échoué.   │
-- │ Seul `actif` observé est récurrent — les compter tous annoncerait un     │
-- │ revenu que la boutique ne recevra pas.                                   │
-- │                                                                          │
-- │ Les ABONNÉS, eux, suivent la définition du prototype : actifs ou en fin  │
-- │ programmée. Ce sont des personnes qui lisent aujourd'hui, et la          │
-- │ résiliation demandée ne leur retire rien avant l'échéance.               │
-- │                                                                          │
-- │ Une ligne par devise pour le récurrent — jamais d'addition entre un euro │
-- │ et un franc CFA. Les décomptes sont globaux : une personne reste une     │
-- │ personne quelle que soit sa monnaie.                                     │
-- └──────────────────────────────────────────────────────────────────────────┘

create function public.admin_stats_abonnements(
  p_at timestamptz default public.app_now()
) returns table (
  abonnes_lecture bigint,
  adherents_association bigint,
  nb_impayes bigint,
  nb_anomalies bigint,
  recurrent_par_devise jsonb
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with observes as (
    select s.domaine, s.offre, s.devise, s.montant,
           public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, p_at) as observe
    from public.subscriptions s
  )
  select
    count(*) filter (where domaine = 'lecture' and observe in ('actif', 'annule')),
    count(*) filter (where domaine = 'association' and observe in ('actif', 'annule')),
    count(*) filter (where observe = 'impaye'),
    count(*) filter (where observe = 'anomalie'),
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('devise', r.devise, 'mensuel', r.mensuel) order by r.devise)
        from (
          -- Arrondi à l'unité de compte : le franc CFA n'a pas de sous-unité,
          -- et un douzième de centime d'euro n'existe pas non plus.
          select o.devise,
                 round(sum(case when o.offre = 'annuel' then o.montant / 12.0 else o.montant end))::bigint
                   as mensuel
          from observes o
          where o.observe = 'actif'
          group by o.devise
        ) r
      ),
      '[]'::jsonb
    )
  from observes;
$$;

comment on function public.admin_stats_abonnements(timestamptz) is
  'La bande de chiffres de l''écran Abonnements. Abonnés et adhérents : actifs ou en fin programmée. Récurrent : actifs seulement, par devise, annuels ramenés au mois.';

revoke all on function public.admin_stats_abonnements(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_stats_abonnements(timestamptz) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- Le détail que le panneau latéral affiche.
-- ══════════════════════════════════════════════════════════════════════════
--
-- L'historique vient de `payment_events` — ce que le gestionnaire de webhooks
-- a ENREGISTRÉ, pas ce que l'écran reconstituerait. Un prélèvement qu'aucun
-- événement n'a rapporté n'y figure pas, et c'est voulu : l'historique d'un
-- abonnement est celui que le prestataire a confirmé.

create function public.admin_lire_abonnement(p_subscription_id uuid)
returns table (
  id uuid,
  nom text,
  email text,
  domaine public.subscription_domain,
  offre text,
  statut public.subscription_status,
  statut_observe public.subscription_status_effectif,
  debut_periode timestamptz,
  fin_periode timestamptz,
  fin_acces timestamptz,
  impaye_depuis timestamptz,
  annule_le timestamptz,
  cree_le timestamptz,
  zone public.price_zone,
  devise text,
  montant bigint,
  acheteur_anonymise boolean,
  historique jsonb
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    s.id,
    case when u.statut = 'anonymise' then null else u.nom_complet end,
    case when u.statut = 'anonymise' then null else u.email end,
    s.domaine,
    s.offre,
    s.statut,
    public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, public.app_now()),
    s.debut_periode,
    s.fin_periode,
    case
      when s.statut = 'impaye' and s.impaye_depuis is not null
        then public.fin_grace_impaye(s.impaye_depuis)
      else s.fin_periode
    end,
    s.impaye_depuis,
    s.annule_le,
    s.cree_le,
    s.zone,
    s.devise,
    s.montant,
    (u.statut = 'anonymise'),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'type', e.type,
            'montant', e.montant,
            'devise', e.devise,
            'survenu_le', e.survenu_le
          )
          order by e.survenu_le desc
        )
        from public.payment_events e
        where e.subscription_id = s.id
      ),
      '[]'::jsonb
    )
  from public.subscriptions s
  join public.users u on u.id = s.user_id
  where s.id = p_subscription_id;
$$;

comment on function public.admin_lire_abonnement(uuid) is
  'Détail d''un abonnement pour le panneau latéral d''administration, avec l''historique des événements de paiement enregistrés. Ne rend ni le nom ni le courriel d''un compte anonymisé.';

revoke all on function public.admin_lire_abonnement(uuid) from public, anon, authenticated;
grant execute on function public.admin_lire_abonnement(uuid) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- Les compteurs du segmenté des FORMULES.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Le prototype compte les deux segmentés : « Lecture 6 », « Adhésion 4 ».
-- Même contrat que celui des statuts, à l'axe près : le statut et la
-- recherche s'appliquent, jamais le domaine lui-même — sans quoi cocher
-- « Lecture » mettrait « Adhésion » à zéro. Les deux domaines sortent, y
-- compris à zéro.

create function public.admin_compter_abonnements_par_domaine(
  p_statut text default null,
  p_recherche text default null
) returns table (
  domaine public.subscription_domain,
  nb bigint
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with retenus as (
    select s.domaine
    from public.subscriptions s
    join public.users u on u.id = s.user_id
    where (
        p_statut is null
        or public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, public.app_now())::text
             = p_statut
      )
      and (
        p_recherche is null
        or length(btrim(p_recherche)) = 0
        or (
          u.statut <> 'anonymise'
          and (
            u.nom_complet ilike '%' || btrim(p_recherche) || '%'
            or u.email ilike '%' || btrim(p_recherche) || '%'
          )
        )
      )
  )
  select valeur.domaine, count(retenus.domaine)
  from unnest(enum_range(null::public.subscription_domain)) as valeur(domaine)
  left join retenus on retenus.domaine = valeur.domaine
  group by valeur.domaine
  order by valeur.domaine;
$$;

comment on function public.admin_compter_abonnements_par_domaine(text, text) is
  'Nombre d''abonnements par domaine, pour les compteurs du segmenté des formules. Suit les filtres de statut observé et de recherche, jamais le domaine. Rend les deux domaines, y compris à zéro.';

revoke all on function public.admin_compter_abonnements_par_domaine(text, text)
  from public, anon, authenticated;
grant execute on function public.admin_compter_abonnements_par_domaine(text, text)
  to service_role;
