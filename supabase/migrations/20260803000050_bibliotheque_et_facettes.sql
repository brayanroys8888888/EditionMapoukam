-- ---------------------------------------------------------------------------
-- Bibliotheque et facettes — les deux lectures que l'interface ne peut pas
-- reconstituer sans multiplier les appels
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La bibliotheque d'un compte (§4.2 F7)
--
-- +--------------------------------------------------------------------------+
-- | POURQUOI EN SQL ET EN UN SEUL APPEL.                                     |
-- |                                                                          |
-- | `entitlements` n'etait lue par AUCUNE route utilisateur. Reconstituer     |
-- | « Mes achats » cote client aurait demande un appel par titre — sans meme  |
-- | connaitre les slugs, que la table des droits ne porte pas.                |
-- |                                                                          |
-- | La resolution des droits reste celle du moteur : cette fonction ne decide |
-- | rien, elle JOINT. Un droit expire n'y figure pas, un droit d'achat y      |
-- | figure pour toujours — c'est `entitlements` qui le dit, pas elle.         |
-- +--------------------------------------------------------------------------+
--
-- La progression est jointe a part : elle SURVIT a la perte d'acces (etape 12),
-- si bien qu'un titre en cours de lecture peut n'etre plus accessible. Les deux
-- sections de l'ecran sont donc distinctes, et c'est voulu.
-- ---------------------------------------------------------------------------

create function public.library_for_user(
  p_user uuid,
  p_langue text default 'fr',
  p_at timestamptz default public.app_now()
)
  returns table (
    book_id uuid,
    slug text,
    titre text,
    region public.region_conte,
    couverture_jeton text,
    langues text[],
    source text,
    peut_telecharger boolean,
    accorde_le timestamptz,
    expire_le timestamptz,
    page_reprise integer,
    langue_reprise text,
    derniere_lecture_le timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  with droits as (
    select
      e.book_id,
      -- Le droit le plus fort porte : un titre a la fois offert et achete est
      -- un titre ACHETE. Meme ordre que `reason` dans le moteur (D5).
      max(case when e.type = 'achat' then 2 else 1 end) as force,
      bool_or(e.peut_telecharger) as peut_telecharger,
      min(e.accorde_le) as accorde_le,
      max(e.expire_le) as expire_le
    from public.entitlements e
    where e.user_id = p_user
      and (e.expire_le is null or e.expire_le > p_at)
    group by e.book_id
  ),
  lecture as (
    -- La progression est stockee PAR LANGUE (etape 12) : un titre lu en
    -- francais puis en anglais a deux lignes. La bibliotheque en montre UNE —
    -- la plus recente — sans quoi le meme conte apparaitrait deux fois.
    select distinct on (rp.book_id)
      rp.book_id,
      rp.derniere_page,
      rp.langue,
      rp.maj_le
    from public.reading_progress rp
    where rp.user_id = p_user
    order by rp.book_id, rp.maj_le desc
  )
  select
    b.id,
    b.slug,
    coalesce(t.titre, b.slug),
    b.region,
    b.couverture_jeton,
    coalesce(
      (select array_agg(bt.langue order by bt.langue)
         from public.book_translations bt
        where bt.book_id = b.id and bt.statut = 'publie'),
      '{}'::text[]
    ),
    case when d.force = 2 then 'achat' else 'offert' end,
    coalesce(d.peut_telecharger, false),
    d.accorde_le,
    d.expire_le,
    l.derniere_page,
    l.langue,
    l.maj_le
  from public.books b
  -- `full outer` : un titre peut etre POSSEDE sans etre commence, ou COMMENCE
  -- sans etre possede — un abonne qui a perdu son abonnement, par exemple.
  -- Les deux doivent sortir, et l'appelant les repartit en deux sections.
  left join droits d on d.book_id = b.id
  left join lecture l on l.book_id = b.id
  left join public.book_translations t
    on t.book_id = b.id and t.langue = p_langue and t.statut = 'publie'
  where (d.book_id is not null or l.book_id is not null)
    and b.statut <> 'brouillon'
  order by coalesce(l.maj_le, d.accorde_le) desc nulls last, b.slug;
$fn$;

comment on function public.library_for_user(uuid, text, timestamptz) is
  'Bibliotheque d''un compte : titres possedes et titres commences, en UN appel. Ne decide d''aucun droit — elle joint `entitlements`, qui en est l''autorite.';

revoke all on function public.library_for_user(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.library_for_user(uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Les facettes du catalogue (§4.1 F2)
--
-- +--------------------------------------------------------------------------+
-- | LES PASTILLES DE FILTRE VIENNENT DES VALEURS REELLEMENT PRESENTES.       |
-- |                                                                          |
-- | Les coder en dur dans l'interface les desynchroniserait du catalogue au   |
-- | premier titre ingere. Et c'est aussi ce qui rend `themes` supportable en  |
-- | texte libre : l'interface n'en devine aucun, elle affiche ce qui existe.  |
-- +--------------------------------------------------------------------------+
--
-- Seuls les titres PUBLIES comptent : une facette derivee d'un brouillon
-- annoncerait un catalogue a venir.
-- ---------------------------------------------------------------------------

create function public.catalog_facets(p_langue text default 'fr')
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'regions', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', r.region, 'nombre', r.n) order by r.n desc)
      from (
        select b.region::text as region, count(*)::int as n
        from public.books b
        where b.statut = 'publie' and b.region is not null
        group by b.region
      ) r
    ), '[]'::jsonb),

    'themes', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', t.theme, 'nombre', t.n) order by t.n desc, t.theme)
      from (
        select unnest(b.themes) as theme, count(*)::int as n
        from public.books b
        where b.statut = 'publie'
        group by 1
      ) t
    ), '[]'::jsonb),

    'origines', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', o.origine, 'nombre', o.n) order by o.n desc, o.origine)
      from (
        select b.origine_culturelle as origine, count(*)::int as n
        from public.books b
        where b.statut = 'publie' and b.origine_culturelle is not null
        group by 1
      ) o
    ), '[]'::jsonb),

    -- Les bornes reelles, pour que le curseur d'age ne propose pas un intervalle
    -- ou aucun titre ne se trouve.
    'age', (
      select jsonb_build_object('min', min(b.age_min), 'max', max(b.age_max))
      from public.books b where b.statut = 'publie'
    ),

    'langues', coalesce((
      select jsonb_agg(distinct bt.langue)
      from public.book_translations bt
      join public.books b on b.id = bt.book_id
      where bt.statut = 'publie' and b.statut = 'publie'
    ), '[]'::jsonb),

    'total', (select count(*)::int from public.books where statut = 'publie')
  );
$fn$;

comment on function public.catalog_facets(text) is
  'Valeurs de filtre REELLEMENT presentes au catalogue publie, avec leur effectif. Les pastilles de l''interface en decoulent, jamais d''une liste ecrite en dur.';

revoke all on function public.catalog_facets(text) from public;
grant execute on function public.catalog_facets(text) to service_role, anon, authenticated;
