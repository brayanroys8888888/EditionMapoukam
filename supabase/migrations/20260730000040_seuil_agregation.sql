-- 0040 — Seuil d'agrégation sur les ventilations comportementales (étape 14, c)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ « UN SEGMENT À UN SEUL UTILISATEUR N'EST PAS UN AGRÉGAT. »                │
-- │                                                                            │
-- │ La consigne vise toute ventilation géographique ou linguistique. Elle se   │
-- │ heurte à une autre exigence de la même étape : les chiffres comptables     │
-- │ doivent rester EXACTS, y compris après anonymisation. Supprimer les lignes │
-- │ d'un segment peu peuplé rendrait la somme des zones inférieure au chiffre  │
-- │ d'affaires réel — un faux comptable.                                       │
-- │                                                                            │
-- │ LA DISTINCTION QUI RÉSOUT LES DEUX : ce n'est pas la ventilation qui       │
-- │ identifie, c'est la NATURE de ce qu'elle révèle.                           │
-- │                                                                            │
-- │   * DONNÉE COMPORTEMENTALE — ce qu'une personne a lu ou téléchargé. Un     │
-- │     segment à un membre révèle une habitude de lecture, et §7.7 protège    │
-- │     la lecture d'un enfant. SEUIL APPLIQUÉ.                                │
-- │                                                                            │
-- │   * DONNÉE COMPTABLE — ce qui a été encaissé. Un segment à un membre       │
-- │     révèle un montant que l'administration voit DÉJÀ, ligne par ligne,     │
-- │     dans `admin_lister_commandes` : elle a une raison légitime d'y         │
-- │     accéder. Le seuil n'y ajouterait aucune protection et coûterait        │
-- │     l'exactitude. PAS DE SEUIL, exactitude préservée.                      │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- Le seuil ne SUPPRIME pas la ligne : il masque le compte et lève un drapeau.
-- Une ligne absente serait indiscernable d'un segment à zéro, et l'écart entre
-- deux relevés dirait précisément ce qu'on cherche à taire.

-- Le seuil vaut cinq, comme pour les titres les plus lus (migration 0039).
-- Nommé une seule fois : deux seuils différents finiraient par diverger.
create function public.seuil_agregation()
  returns integer
  language sql
  immutable
  parallel safe
as $$
  select 5;
$$;

comment on function public.seuil_agregation() is
  'Effectif minimal d''un segment comportemental. Sous ce seuil, le compte est MASQUE et non supprime : une ligne absente serait indiscernable d''un segment a zero, et l''ecart entre deux releves dirait ce qu''on cherche a taire.';

grant execute on function public.seuil_agregation() to service_role;

-- ---------------------------------------------------------------------------
-- Répartition linguistique — la part comportementale est protégée
--
-- `achats` est comptable : exact, jamais masqué.
-- `telechargements` est comportemental : il décrit ce que des personnes ont
-- réellement emporté, et un « 1 » dans une langue peu servie désigne quelqu'un.
-- ---------------------------------------------------------------------------

-- Le type de retour change : PostgreSQL exige un `drop` explicite. La fonction
-- n'est referencee par aucune vue ni contrainte, seulement par le service.
drop function if exists public.stats_langues(timestamptz, timestamptz, timestamptz);

create function public.stats_langues(
  p_debut timestamptz default null,
  p_fin timestamptz default null,
  p_at timestamptz default public.app_now()
)
  returns table (
    langue text,
    achats bigint,
    telechargements bigint,
    lecteurs bigint,
    sous_le_seuil boolean
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with bornes as (select * from public.periode_stats(p_debut, p_fin, p_at)),
  langues as (select unnest(array['fr', 'en']) as langue),
  brut as (
    select
      l.langue,
      -- COMPTABLE : nombre de lignes de commande payées. Exact.
      (select count(*)::bigint
         from public.order_items oi
         join public.orders o on o.id = oi.order_id
         cross join bornes b
        where oi.langue = l.langue and o.statut = 'paye'
          and o.paye_le >= b.debut and o.paye_le < b.fin) as achats,
      -- COMPORTEMENTAL : ce que des personnes ont emporté.
      (select count(*)::bigint
         from public.download_logs d cross join bornes b
        where d.langue = l.langue
          and d.telecharge_le >= b.debut and d.telecharge_le < b.fin) as telechargements,
      -- COMPORTEMENTAL : combien de personnes distinctes ont lu dans cette
      -- langue. C'est le compte qui identifie le plus vite.
      (select count(distinct d.user_id)::bigint
         from public.download_logs d cross join bornes b
        where d.langue = l.langue
          and d.telecharge_le >= b.debut and d.telecharge_le < b.fin) as lecteurs
    from langues l
  )
  select
    brut.langue,
    brut.achats,
    -- Masqué, pas supprimé : la ligne reste, le compte devient nul.
    case when brut.lecteurs > 0 and brut.lecteurs < public.seuil_agregation()
         then null else brut.telechargements end,
    case when brut.lecteurs > 0 and brut.lecteurs < public.seuil_agregation()
         then null else brut.lecteurs end,
    (brut.lecteurs > 0 and brut.lecteurs < public.seuil_agregation()) as sous_le_seuil
  from brut
  order by brut.langue;
$$;

comment on function public.stats_langues(timestamptz, timestamptz, timestamptz) is
  'Repartition linguistique. `achats` est COMPTABLE et reste exact ; `telechargements` et `lecteurs` sont COMPORTEMENTAUX et sont masques sous le seuil d''agregation. Un segment a un membre n''est pas un agregat.';

revoke all on function public.stats_langues(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.stats_langues(timestamptz, timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Ventilation géographique du COMPORTEMENT de téléchargement
--
-- Le pendant géographique de la fonction ci-dessus. La zone vient de la
-- COMMANDE — un fait commercial — et non d'une géolocalisation d'adresse IP :
-- `download_logs.adresse_ip` existe pour la détection d'abus (§10.2), pas pour
-- profiler une audience.
-- ---------------------------------------------------------------------------

create function public.stats_telechargements_par_zone(
  p_debut timestamptz default null,
  p_fin timestamptz default null,
  p_at timestamptz default public.app_now()
)
  returns table (
    zone public.price_zone,
    telechargements bigint,
    lecteurs bigint,
    sous_le_seuil boolean
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with bornes as (select * from public.periode_stats(p_debut, p_fin, p_at)),
  brut as (
    select
      o.zone,
      count(*)::bigint as telechargements,
      count(distinct d.user_id)::bigint as lecteurs
    from public.download_logs d
    join public.entitlements e
      on e.user_id = d.user_id and e.book_id = d.book_id and e.type = 'achat'
    join public.orders o on o.id = e.source_id
    cross join bornes b
    where d.telecharge_le >= b.debut and d.telecharge_le < b.fin
    group by o.zone
  )
  select
    brut.zone,
    case when brut.lecteurs < public.seuil_agregation() then null
         else brut.telechargements end,
    case when brut.lecteurs < public.seuil_agregation() then null
         else brut.lecteurs end,
    (brut.lecteurs < public.seuil_agregation()) as sous_le_seuil
  from brut
  order by brut.zone;
$$;

comment on function public.stats_telechargements_par_zone(timestamptz, timestamptz, timestamptz) is
  'Ventilation GEOGRAPHIQUE du comportement de telechargement, soumise au seuil d''agregation. La zone vient de la COMMANDE, jamais d''une geolocalisation : `download_logs.adresse_ip` sert a detecter les abus, pas a profiler une audience.';

revoke all on function public.stats_telechargements_par_zone(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.stats_telechargements_par_zone(timestamptz, timestamptz, timestamptz)
  to service_role;
