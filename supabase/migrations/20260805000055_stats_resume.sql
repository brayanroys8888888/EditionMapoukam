-- ---------------------------------------------------------------------------
-- Résumé du chiffre d'affaires — PAR DEVISE, et jamais entre devises.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI CE RÉSUMÉ N'ENFREINT PAS D4 POINT 4.                          │
-- │                                                                          │
-- │ La règle est qu'on n'additionne JAMAIS des euros et des francs CFA sans  │
-- │ taux de change : la somme n'est pas approximative, elle n'existe pas.    │
-- │                                                                          │
-- │ Ce résumé regroupe par `devise` et rien d'autre. Il additionne des euros │
-- │ avec des euros, et rend une LIGNE PAR DEVISE — jamais un total unique.   │
-- │ `stats_chiffre_affaires` continue de ventiler par flux ET par zone : ce  │
-- │ résumé ne le remplace pas, il répond à une autre question.               │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI EN SQL PLUTÔT QUE DANS L'ÉCRAN.                               │
-- │                                                                          │
-- │ Un écran qui additionne des montants est précisément ce qu'un test       │
-- │ d'architecture du frontend interdit, et pour une bonne raison : la       │
-- │ somme aurait fini par franchir la frontière de devise, sur une ligne     │
-- │ écrite six mois plus tard par quelqu'un qui n'aurait pas su.             │
-- │                                                                          │
-- │ Ici, le `group by devise` rend la faute impossible à commettre.          │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Le REMBOURSÉ est rendu en valeur POSITIVE, contrairement à
-- `stats_chiffre_affaires` qui le porte en négatif pour pouvoir l'empiler.
-- L'écran affiche « remboursé : 40 € », pas « −40 € » : le signe se lit mal
-- dans une carte, et `net` porte déjà la soustraction.

create function public.stats_chiffre_affaires_resume(
  p_debut timestamptz default null,
  p_fin timestamptz default null,
  p_at timestamptz default public.app_now()
)
  returns table (
    devise text,
    brut bigint,
    rembourse bigint,
    net bigint,
    nb_transactions bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  -- Construit SUR `stats_chiffre_affaires`, jamais à côté : les bornes de
  -- période, le plafond de trois ans, la lecture des factures plutôt que des
  -- abonnements et l'exclusion de `users` sont définis là-bas, une fois. Les
  -- rejouer ici aurait donné deux chiffres d'affaires qui divergent.
  select
    d.devise,
    coalesce(sum(d.montant) filter (where d.flux <> 'remboursement'), 0)::bigint as brut,
    coalesce(- sum(d.montant) filter (where d.flux = 'remboursement'), 0)::bigint as rembourse,
    coalesce(sum(d.montant), 0)::bigint as net,
    coalesce(sum(d.nb_transactions) filter (where d.flux <> 'remboursement'), 0)::bigint
      as nb_transactions
  from public.stats_chiffre_affaires(p_debut, p_fin, p_at) d
  group by d.devise
  order by d.devise;
$$;

comment on function public.stats_chiffre_affaires_resume(timestamptz, timestamptz, timestamptz) is
  'Chiffre d''affaires consolidé PAR DEVISE — brut, remboursé, net. Jamais de total unique : additionner des euros et des francs CFA sans taux de change ne produit rien (D4 point 4). Construit sur `stats_chiffre_affaires`, dont il hérite les bornes de période.';

revoke all on function public.stats_chiffre_affaires_resume(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.stats_chiffre_affaires_resume(timestamptz, timestamptz, timestamptz)
  to service_role;
