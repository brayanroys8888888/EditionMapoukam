-- 0036 — Mutations d'administration (étape 13)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ L'ACTEUR EST UN ARGUMENT OBLIGATOIRE DE CHAQUE MUTATION.                  │
-- │                                                                            │
-- │ Chaque fonction pose `app.acteur` dans SA transaction, où les déclencheurs │
-- │ de la migration 0034 le lisent. C'est la seule construction qui tienne :   │
-- │ un paramètre posé par la route serait déjà oublié, PostgREST ouvrant une   │
-- │ transaction par appel.                                                     │
-- │                                                                            │
-- │ Conséquence voulue : on ne peut pas actionner un levier commercial sans    │
-- │ dire qui le fait. L'oubli n'est pas détecté après coup, il est impossible. │
-- └────────────────────────────────────────────────────────────────────────────┘

/**
 * Vérifie l'acteur et le dépose pour les déclencheurs.
 *
 * LE RÔLE EST REVÉRIFIÉ EN BASE (étape 13, point 1). Le contrôle existe déjà
 * dans `requireAdmin`, côté application ; celui-ci est le second, et il porte
 * sur l'état réel de la ligne au moment de l'écriture. Un compte rétrogradé
 * entre l'émission de son jeton et son action est arrêté ici, et nulle part
 * ailleurs.
 */
create function public.admin_poser_acteur(p_acteur uuid, p_motif text default null)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if p_acteur is null then
    raise exception 'Aucun administrateur identifie pour cette action.'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.is_admin(p_acteur) then
    raise exception 'Action reservee aux administrateurs.'
      using errcode = 'insufficient_privilege';
  end if;

  -- `is_local = true` : le réglage meurt avec la transaction. Une connexion
  -- rendue au pool ne doit jamais garder l'identité de l'appelant précédent.
  perform set_config('app.acteur', p_acteur::text, true);
  perform set_config('app.motif', coalesce(p_motif, ''), true);
end;
$$;

comment on function public.admin_poser_acteur(uuid, text) is
  'Verifie EN BASE que l''acteur est administrateur, puis le depose dans la transaction pour les declencheurs d''audit. Le role est ainsi controle deux fois : dans l''application, et au moment de l''ecriture.';

revoke all on function public.admin_poser_acteur(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_poser_acteur(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Octroi et retrait manuels de droits
--
-- Le motif est un PARAMÈTRE, et non un champ facultatif d'un `insert`. C'est le
-- levier qui donne du contenu gratuitement : il ne laisse aucune trace
-- comptable — pas de commande, pas de facture — et accorde un accès définitif.
-- ---------------------------------------------------------------------------

create function public.admin_octroyer_droit(
  p_acteur uuid,
  p_user_id uuid,
  p_book_id uuid,
  p_motif text,
  p_peut_telecharger boolean default false,
  p_expire_le timestamptz default null
)
  returns public.entitlements
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_droit public.entitlements;
begin
  if p_motif is null or length(btrim(p_motif)) < 3 then
    raise exception 'Un octroi manuel de droits exige un motif.'
      using errcode = 'check_violation';
  end if;

  perform public.admin_poser_acteur(p_acteur, p_motif);

  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'Compte % introuvable.', p_user_id using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.books where id = p_book_id) then
    raise exception 'Titre % introuvable.', p_book_id using errcode = 'no_data_found';
  end if;

  insert into public.entitlements
    (user_id, book_id, type, source_id, peut_telecharger, expire_le)
  values
    (p_user_id, p_book_id, 'offert', null, p_peut_telecharger, p_expire_le)
  returning * into v_droit;

  return v_droit;
end;
$$;

comment on function public.admin_octroyer_droit(uuid, uuid, uuid, text, boolean, timestamptz) is
  'Octroi manuel d''un droit, avec motif OBLIGATOIRE (etape 13, point 3).';

revoke all on function public.admin_octroyer_droit(uuid, uuid, uuid, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_octroyer_droit(uuid, uuid, uuid, text, boolean, timestamptz)
  to service_role;

/**
 * Retrait d'un droit OFFERT.
 *
 * Un droit issu d'un ACHAT n'est jamais retirable par cette voie : §3.1 promet
 * à l'acheteur un accès sans limite de durée, et le retirer serait reprendre ce
 * qui a été payé. Le seul chemin qui retire un droit d'achat est le
 * remboursement, qui rend l'argent en même temps.
 */
create function public.admin_retirer_droit(
  p_acteur uuid,
  p_entitlement_id uuid,
  p_motif text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_type public.entitlement_type;
begin
  perform public.admin_poser_acteur(p_acteur, p_motif);

  select type into v_type from public.entitlements where id = p_entitlement_id for update;
  if not found then
    raise exception 'Droit % introuvable.', p_entitlement_id using errcode = 'no_data_found';
  end if;

  if v_type <> 'offert' then
    raise exception 'Un droit issu d''un achat ne se retire que par un remboursement.'
      using errcode = 'check_violation';
  end if;

  delete from public.entitlements where id = p_entitlement_id;
end;
$$;

revoke all on function public.admin_retirer_droit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_retirer_droit(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Leviers commerciaux du catalogue
-- ---------------------------------------------------------------------------

create function public.admin_modifier_livre(
  p_acteur uuid,
  p_book_id uuid,
  p_gratuit boolean default null,
  p_inclus_abonnement boolean default null,
  p_disponible_achat boolean default null,
  p_auteur text default null,
  p_origine_culturelle text default null,
  p_age_min smallint default null,
  p_age_max smallint default null,
  p_nb_pages_extrait smallint default null
)
  returns public.books
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_livre public.books;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  -- `coalesce` sur chaque champ : un paramètre absent ne modifie rien. Une mise
  -- à jour partielle ne doit pas remettre à nul ce qu'elle ne nomme pas.
  update public.books
  set gratuit            = coalesce(p_gratuit, gratuit),
      inclus_abonnement  = coalesce(p_inclus_abonnement, inclus_abonnement),
      disponible_achat   = coalesce(p_disponible_achat, disponible_achat),
      auteur             = coalesce(p_auteur, auteur),
      origine_culturelle = coalesce(p_origine_culturelle, origine_culturelle),
      age_min            = coalesce(p_age_min, age_min),
      age_max            = coalesce(p_age_max, age_max),
      nb_pages_extrait   = coalesce(p_nb_pages_extrait, nb_pages_extrait),
      maj_le             = public.app_now()
  where id = p_book_id
  returning * into v_livre;

  if not found then
    raise exception 'Titre % introuvable.', p_book_id using errcode = 'no_data_found';
  end if;

  return v_livre;
end;
$$;

revoke all on function public.admin_modifier_livre(uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint)
  from public, anon, authenticated;
grant execute on function public.admin_modifier_livre(uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint)
  to service_role;

create function public.admin_definir_prix(
  p_acteur uuid,
  p_book_id uuid,
  p_zone public.price_zone,
  p_montant bigint,
  p_devise text
)
  returns public.book_prices
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_prix public.book_prices;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  insert into public.book_prices (book_id, zone, montant, devise)
  values (p_book_id, p_zone, p_montant, p_devise)
  on conflict (book_id, zone) do update
    set montant = excluded.montant, devise = excluded.devise, maj_le = public.app_now()
  returning * into v_prix;

  return v_prix;
end;
$$;

revoke all on function public.admin_definir_prix(uuid, uuid, public.price_zone, bigint, text)
  from public, anon, authenticated;
grant execute on function public.admin_definir_prix(uuid, uuid, public.price_zone, bigint, text)
  to service_role;

/**
 * Changement de statut de publication, à l'unité OU EN LOT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PUBLIER QUARANTE TITRES D'UN COUP NE CONTOURNE RIEN.                    │
 * │                                                                          │
 * │ L'action groupée est le chemin par lequel les validations s'échappent    │
 * │ d'ordinaire : on écrit la boucle du côté « rapide », en                  │
 * │ `update … where id = any(…)`, et le contrôle qui existait pour un titre   │
 * │ n'existe plus pour quarante.                                             │
 * │                                                                          │
 * │ Ici, il n'y a PAS de chemin rapide. Le lot est une boucle sur le chemin  │
 * │ unitaire, et le déclencheur `books_valider_publication` (migration 0024)  │
 * │ s'applique à chaque ligne. Un titre incomplet dans le lot fait échouer    │
 * │ TOUTE la transaction : quarante titres publiés à moitié seraient pires    │
 * │ qu'un refus, parce qu'il faudrait deviner lesquels sont passés.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
create function public.admin_changer_publication(
  p_acteur uuid,
  p_book_ids uuid[],
  p_statut public.book_status
)
  -- Les colonnes de sortie sont PRÉFIXÉES, et ce n'est pas cosmétique : en
  -- PL/pgSQL, une colonne de sortie nommée `publie_le` devient une variable du
  -- même nom, et « column reference "publie_le" is ambiguous » fait échouer
  -- l'`update` ci-dessous. Le préfixe supprime la collision à la source plutôt
  -- que de la contourner à chaque référence.
  returns table (
    sortie_book_id uuid,
    sortie_statut public.book_status,
    sortie_publie_le timestamptz
  )
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if p_book_ids is null or cardinality(p_book_ids) = 0 then
    raise exception 'Aucun titre designe.' using errcode = 'check_violation';
  end if;

  -- Plafond du lot : une action groupée doit rester une action, pas un import.
  if cardinality(p_book_ids) > 100 then
    raise exception 'Action groupee limitee a 100 titres.' using errcode = 'check_violation';
  end if;

  foreach v_id in array p_book_ids loop
    update public.books
    set statut = p_statut,
        -- `publie_le` est posé à la PREMIÈRE publication et jamais réécrit :
        -- c'est lui qui fait courir la fenêtre de vente de 3 mois (§3.2). Le
        -- remettre à jour à chaque republication rouvrirait la fenêtre d'un
        -- titre déjà entré dans l'abonnement.
        publie_le = case
          when p_statut = 'publie' and publie_le is null then public.app_now()
          else publie_le
        end,
        maj_le = public.app_now()
    where id = v_id;

    if not found then
      raise exception 'Titre % introuvable.', v_id using errcode = 'no_data_found';
    end if;
  end loop;

  return query
    select b.id, b.statut, b.publie_le from public.books b
    where b.id = any(p_book_ids) order by b.slug;
end;
$$;

comment on function public.admin_changer_publication(uuid, uuid[], public.book_status) is
  'Publication ou archivage, a l''unite ou en lot. Le lot est une boucle sur le chemin unitaire : le declencheur de validation s''applique a chaque titre, et un titre incomplet fait echouer tout le lot.';

revoke all on function public.admin_changer_publication(uuid, uuid[], public.book_status)
  from public, anon, authenticated;
grant execute on function public.admin_changer_publication(uuid, uuid[], public.book_status)
  to service_role;

-- ---------------------------------------------------------------------------
-- Paramètres métier
-- ---------------------------------------------------------------------------

create function public.admin_modifier_parametres(
  p_acteur uuid,
  p_fenetre_nouveaute_jours integer default null,
  p_periode_grace_jours integer default null,
  p_jours_essai integer default null,
  p_tolerance_renouvellement_heures integer default null,
  p_retention_copies_mois integer default null
)
  returns public.business_settings
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_parametres public.business_settings;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  update public.business_settings
  set fenetre_nouveaute_jours = coalesce(p_fenetre_nouveaute_jours, fenetre_nouveaute_jours),
      periode_grace_jours = coalesce(p_periode_grace_jours, periode_grace_jours),
      jours_essai = coalesce(p_jours_essai, jours_essai),
      tolerance_renouvellement_heures =
        coalesce(p_tolerance_renouvellement_heures, tolerance_renouvellement_heures),
      retention_copies_mois = coalesce(p_retention_copies_mois, retention_copies_mois),
      maj_le = public.app_now()
  where id = 1
  returning * into v_parametres;

  return v_parametres;
end;
$$;

revoke all on function public.admin_modifier_parametres(uuid, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_modifier_parametres(uuid, integer, integer, integer, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- Suspension d'un compte
-- ---------------------------------------------------------------------------

create function public.admin_definir_statut_compte(
  p_acteur uuid,
  p_user_id uuid,
  p_suspendu boolean,
  p_motif text default null
)
  returns public.users
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_compte public.users;
begin
  perform public.admin_poser_acteur(p_acteur, p_motif);

  if p_user_id = p_acteur then
    -- Se suspendre soi-même fermerait la porte de l'intérieur : plus personne
    -- ne pourrait rouvrir le compte, l'action exigeant un administrateur actif.
    raise exception 'Un administrateur ne peut pas suspendre son propre compte.'
      using errcode = 'check_violation';
  end if;

  select * into v_compte from public.users where id = p_user_id for update;
  if not found then
    raise exception 'Compte % introuvable.', p_user_id using errcode = 'no_data_found';
  end if;

  if v_compte.statut = 'anonymise' then
    -- Un compte anonymisé n'a plus d'identité d'authentification : le suspendre
    -- n'a pas de sens, et le « réactiver » serait le rouvrir.
    raise exception 'Un compte anonymise ne se suspend ni ne se reactive.'
      using errcode = 'check_violation';
  end if;

  update public.users
  set statut = case when p_suspendu then 'suspendu'::public.user_status
                    else 'actif'::public.user_status end,
      maj_le = public.app_now()
  where id = p_user_id
  returning * into v_compte;

  return v_compte;
end;
$$;

revoke all on function public.admin_definir_statut_compte(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.admin_definir_statut_compte(uuid, uuid, boolean, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Changement de zone d'un abonnement (arbitrage N4)
--
-- Un abonné qui déménage réellement change de grille tarifaire. Le geste est
-- légitime, mais il n'appartient qu'à l'administration : laissé à
-- l'utilisateur, il reviendrait à publier une grille au choix du client.
--
-- Le montant et la devise ne sont PAS recalculés. Ils sont figés sur
-- l'abonnement (D4 point 7) et ne changeront qu'au prochain renouvellement,
-- sous la nouvelle zone : les modifier maintenant réviserait rétroactivement
-- une période déjà payée.
-- ---------------------------------------------------------------------------

create function public.admin_changer_zone_abonnement(
  p_acteur uuid,
  p_subscription_id uuid,
  p_zone public.price_zone,
  p_motif text default null
)
  returns public.subscriptions
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_abonnement public.subscriptions;
begin
  perform public.admin_poser_acteur(p_acteur, p_motif);

  select * into v_abonnement
  from public.subscriptions where id = p_subscription_id for update;

  if not found then
    raise exception 'Abonnement % introuvable.', p_subscription_id
      using errcode = 'no_data_found';
  end if;

  if v_abonnement.zone = p_zone then
    -- Idempotent : rejouer la même demande ne doit ni échouer ni produire une
    -- ligne d'audit annonçant un changement qui n'a pas eu lieu.
    return v_abonnement;
  end if;

  update public.subscriptions
  set zone = p_zone, maj_le = public.app_now()
  where id = p_subscription_id
  returning * into v_abonnement;

  return v_abonnement;
end;
$$;

comment on function public.admin_changer_zone_abonnement(uuid, uuid, public.price_zone, text) is
  'Changement de zone d''un abonnement (arbitrage N4). Jamais accessible a l''utilisateur. Le montant et la devise restent figes : ils ne changeront qu''au prochain renouvellement.';

revoke all on function public.admin_changer_zone_abonnement(uuid, uuid, public.price_zone, text)
  from public, anon, authenticated;
grant execute on function public.admin_changer_zone_abonnement(uuid, uuid, public.price_zone, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Codes promotionnels
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ UN CODE À MONTANT FIXE EST LIÉ À UNE ZONE ET À UNE DEVISE.                 │
-- │                                                                            │
-- │ « 5 € de réduction » n'a aucun sens sur un panier en francs CFA : appliqué │
-- │ tel quel, il retirerait cinq francs là où il promettait cinq euros, soit   │
-- │ trois millièmes de la remise annoncée. Un code en POURCENTAGE, lui,        │
-- │ fonctionne partout — 20 % valent 20 % dans toutes les devises.             │
-- │                                                                            │
-- │ La contrainte `promo_montant_a_une_devise` (migration 0007) impose déjà la │
-- │ devise. La ZONE est ajoutée ici : deux zones pourraient partager une       │
-- │ devise, et une remise consentie sur une grille ne se transpose pas à       │
-- │ l'autre.                                                                   │
-- └────────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

alter table public.promo_codes add column zone public.price_zone;

comment on column public.promo_codes.zone is
  'Zone tarifaire d''un code a MONTANT fixe. Nulle pour un code en pourcentage, qui vaut dans toutes les zones. Deux zones pourraient partager une devise : la devise seule ne suffit pas a cantonner une remise.';

alter table public.promo_codes
  add constraint promo_pourcentage_sans_zone
  check (type <> 'pourcentage' or zone is null);

comment on constraint promo_pourcentage_sans_zone on public.promo_codes is
  'Un code en pourcentage n''est jamais cantonne a une zone : le cantonner suggererait qu''il ne vaut pas ailleurs, alors qu''un pourcentage est neutre en devise.';

alter table public.promo_codes
  add constraint promo_montant_a_une_zone
  check (type <> 'montant' or zone is not null);

comment on constraint promo_montant_a_une_zone on public.promo_codes is
  'Symetrique de `promo_montant_a_une_devise` : un code a montant fixe est cantonne a une zone, sans quoi il s''appliquerait a une grille tarifaire pour laquelle il n''a pas ete consenti.';

create function public.admin_enregistrer_promo(
  p_acteur uuid,
  p_code text,
  p_type public.promo_type,
  p_valeur bigint,
  p_devise text default null,
  p_zone public.price_zone default null,
  p_expire_le timestamptz default null,
  p_usage_max integer default null,
  p_actif boolean default true
)
  returns public.promo_codes
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_promo public.promo_codes;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if p_type = 'montant' and (p_devise is null or p_zone is null) then
    raise exception 'Un code a montant fixe exige une devise ET une zone.'
      using errcode = 'check_violation',
            hint = 'Cinq euros de remise n''ont aucun sens sur un panier en FCFA.';
  end if;

  insert into public.promo_codes (code, type, valeur, devise, zone, expire_le, usage_max, actif)
  values (upper(btrim(p_code)), p_type, p_valeur,
          case when p_type = 'montant' then p_devise end,
          case when p_type = 'montant' then p_zone end,
          p_expire_le, p_usage_max, p_actif)
  on conflict (code) do update
    set type = excluded.type,
        valeur = excluded.valeur,
        devise = excluded.devise,
        zone = excluded.zone,
        expire_le = excluded.expire_le,
        usage_max = excluded.usage_max,
        actif = excluded.actif
  returning * into v_promo;

  return v_promo;
end;
$$;

revoke all on function public.admin_enregistrer_promo(uuid, text, public.promo_type, bigint, text, public.price_zone, timestamptz, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_enregistrer_promo(uuid, text, public.promo_type, bigint, text, public.price_zone, timestamptz, integer, boolean)
  to service_role;

create function public.admin_lister_promos(
  p_page integer default 1,
  p_taille integer default 25
)
  returns table (
    id uuid,
    code text,
    type public.promo_type,
    valeur bigint,
    devise text,
    zone public.price_zone,
    expire_le timestamptz,
    actif boolean,
    usage_max integer,
    usage_count integer,
    total_lignes bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with compte as (select count(*) as total from public.promo_codes)
  select p.id, p.code, p.type, p.valeur, p.devise, p.zone, p.expire_le,
         p.actif, p.usage_max, p.usage_count, compte.total
  from public.promo_codes p cross join compte
  order by p.cree_le desc, p.id
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

revoke all on function public.admin_lister_promos(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_lister_promos(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Abonnements — liste
-- ---------------------------------------------------------------------------

create function public.admin_lister_abonnements(
  p_statut text default null,
  p_page integer default 1,
  p_taille integer default 25
)
  returns table (
    id uuid,
    user_id uuid,
    email text,
    offre text,
    statut public.subscription_status,
    statut_observe public.subscription_status_effectif,
    debut_periode timestamptz,
    fin_periode timestamptz,
    zone public.price_zone,
    devise text,
    montant bigint,
    total_lignes bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with base as (
    select s.*, u.email as email_compte, u.statut as statut_compte,
           public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, public.app_now())
             as observe
    from public.subscriptions s
    join public.users u on u.id = s.user_id
  ),
  filtre as (
    select * from base where p_statut is null or base.observe::text = p_statut
  ),
  compte as (select count(*) as total from filtre)
  select
    filtre.id,
    filtre.user_id,
    -- Masquée pour un compte anonymisé, comme partout ailleurs.
    case when filtre.statut_compte = 'anonymise' then null else filtre.email_compte end,
    filtre.offre,
    filtre.statut,
    filtre.observe,
    filtre.debut_periode,
    filtre.fin_periode,
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

revoke all on function public.admin_lister_abonnements(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_lister_abonnements(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Purge des copies filigranées — trace du déclenchement manuel
--
-- Solution intermédiaire pour P1 de la section « À brancher avant la mise en
-- production » : un déclenchement à la main vaut mieux qu'un appel qui n'existe
-- pas. C'est une opération de MAINTENANCE, pas une simulation — sa place est en
-- administration et non dans la console `/dev` (étape 13, point 8).
-- ---------------------------------------------------------------------------

create function public.admin_tracer_purge(p_acteur uuid, p_nombre integer)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  perform public.admin_poser_acteur(p_acteur, null);
  perform public.journaliser_admin(
    'purge_copies', 'maintenance', null, null,
    jsonb_build_object('copies_effacees', p_nombre), null);
end;
$$;

revoke all on function public.admin_tracer_purge(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_tracer_purge(uuid, integer) to service_role;
