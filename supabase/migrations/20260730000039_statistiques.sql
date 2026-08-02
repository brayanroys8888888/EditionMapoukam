-- 0039 — Statistiques agrégées (étape 14, §4.3 F13)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ LES STATISTIQUES NE LISENT JAMAIS `users`. C'EST STRUCTUREL.               │
-- │                                                                            │
-- │ Elles lisent `orders`, `order_items`, `invoices` et `subscriptions` — des  │
-- │ faits comptables, conservés après l'anonymisation d'un compte. Le chiffre  │
-- │ d'affaires d'un mois clos ne doit pas changer parce qu'un client a demandé │
-- │ l'effacement de son compte : ce serait à la fois un faux comptable et un   │
-- │ moyen de déduire qu'un effacement a eu lieu.                              │
-- │                                                                            │
-- │ Une jointure vers `users` créerait exactement ce lien. Elle n'existe nulle │
-- │ part dans ce fichier, et un test le vérifie sur le TEXTE des fonctions —   │
-- │ pas seulement sur leur résultat.                                          │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ AUCUN TOTAL CONSOLIDÉ. LES MONTANTS SONT VENTILÉS PAR DEVISE.             │
-- │                                                                            │
-- │ Additionner des euros et des francs CFA sans taux de change ne produit pas │
-- │ un chiffre approximatif : il ne produit RIEN. 499 centimes d'euro et 3 000 │
-- │ francs CFA ne font pas 3 499 de quoi que ce soit.                         │
-- │                                                                            │
-- │ D4 point 4 a écarté toute conversion à l'exécution. La conséquence est     │
-- │ assumée ici : chaque agrégat porte sa devise, et il n'existe aucune        │
-- │ fonction rendant « le » chiffre d'affaires.                               │
-- │                                                                            │
-- │ Si un total consolidé devient nécessaire, il exigera un taux FIGÉ à la     │
-- │ date de la commande et stocké sur celle-ci — comme les prix sont figés sur │
-- │ `order_items`. Ce n'est pas improvisable ici.                             │
-- └────────────────────────────────────────────────────────────────────────────┘

-- ---------------------------------------------------------------------------
-- Bornes de période
--
-- Plafonnées : une surface de lecture large est aussi une surface
-- d'exfiltration, et une période non bornée invite à tout balayer en une
-- requête. Trois ans couvrent tout usage éditorial réel.
-- ---------------------------------------------------------------------------

-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ L'INTERVALLE EST SEMI-OUVERT : [début, fin[.                              │
-- │                                                                            │
-- │ C'est la seule convention qui permette d'interroger des périodes           │
-- │ SUCCESSIVES sans compter deux fois. Avec des bornes inclusives des deux     │
-- │ côtés, une commande payée le 31 janvier à minuit pile figurerait dans le    │
-- │ relevé de janvier ET dans celui de février — et la somme des mois           │
-- │ dépasserait l'année.                                                       │
-- │                                                                            │
-- │ Contrepartie assumée : une transaction horodatée EXACTEMENT à l'instant de │
-- │ la requête appartient à la période suivante, pas à celle qui s'achève. En  │
-- │ production, l'écart est d'une fraction de seconde et sans conséquence ; en │
-- │ test, il se voit, parce que l'horloge figée rend les deux instants égaux.  │
-- │ Mieux vaut ce cas visible qu'un double comptage invisible.                 │
-- └────────────────────────────────────────────────────────────────────────────┘

create function public.periode_stats(
  p_debut timestamptz,
  p_fin timestamptz,
  p_at timestamptz default public.app_now()
)
  returns table (debut timestamptz, fin timestamptz)
  language plpgsql
  stable
as $$
declare
  v_fin timestamptz;
  v_debut timestamptz;
begin
  -- `p_at` vient de l'horloge MÉTIER injectable : après un déplacement du temps
  -- par la console de simulation, « les trente derniers jours » doivent suivre.
  -- Une borne calculée sur `now()` produirait des séries incohérentes avec les
  -- faits que la simulation vient de créer.
  v_fin := coalesce(p_fin, p_at);
  v_debut := coalesce(p_debut, v_fin - interval '30 days');

  if v_debut > v_fin then
    raise exception 'Période invalide : le début est postérieur à la fin.'
      using errcode = 'check_violation';
  end if;

  if v_fin - v_debut > interval '3 years' then
    raise exception 'Période trop large : trois ans au maximum.'
      using errcode = 'check_violation',
            hint = 'Une periode non bornee est une surface d''exfiltration.';
  end if;

  return query select v_debut, v_fin;
end;
$$;

comment on function public.periode_stats(timestamptz, timestamptz, timestamptz) is
  'Normalise et PLAFONNE une periode interrogeable (3 ans). Les bornes passent par l''horloge metier injectable, pour que la console de simulation produise des series coherentes apres un deplacement du temps.';

grant execute on function public.periode_stats(timestamptz, timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Chiffre d'affaires — PAR DEVISE et PAR FLUX
--
-- Les deux modèles économiques sont strictement séparés (§3.1) : mélanger le
-- revenu d'abonnement et le revenu unitaire empêcherait de voir lequel porte
-- l'activité, ce qui est la première question qu'on pose à ces chiffres.
-- ---------------------------------------------------------------------------

create function public.stats_chiffre_affaires(
  p_debut timestamptz default null,
  p_fin timestamptz default null,
  p_at timestamptz default public.app_now()
)
  returns table (
    flux text,
    devise text,
    zone public.price_zone,
    montant bigint,
    nb_transactions bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with bornes as (select * from public.periode_stats(p_debut, p_fin, p_at)),

  -- ACHAT À L'UNITÉ. Lu sur `orders`, jamais sur `users` : une commande reste
  -- un fait comptable après l'anonymisation de son auteur.
  unitaire as (
    select
      'achat_unitaire' as flux,
      o.devise,
      o.zone,
      sum(o.montant_total)::bigint as montant,
      count(*)::bigint as nb
    from public.orders o, bornes b
    where o.statut = 'paye'
      and o.paye_le is not null
      and o.paye_le >= b.debut and o.paye_le < b.fin
    group by o.devise, o.zone
  ),

  -- REMBOURSEMENTS, comptés à part et en NÉGATIF. Les noyer dans le chiffre
  -- d'affaires masquerait un taux de remboursement anormal ; les omettre
  -- gonflerait le revenu d'un montant qui a été rendu.
  rembourses as (
    select
      'remboursement' as flux,
      o.devise,
      o.zone,
      (- sum(o.montant_total))::bigint as montant,
      count(*)::bigint as nb
    from public.orders o, bornes b
    where o.statut = 'rembourse'
      and o.maj_le >= b.debut and o.maj_le < b.fin
    group by o.devise, o.zone
  ),

  -- ABONNEMENT. Lu sur les FACTURES et non sur `subscriptions` : une facture
  -- date un encaissement réel, alors qu'un abonnement porte l'état courant et
  -- ne dit rien de ce qui a été encaissé dans la période.
  abonnement as (
    select
      'abonnement' as flux,
      i.devise,
      i.zone,
      sum(i.montant_ttc)::bigint as montant,
      count(*)::bigint as nb
    from public.invoices i, bornes b
    where i.subscription_id is not null
      and i.emise_le >= b.debut and i.emise_le < b.fin
    group by i.devise, i.zone
  )

  select flux, devise, zone, montant, nb from unitaire
  union all select flux, devise, zone, montant, nb from rembourses
  union all select flux, devise, zone, montant, nb from abonnement
  -- Jamais de total consolidé : chaque ligne porte sa devise.
  order by flux, devise, zone;
$$;

comment on function public.stats_chiffre_affaires(timestamptz, timestamptz, timestamptz) is
  'Chiffre d''affaires PAR FLUX, PAR DEVISE et PAR ZONE. Aucun total consolide : additionner des euros et des francs CFA sans taux de change ne produit rien (D4 point 4). Ne lit jamais `users` : les montants restent exacts apres anonymisation.';

revoke all on function public.stats_chiffre_affaires(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.stats_chiffre_affaires(timestamptz, timestamptz, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Abonnés — comptés sur le statut EFFECTIF
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UNE ANOMALIE N'EST PAS UN ABONNÉ ACTIF.                                  │
-- │                                                                          │
-- │ C'est un abonnement dont la période est échue sans qu'aucun événement de  │
-- │ renouvellement ni d'échec ne soit arrivé : on ne sait pas s'il est payé.  │
-- │ Le compter parmi les actifs gonflerait le nombre d'abonnés payants — et   │
-- │ c'est le chiffre sur lequel se prennent les décisions commerciales.       │
-- │                                                                          │
-- │ Le compter parmi les expirés masquerait le défaut d'intégration. Il a     │
-- │ donc sa propre ligne (arbitrage N2, migration 0029).                      │
-- │                                                                          │
-- │ `statut` STOCKÉ n'est jamais utilisé ici : il dit ce que le prestataire a │
-- │ rapporté en dernier, pas où en est l'abonnement aujourd'hui.              │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create function public.stats_abonnes(p_at timestamptz default public.app_now())
  returns table (
    statut_observe public.subscription_status_effectif,
    offre text,
    zone public.price_zone,
    devise text,
    nombre bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select
    public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, p_at),
    s.offre,
    s.zone,
    s.devise,
    count(*)::bigint
  from public.subscriptions s
  group by 1, 2, 3, 4
  order by 1, 2, 3, 4;
$$;

comment on function public.stats_abonnes(timestamptz) is
  'Abonnes par statut OBSERVE (`statut_effectif`), jamais par statut stocke. Une anomalie n''est comptee ni en actif ni en expire : elle a sa propre ligne (arbitrage N2).';

revoke all on function public.stats_abonnes(timestamptz) from public, anon, authenticated;
grant execute on function public.stats_abonnes(timestamptz) to service_role;

-- Mouvements d'abonnement sur la période : souscriptions et résiliations.
create function public.stats_mouvements_abonnement(
  p_debut timestamptz default null,
  p_fin timestamptz default null,
  p_at timestamptz default public.app_now()
)
  returns table (mouvement text, offre text, nombre bigint)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with bornes as (select * from public.periode_stats(p_debut, p_fin, p_at))
  select 'souscription' as mouvement, s.offre, count(*)::bigint
  from public.subscriptions s, bornes b
  where s.cree_le >= b.debut and s.cree_le < b.fin
  group by s.offre
  union all
  select 'resiliation', s.offre, count(*)::bigint
  from public.subscriptions s, bornes b
  where s.annule_le is not null
    and s.annule_le >= b.debut and s.annule_le < b.fin
  group by s.offre
  order by 1, 2;
$$;

revoke all on function public.stats_mouvements_abonnement(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.stats_mouvements_abonnement(timestamptz, timestamptz, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Titres les plus achetés
--
-- Agrégat par titre, jamais par utilisateur. La pagination est PLAFONNÉE, comme
-- pour toutes les listes d'administration.
-- ---------------------------------------------------------------------------

create function public.stats_titres_achetes(
  p_debut timestamptz default null,
  p_fin timestamptz default null,
  p_page integer default 1,
  p_taille integer default 25,
  p_at timestamptz default public.app_now()
)
  returns table (
    book_id uuid,
    slug text,
    langue text,
    devise text,
    nb_achats bigint,
    montant bigint,
    total_lignes bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with bornes as (select * from public.periode_stats(p_debut, p_fin, p_at)),
  base as (
    select
      oi.book_id,
      b.slug,
      oi.langue,
      oi.devise,
      count(*)::bigint as nb_achats,
      -- Le prix FIGÉ sur la ligne de commande, jamais le prix courant du
      -- catalogue : une hausse de tarif ne doit pas réécrire l'histoire.
      sum(oi.prix_unitaire)::bigint as montant
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.books b on b.id = oi.book_id
    cross join bornes bo
    where o.statut = 'paye'
      and o.paye_le is not null
      and o.paye_le >= bo.debut and o.paye_le < bo.fin
    group by oi.book_id, b.slug, oi.langue, oi.devise
  ),
  compte as (select count(*) as total from base)
  select base.*, compte.total
  from base cross join compte
  order by base.nb_achats desc, base.slug
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

comment on function public.stats_titres_achetes(timestamptz, timestamptz, integer, integer, timestamptz) is
  'Titres les plus achetes, par langue et par devise. Montants issus du prix FIGE sur `order_items` : une hausse de tarif ne reecrit pas l''historique.';

revoke all on function public.stats_titres_achetes(timestamptz, timestamptz, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.stats_titres_achetes(timestamptz, timestamptz, integer, integer, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Titres les plus lus
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ UN AGRÉGAT, JAMAIS UN HISTORIQUE NOMINATIF.                               │
-- │                                                                            │
-- │ « Les titres les plus lus » est une question sur le CATALOGUE. La même     │
-- │ table répondrait tout aussi bien à « qu'a lu cet utilisateur ? », qui est  │
-- │ une question sur une PERSONNE — et sur la lecture d'un enfant (§7.7).      │
-- │                                                                            │
-- │ Trois dispositions rendent la seconde question impossible par cette voie : │
-- │                                                                            │
-- │   * `user_id` n'apparaît ni en sortie, ni en paramètre — on ne peut donc   │
-- │     pas filtrer sur une personne ;                                         │
-- │   * seul `count(distinct user_id)` est rendu, un NOMBRE de lecteurs, dont  │
-- │     on ne peut extraire aucune identité ;                                  │
-- │   * un SEUIL D'AGRÉGATION : sous cinq lecteurs distincts, la ligne n'est   │
-- │     pas rendue. Sans lui, un titre lu par une seule personne rendrait      │
-- │     « 1 lecteur », et croiser cette information avec la liste des          │
-- │     acheteurs du titre suffirait à nommer cette personne.                  │
-- │                                                                            │
-- │ Le seuil coûte une part de finesse sur la longue traîne. C'est le prix de  │
-- │ la règle 7 de CLAUDE.md, et il est modeste.                               │
-- └────────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create function public.stats_titres_lus(
  p_debut timestamptz default null,
  p_fin timestamptz default null,
  p_page integer default 1,
  p_taille integer default 25,
  p_at timestamptz default public.app_now()
)
  returns table (
    book_id uuid,
    slug text,
    langue text,
    nb_lecteurs bigint,
    total_lignes bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with bornes as (select * from public.periode_stats(p_debut, p_fin, p_at)),
  base as (
    select
      rp.book_id,
      b.slug,
      rp.langue,
      -- Un NOMBRE de lecteurs distincts. Aucun identifiant ne sort d'ici.
      count(distinct rp.user_id)::bigint as nb_lecteurs
    from public.reading_progress rp
    join public.books b on b.id = rp.book_id
    cross join bornes bo
    where rp.maj_le >= bo.debut and rp.maj_le < bo.fin
    group by rp.book_id, b.slug, rp.langue
    -- LE SEUIL D'AGRÉGATION. Voir le bloc ci-dessus : sans lui, « 1 lecteur »
    -- serait une donnée nominative déguisée en statistique.
    having count(distinct rp.user_id) >= 5
  ),
  compte as (select count(*) as total from base)
  select base.*, compte.total
  from base cross join compte
  order by base.nb_lecteurs desc, base.slug
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

comment on function public.stats_titres_lus(timestamptz, timestamptz, integer, integer, timestamptz) is
  'Titres les plus lus — AGREGAT, jamais historique nominatif. Aucun `user_id` en entree ni en sortie, et un seuil de 5 lecteurs distincts : sous ce seuil, « 1 lecteur » serait une donnee nominative deguisee en statistique.';

revoke all on function public.stats_titres_lus(timestamptz, timestamptz, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.stats_titres_lus(timestamptz, timestamptz, integer, integer, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Répartition linguistique
-- ---------------------------------------------------------------------------

create function public.stats_langues(
  p_debut timestamptz default null,
  p_fin timestamptz default null,
  p_at timestamptz default public.app_now()
)
  returns table (langue text, achats bigint, telechargements bigint)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with bornes as (select * from public.periode_stats(p_debut, p_fin, p_at)),
  langues as (select unnest(array['fr', 'en']) as langue)
  select
    l.langue,
    (select count(*)::bigint
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       cross join bornes b
      where oi.langue = l.langue and o.statut = 'paye'
        and o.paye_le >= b.debut and o.paye_le < b.fin),
    -- Un COMPTE de téléchargements, pas la liste de qui a téléchargé quoi.
    (select count(*)::bigint
       from public.download_logs d cross join bornes b
      where d.langue = l.langue
        and d.telecharge_le >= b.debut and d.telecharge_le < b.fin)
  from langues l
  order by l.langue;
$$;

revoke all on function public.stats_langues(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.stats_langues(timestamptz, timestamptz, timestamptz) to service_role;
