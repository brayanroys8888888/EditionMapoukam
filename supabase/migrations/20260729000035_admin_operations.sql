-- 0035 — Opérations d'administration (étape 13)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ UN COMPTE ANONYMISÉ NE DOIT PAS ÊTRE RÉ-IDENTIFIABLE DEPUIS               │
-- │ L'ADMINISTRATION. C'EST LE PIÈGE LE PLUS DISCRET DE CETTE ÉTAPE.          │
-- │                                                                            │
-- │ L'anonymisation (migration 0014) remplace l'adresse dans `users` par un    │
-- │ jeton irréversible — mais elle CONSERVE les factures, obligation           │
-- │ comptable, et une facture porte `facture_nom` et `facture_email` figés au  │
-- │ moment de l'émission. C'est délibéré et légal.                             │
-- │                                                                            │
-- │ Le danger n'est donc pas la conservation : c'est la JOINTURE. Une vue      │
-- │ d'administration qui listerait les commandes avec l'email de facturation   │
-- │ reconstituerait l'identité effacée, en toute bonne foi, en une ligne de    │
-- │ SQL. L'effacement demandé par l'utilisateur serait annulé sans que         │
-- │ personne ne l'ait décidé.                                                  │
-- │                                                                            │
-- │ Les vues ci-dessous masquent donc systématiquement l'identité dès que le   │
-- │ compte est anonymisé, et un test le prouve.                                │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- PAGINATION PLAFONNÉE PARTOUT. Une route « lister tous les utilisateurs » sans
-- plafond est un vecteur d'exfiltration si un compte administrateur est
-- compromis : une seule requête suffirait à emporter la base de clientèle. Le
-- plafond vit ICI, dans la fonction, et non dans le schéma Zod de la route :
-- une nouvelle route hériterait de la protection sans avoir à y penser.

-- ---------------------------------------------------------------------------
-- Le plafond, nommé une seule fois
-- ---------------------------------------------------------------------------

create function public.taille_page_admin(p_demandee integer)
  returns integer
  language sql
  immutable
as $$
  -- Entre 1 et 100. Une demande absente vaut 25 ; une demande démesurée est
  -- RAMENÉE au plafond plutôt que refusée : refuser inviterait à réessayer
  -- juste en dessous, alors qu'ici la limite est atteinte et c'est tout.
  select least(greatest(coalesce(p_demandee, 25), 1), 100);
$$;

comment on function public.taille_page_admin(integer) is
  'Plafond de pagination des listes d''administration (étape 13, point 7). Défini en base et non dans les routes, pour qu''une route ajoutée plus tard en hérite sans y penser.';

grant execute on function public.taille_page_admin(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Utilisateurs
-- ---------------------------------------------------------------------------

create function public.admin_lister_utilisateurs(
  p_recherche text default null,
  p_statut text default null,
  p_page integer default 1,
  p_taille integer default 25
)
  returns table (
    id uuid,
    email text,
    nom_complet text,
    role public.user_role,
    statut public.user_status,
    cree_le timestamptz,
    anonymise boolean,
    nb_commandes integer,
    nb_droits integer,
    total_lignes bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with base as (
    select u.*
    from public.users u
    where (
        p_recherche is null
        -- La recherche ne porte JAMAIS sur un compte anonymisé : chercher
        -- « martin@ » et retrouver le compte de Martin par son jeton
        -- d'anonymisation reviendrait à ne pas l'avoir anonymisé.
        or (u.statut <> 'anonymise' and (
             u.email ilike '%' || p_recherche || '%'
             or coalesce(u.nom_complet, '') ilike '%' || p_recherche || '%'))
      )
      and (p_statut is null or u.statut::text = p_statut)
  ),
  compte as (select count(*) as total from base)
  select
    base.id,
    -- IDENTITÉ MASQUÉE dès l'anonymisation. Le jeton lui-même n'est pas rendu :
    -- il n'apprend rien et invite à le rapprocher d'autre chose.
    case when base.statut = 'anonymise' then null else base.email end,
    case when base.statut = 'anonymise' then null else base.nom_complet end,
    base.role,
    base.statut,
    base.cree_le,
    (base.statut = 'anonymise') as anonymise,
    (select count(*)::integer from public.orders o where o.user_id = base.id),
    (select count(*)::integer from public.entitlements e where e.user_id = base.id),
    compte.total
  from base cross join compte
  order by base.cree_le desc, base.id
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

comment on function public.admin_lister_utilisateurs(text, text, integer, integer) is
  'Liste paginée et plafonnée des comptes. L''identité d''un compte anonymisé n''est jamais rendue, et la recherche ne l''atteint pas.';

revoke all on function public.admin_lister_utilisateurs(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_lister_utilisateurs(text, text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- Commandes
--
-- La vue la plus exposée au piège de la ré-identification : c'est celle qui a
-- une raison légitime de joindre les factures.
-- ---------------------------------------------------------------------------

create function public.admin_lister_commandes(
  p_statut text default null,
  p_user_id uuid default null,
  p_page integer default 1,
  p_taille integer default 25
)
  returns table (
    id uuid,
    user_id uuid,
    email text,
    montant_total bigint,
    devise text,
    zone public.price_zone,
    statut public.order_status,
    remise bigint,
    cree_le timestamptz,
    paye_le timestamptz,
    numero_facture text,
    acheteur_anonymise boolean,
    nb_lignes integer,
    total_lignes bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with base as (
    select o.*, u.statut as statut_compte, u.email as email_compte
    from public.orders o
    join public.users u on u.id = o.user_id
    where (p_statut is null or o.statut::text = p_statut)
      and (p_user_id is null or o.user_id = p_user_id)
  ),
  compte as (select count(*) as total from base)
  select
    base.id,
    base.user_id,
    -- ┌────────────────────────────────────────────────────────────────────┐
    -- │ NI `users.email`, NI `invoices.facture_email`.                     │
    -- │                                                                    │
    -- │ La facture conserve l'adresse figée à l'émission — c'est une pièce  │
    -- │ comptable, et la loi l'exige. La rendre ici recomposerait pourtant  │
    -- │ l'identité que l'utilisateur a demandé d'effacer.                   │
    -- │                                                                    │
    -- │ La facture reste consultable par son NUMÉRO, pour l'obligation      │
    -- │ comptable, mais aucune vue de liste n'en extrait l'identité.        │
    -- └────────────────────────────────────────────────────────────────────┘
    case when base.statut_compte = 'anonymise' then null else base.email_compte end,
    base.montant_total,
    base.devise,
    base.zone,
    base.statut,
    base.remise,
    base.cree_le,
    base.paye_le,
    (select i.numero from public.invoices i where i.order_id = base.id limit 1),
    (base.statut_compte = 'anonymise') as acheteur_anonymise,
    (select count(*)::integer from public.order_items oi where oi.order_id = base.id),
    compte.total
  from base cross join compte
  order by base.cree_le desc, base.id
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

comment on function public.admin_lister_commandes(text, uuid, integer, integer) is
  'Liste paginée des commandes. N''expose JAMAIS `invoices.facture_email` : la facture conserve légitimement l''adresse figée à l''émission, mais la rendre ici ré-identifierait un compte anonymisé.';

revoke all on function public.admin_lister_commandes(text, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_lister_commandes(text, uuid, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- Catalogue — les brouillons et ce qui leur manque
-- ---------------------------------------------------------------------------

create function public.admin_lister_livres(
  p_statut text default null,
  p_page integer default 1,
  p_taille integer default 25
)
  returns table (
    id uuid,
    slug text,
    auteur text,
    statut public.book_status,
    gratuit boolean,
    inclus_abonnement boolean,
    disponible_achat boolean,
    publie_le timestamptz,
    prix jsonb,
    manques text[],
    publiable boolean,
    total_lignes bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with base as (
    select b.* from public.books b
    where p_statut is null or b.statut::text = p_statut
  ),
  compte as (select count(*) as total from base)
  select
    base.id,
    base.slug,
    base.auteur,
    base.statut,
    base.gratuit,
    base.inclus_abonnement,
    base.disponible_achat,
    base.publie_le,
    coalesce((
      select jsonb_object_agg(bp.zone, jsonb_build_object('montant', bp.montant, 'devise', bp.devise))
      from public.book_prices bp where bp.book_id = base.id
    ), '{}'::jsonb),
    -- La MÊME fonction que le déclencheur de publication (migration 0024) :
    -- le back-office affiche exactement ce que la base refusera, jamais une
    -- approximation qui laisserait découvrir le refus au moment de publier.
    public.manques_pour_publication(base.id),
    (cardinality(public.manques_pour_publication(base.id)) = 0) as publiable,
    compte.total
  from base cross join compte
  order by base.statut, base.slug
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

comment on function public.admin_lister_livres(text, integer, integer) is
  'Liste paginée du catalogue avec, pour chaque titre, ce qui lui manque pour être publiable — calculé par `manques_pour_publication()`, la fonction qu''applique le déclencheur.';

revoke all on function public.admin_lister_livres(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_lister_livres(text, integer, integer) to service_role;

