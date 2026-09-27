-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0090 — CHAQUE SEGMENT DE FILTRE PORTE SON COMPTE.                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI UNE FONCTION DE PLUS, ET PAS UN COMPTE FAIT À L'ÉCRAN.         │
-- │                                                                          │
-- │ L'écran des contes compte ses statuts en TypeScript, et il a raison de   │
-- │ le faire : il charge le catalogue entier, une dizaine de lignes, et      │
-- │ compter ce qu'on tient déjà ne coûte rien.                               │
-- │                                                                          │
-- │ L'écran des commandes ne tient PAS l'ensemble : il en charge une page,   │
-- │ déjà filtrée. Compter dessus donnerait « Échouée 0 » sur un filtre       │
-- │ « Payée » — c'est-à-dire l'inverse de ce qu'un compteur de segment sert  │
-- │ à dire, qui est « voilà ce que tu trouverais en cliquant ici ».          │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LES COMPTES SUIVENT LES AUTRES FILTRES, PAS LE LEUR.                    │
-- │                                                                          │
-- │ Une recherche sur « Fotso » et une devise cochée réduisent l'ensemble :  │
-- │ les comptes doivent le refléter, sinon ils annoncent des lignes que le   │
-- │ clic ne montrera pas. Le statut, lui, est exclu de son propre filtre —   │
-- │ compter « les payées parmi les payées » rendrait tous les autres         │
-- │ segments à zéro, et le contrôle deviendrait un cul-de-sac dont on ne     │
-- │ sortirait qu'en revenant à « Toutes ».                                   │
-- │                                                                          │
-- │ Le prédicat de recherche est REPRIS MOT POUR MOT de                      │
-- │ `admin_lister_commandes` (0089). Deux prédicats qui divergent donnent    │
-- │ un compte qui ne correspond pas à la liste — et c'est toujours le compte │
-- │ qu'on croit.                                                             │
-- └──────────────────────────────────────────────────────────────────────────┘

create function public.admin_compter_commandes_par_statut(
  p_devise text default null,
  p_recherche text default null
) returns table (
  statut public.order_status,
  nb bigint
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with retenues as (
    select o.statut
    from public.orders o
    join public.users u on u.id = o.user_id
    where (p_devise is null or o.devise = p_devise)
      and (
        p_recherche is null
        or length(btrim(p_recherche)) = 0
        or o.numero::text like '%' || btrim(p_recherche) || '%'
        or (
          u.statut <> 'anonymise'
          and (
            u.nom_complet ilike '%' || btrim(p_recherche) || '%'
            or u.email ilike '%' || btrim(p_recherche) || '%'
          )
        )
        or exists (
          select 1
          from public.order_items oi
          join public.books b on b.id = oi.book_id
          where oi.order_id = o.id
            and b.slug ilike '%' || btrim(p_recherche) || '%'
        )
      )
  )
  /*
   * TOUS les statuts sortent, y compris ceux à zéro.
   *
   * Un `group by` seul ferait disparaître le segment « Remboursée » d'une
   * boutique qui n'a jamais remboursé — et l'écran perdrait un filtre au lieu
   * de le montrer vide. La jointure externe sur l'énumération garantit la
   * présence des quatre, dans l'ordre déclaré.
   */
  select
    valeur.statut,
    count(retenues.statut)
  from unnest(enum_range(null::public.order_status)) as valeur(statut)
  left join retenues on retenues.statut = valeur.statut
  group by valeur.statut
  order by valeur.statut;
$$;

comment on function public.admin_compter_commandes_par_statut(text, text) is
  'Nombre de commandes par statut, pour les compteurs des segments de filtre. Suit les autres filtres actifs (devise, recherche) mais jamais le statut lui-même. Rend les quatre statuts, y compris à zéro.';

revoke all on function public.admin_compter_commandes_par_statut(text, text)
  from public, anon, authenticated;
grant execute on function public.admin_compter_commandes_par_statut(text, text)
  to service_role;
