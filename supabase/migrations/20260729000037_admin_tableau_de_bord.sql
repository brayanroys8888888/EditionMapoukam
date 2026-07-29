-- 0037 — Journal d'audit consultable et tableau de bord (étape 13)

-- ---------------------------------------------------------------------------
-- Journal d'audit — lecture paginée
--
-- Lecture SEULEMENT. La table refuse `update`, `delete` et `truncate` à tout le
-- monde, y compris à `service_role` (migration 0034) : un journal dont on peut
-- retirer une ligne ne prouve rien.
-- ---------------------------------------------------------------------------

create function public.admin_lister_audit(
  p_action text default null,
  p_cible_id uuid default null,
  p_page integer default 1,
  p_taille integer default 25
)
  returns table (
    id uuid,
    acteur_id uuid,
    acteur_email text,
    action text,
    cible_type text,
    cible_id uuid,
    ancienne_valeur jsonb,
    nouvelle_valeur jsonb,
    motif text,
    cree_le timestamptz,
    total_lignes bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with base as (
    select l.* from public.admin_audit_log l
    where (p_action is null or l.action = p_action)
      and (p_cible_id is null or l.cible_id = p_cible_id)
  ),
  compte as (select count(*) as total from base)
  select
    base.id,
    base.acteur_id,
    -- L'adresse de l'ACTEUR — un administrateur en exercice — et non celle d'un
    -- client. Masquée elle aussi si ce compte a été anonymisé entre-temps.
    (select case when u.statut = 'anonymise' then null else u.email end
       from public.users u where u.id = base.acteur_id),
    base.action,
    base.cible_type,
    base.cible_id,
    base.ancienne_valeur,
    base.nouvelle_valeur,
    base.motif,
    base.cree_le,
    compte.total
  from base cross join compte
  order by base.cree_le desc, base.id
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

comment on function public.admin_lister_audit(text, uuid, integer, integer) is
  'Journal d''audit, pagine et plafonne. Lecture seule : aucune fonction n''en modifie ni n''en efface une entree.';

revoke all on function public.admin_lister_audit(text, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_lister_audit(text, uuid, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Tableau de bord — ce qui doit sauter aux yeux
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ LES ANOMALIES ET LES MANQUES DE PUBLICATION NE SERVENT À RIEN S'IL FAUT    │
-- │ LES CHERCHER.                                                              │
-- │                                                                            │
-- │ Arbitrage N2 : un abonnement `actif` à période échue « ressemble exactement │
-- │ à un abonnement sain — rien ne le distingue, il se fond dans la masse ».    │
-- │ L'état dérivé `anomalie` existe pour le nommer. Le reléguer derrière un      │
-- │ filtre reviendrait à le taire une seconde fois.                            │
-- │                                                                            │
-- │ De même, l'éditeur doit voir ce qui manque à un brouillon AVANT de tenter   │
-- │ la publication, et non découvrir le refus au moment de publier.            │
-- └────────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create function public.admin_tableau_de_bord()
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    -- Une anomalie n'est comptée ni en actif ni en expiré : elle a sa propre
    -- ligne (migration 0029).
    'abonnements', coalesce((
      select jsonb_object_agg(c.statut, c.nombre) from public.compter_abonnements() c
    ), '{}'::jsonb),

    'anomalies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subscription_id', a.subscription_id,
        'statut_rapporte', a.statut_rapporte,
        'fin_periode', a.fin_periode,
        -- « Depuis quand », exigé par l'arbitrage N2 : une anomalie de deux
        -- heures est un webhook en retard, une anomalie de trois semaines est un
        -- défaut d'intégration. Les deux n'appellent pas la même réaction.
        'echue_depuis_heures', round(extract(epoch from a.depuis) / 3600)
      ) order by a.depuis desc)
      from public.abonnements_en_anomalie() a
    ), '[]'::jsonb),

    'brouillons_non_publiables', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'slug', b.slug, 'manques', m.manques)
             order by b.slug)
      from public.books b
      cross join lateral (select public.manques_pour_publication(b.id) as manques) m
      where b.statut = 'brouillon' and cardinality(m.manques) > 0
    ), '[]'::jsonb),

    'copies_purgeables', (select count(*) from public.copies_purgeables())
  );
$$;

comment on function public.admin_tableau_de_bord() is
  'Compteurs et alertes du back-office. Les abonnements en anomalie (N2) et les brouillons non publiables y figurent en evidence : ils ne servent a rien s''il faut les chercher.';

revoke all on function public.admin_tableau_de_bord() from public, anon, authenticated;
grant execute on function public.admin_tableau_de_bord() to service_role;
