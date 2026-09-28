-- ---------------------------------------------------------------------------
-- L'ASSOCIATION DAVE — ce que l'administration lit et écrit.
--
-- Toutes les mutations passent par `admin_poser_acteur`, qui revérifie le rôle
-- EN BASE et pose l'acteur pour l'audit. C'est le troisième des trois
-- contrôles indépendants de `CLAUDE.md` : l'écran garde, la route délègue, la
-- fonction revérifie.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Les quatre chiffres — enfin ceux du prototype
-- ---------------------------------------------------------------------------

/*
 * La 0095 rendait « brouillons » et « dernière parution » à la place de
 * « à modérer » et « prochaine publication », faute de commentaires et de
 * programmation. Les deux existent depuis les 0096 et 0099 : les vrais
 * chiffres remplacent les substituts, et les substituts restent — ils ne
 * coûtent rien de plus et l'éditeur s'en sert.
 *
 * `drop` avant `create` : le type de retour change, et `create or replace`
 * refuse de le faire.
 */
drop function if exists public.admin_stats_association(timestamptz);

create function public.admin_stats_association(
  p_at timestamptz default public.app_now()
)
returns table (
  adherents bigint,
  a_renouveler bigint,
  a_moderer bigint,
  prochaine_publication timestamptz,
  brouillons bigint,
  derniere_publication timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with observes as (
    select
      s.fin_periode,
      public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, p_at) as observe
    from public.subscriptions s
    where s.domaine = 'association'
  ),
  fenetre as (select p_at + interval '30 days' as terme)
  select
    (select count(*) from observes where observe in ('actif', 'annule')),

    (select count(*) from observes, fenetre f
      where observe in ('actif', 'annule')
        and fin_periode > p_at
        and fin_periode <= f.terme),

    (select count(*) from public.association_comments where statut = 'en_attente'),

    -- La prochaine mise en ligne PRÉVUE. Une date déjà passée sur un contenu
    -- encore en brouillon n'est plus une prochaine publication : c'est un
    -- rendez-vous manqué, et il se lit dans la liste, pas dans ce chiffre.
    (select min(programme_le) from public.association_contents
      where statut <> 'publie' and programme_le > p_at),

    (select count(*) from public.association_contents where statut <> 'publie'),

    (select max(publie_le) from public.association_contents where statut = 'publie')
$$;

comment on function public.admin_stats_association(timestamptz) is
  'Les chiffres de l''écran Association DAVE. Comptés contre app_now(), jamais contre l''horloge du serveur de rendu.';

-- ---------------------------------------------------------------------------
-- 2. Les publications
-- ---------------------------------------------------------------------------

create or replace function public.admin_lister_publications_association(
  p_type public.type_publication default null,
  p_langue text default 'fr'
)
returns table (
  id uuid,
  slug text,
  type_publication public.type_publication,
  categorie public.association_category,
  acces public.association_access,
  titre text,
  etat public.statut_publication,
  publie_le timestamptz,
  programme_le timestamptz,
  vedette boolean,
  vues bigint,
  nb_commentaires bigint,
  commentaires_ouverts boolean,
  langues text[]
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    c.id,
    c.slug,
    c.type_publication,
    c.categorie,
    c.acces,
    t.titre,
    -- L'état passe par l'UNIQUE implémentation. Un `case` recopié ici
    -- divergerait le jour où la règle bougerait.
    public.statut_publication(c.statut, c.programme_le),
    c.publie_le,
    c.programme_le,
    c.vedette,
    c.vues,
    (select count(*) from public.association_comments m where m.content_id = c.id),
    c.commentaires_ouverts,
    (
      select coalesce(array_agg(v.langue order by v.langue), '{}')
      from public.association_content_translations v
      where v.content_id = c.id
    )
  from public.association_contents c
  left join public.association_content_translations t
    on t.content_id = c.id and t.langue = p_langue
  where p_type is null or c.type_publication = p_type
  -- Les plus récentes d'abord, et les brouillons sans date en tête : ce sont
  -- eux qui demandent une suite.
  order by coalesce(c.publie_le, c.programme_le) desc nulls first, c.cree_le desc;
$$;

-- ---------------------------------------------------------------------------
-- 3. Le rythme hebdomadaire — les quatre prochains jeudis
-- ---------------------------------------------------------------------------

/*
 * Le jeudi est la promesse faite aux adhérents : un contenu par semaine. Ce
 * tableau sert à la TENIR — il montre les créneaux libres autant que les
 * occupés, et c'est le vide qui est l'information.
 *
 * Le calcul du prochain jeudi vit ici et nulle part ailleurs. En TypeScript,
 * il répondrait selon l'horloge du serveur de rendu et ignorerait le temps
 * déplacé par la console de simulation.
 */
create or replace function public.admin_prochains_jeudis(
  p_nb integer default 4,
  p_at timestamptz default public.app_now()
)
returns table (
  jour date,
  content_id uuid,
  titre text,
  etat public.statut_publication
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with jeudis as (
    -- `isodow` vaut 4 le jeudi. Le premier jeudi À VENIR, aujourd'hui compris.
    select (date_trunc('day', p_at)
            + make_interval(days => ((4 - extract(isodow from p_at)::int) + 7) % 7)
            + make_interval(weeks => g))::date as jour
    from generate_series(0, greatest(p_nb, 1) - 1) g
  )
  select
    j.jour,
    c.id,
    t.titre,
    public.statut_publication(c.statut, c.programme_le)
  from jeudis j
  left join public.association_contents c
    on (coalesce(c.programme_le, c.publie_le) at time zone 'UTC')::date = j.jour
  left join public.association_content_translations t
    on t.content_id = c.id and t.langue = 'fr'
  order by j.jour;
$$;

-- ---------------------------------------------------------------------------
-- 4. La modération
-- ---------------------------------------------------------------------------

create or replace function public.admin_lister_commentaires_association(
  p_statut public.statut_commentaire default 'en_attente'
)
returns table (
  id uuid,
  texte text,
  statut public.statut_commentaire,
  cree_le timestamptz,
  auteur_nom text,
  auteur_email text,
  content_id uuid,
  contenu_slug text,
  contenu_titre text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    m.id,
    m.texte,
    m.statut,
    m.cree_le,
    -- Un compte anonymisé ne rend ni nom ni adresse. Le cas ne devrait pas se
    -- produire — `anonymize_user` efface les commentaires — mais l'écran ne
    -- doit pas dépendre de cette promesse pour rester correct.
    case when u.statut = 'anonymise' then null else u.nom_complet end,
    case when u.statut = 'anonymise' then null else u.email end,
    m.content_id,
    c.slug,
    t.titre
  from public.association_comments m
  join public.users u on u.id = m.user_id
  join public.association_contents c on c.id = m.content_id
  left join public.association_content_translations t
    on t.content_id = c.id and t.langue = 'fr'
  where m.statut = p_statut
  -- Les plus anciens d'abord : une file de modération se traite dans l'ordre
  -- d'arrivée, sinon les premiers messages attendent indéfiniment.
  order by m.cree_le;
$$;

create or replace function public.admin_moderer_commentaire(
  p_acteur uuid,
  p_commentaire uuid,
  p_decision public.statut_commentaire
)
returns public.association_comments
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_commentaire public.association_comments;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  /*
   * Deux décisions, pas trois. Remettre un message « en attente » le ferait
   * revenir indéfiniment dans la file sans que rien dise pourquoi — c'est
   * l'arbitrage déjà pris pour les avis de lecteurs (0072).
   */
  if p_decision = 'en_attente' then
    raise exception 'Moderer un commentaire, c''est l''approuver ou le masquer.'
      using errcode = 'check_violation';
  end if;

  update public.association_comments
  set statut = p_decision,
      modere_le = public.app_now(),
      modere_par = p_acteur
  where id = p_commentaire
  returning * into v_commentaire;

  if not found then
    raise exception 'Commentaire % introuvable.', p_commentaire using errcode = 'no_data_found';
  end if;

  return v_commentaire;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. L'agenda
-- ---------------------------------------------------------------------------

create or replace function public.admin_lister_evenements(
  p_at timestamptz default public.app_now()
)
returns table (
  id uuid,
  type_evenement public.type_evenement,
  titre text,
  description text,
  debut_le timestamptz,
  lieu text,
  lien text,
  places smallint,
  inscrits bigint,
  publics public.public_association[],
  passe boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    e.id, e.type_evenement, e.titre, e.description, e.debut_le, e.lieu, e.lien,
    e.places,
    (select count(*) from public.association_event_registrations r where r.event_id = e.id),
    e.publics,
    e.debut_le <= p_at
  from public.association_events e
  order by e.debut_le;
$$;

create or replace function public.admin_enregistrer_evenement(
  p_acteur uuid,
  p_id uuid,
  p_type public.type_evenement,
  p_titre text,
  p_debut_le timestamptz,
  p_places smallint,
  p_lieu text default null,
  p_lien text default null,
  p_description text default '',
  p_publics public.public_association[] default '{}'
)
returns public.association_events
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_evenement public.association_events;
  v_inscrits bigint;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if p_id is not null then
    /*
     * On ne descend pas le nombre de places SOUS le nombre d'inscrits.
     * L'écran afficherait « -3 places restantes », ou pire, se tairait — et
     * trois personnes se présenteraient sans place.
     */
    select count(*) into v_inscrits
    from public.association_event_registrations where event_id = p_id;

    if p_places < v_inscrits then
      raise exception 'Deja % inscrit(s) : le nombre de places ne peut pas descendre en dessous.', v_inscrits
        using errcode = 'check_violation';
    end if;

    update public.association_events
    set type_evenement = p_type,
        titre = p_titre,
        debut_le = p_debut_le,
        places = p_places,
        lieu = p_lieu,
        lien = p_lien,
        description = coalesce(p_description, ''),
        publics = p_publics,
        maj_le = public.app_now()
    where id = p_id
    returning * into v_evenement;

    if not found then
      raise exception 'Evenement % introuvable.', p_id using errcode = 'no_data_found';
    end if;
  else
    insert into public.association_events
      (type_evenement, titre, debut_le, places, lieu, lien, description, publics)
    values
      (p_type, p_titre, p_debut_le, p_places, p_lieu, p_lien, coalesce(p_description, ''), p_publics)
    returning * into v_evenement;
  end if;

  return v_evenement;
end;
$$;

create or replace function public.admin_inscrits_evenement(p_event_id uuid)
returns table (nom text, email text, inscrit_le timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    case when u.statut = 'anonymise' then null else u.nom_complet end,
    case when u.statut = 'anonymise' then null else u.email end,
    r.inscrit_le
  from public.association_event_registrations r
  join public.users u on u.id = r.user_id
  where r.event_id = p_event_id
  order by r.inscrit_le;
$$;

-- ---------------------------------------------------------------------------
-- 6. Le mot du mois
-- ---------------------------------------------------------------------------

create or replace function public.admin_lire_mot_du_mois()
returns table (id uuid, texte text, signature text, maj_le timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select w.id, w.texte, w.signature, w.maj_le
  from public.association_words w
  where w.actif;
$$;

/*
 * Enregistrer le mot du mois ARCHIVE le précédent au lieu de l'écraser.
 *
 * Le document demande l'historique « en production » ; il coûte ici une ligne
 * de plus, et il ne se reconstitue pas après coup. Ce qui a été écrasé est
 * perdu, et c'est en général le jour où on le cherche qu'on s'en aperçoit.
 */
create or replace function public.admin_enregistrer_mot_du_mois(
  p_acteur uuid,
  p_texte text,
  p_signature text default null
)
returns public.association_words
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_mot public.association_words;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  update public.association_words set actif = false, maj_le = public.app_now() where actif;

  insert into public.association_words (texte, signature, actif)
  values (
    p_texte,
    coalesce(nullif(btrim(p_signature), ''), 'Le bureau de l''Association DAVE'),
    true
  )
  returning * into v_mot;

  return v_mot;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. La campagne
-- ---------------------------------------------------------------------------

create or replace function public.admin_lire_campagne()
returns table (
  id uuid,
  intitule text,
  objectif_kits integer,
  fin_le date,
  total integer,
  regions jsonb
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    c.id, c.intitule, c.objectif_kits, c.fin_le,
    public.association_campagne_total(c.id),
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('region', r.region, 'kits', r.kits) order by r.region)
        from public.association_campaign_regions r
        where r.campaign_id = c.id
      ),
      '[]'::jsonb
    )
  from public.association_campaigns c
  where c.actif;
$$;

/*
 * Les régions arrivent en BLOC, et le bloc fait foi : une région absente du
 * tableau est retirée. C'est le même contrat que l'enregistrement d'un
 * témoignage (0073), et il a la même raison — sans lui, retirer une région
 * demanderait un second geste que l'écran n'offre pas.
 */
create or replace function public.admin_enregistrer_campagne(
  p_acteur uuid,
  p_id uuid,
  p_intitule text,
  p_objectif_kits integer,
  p_fin_le date default null,
  p_regions jsonb default '[]'::jsonb
)
returns public.association_campaigns
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_campagne public.association_campaigns;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if p_id is not null then
    update public.association_campaigns
    set intitule = p_intitule,
        objectif_kits = p_objectif_kits,
        fin_le = p_fin_le,
        maj_le = public.app_now()
    where id = p_id
    returning * into v_campagne;

    if not found then
      raise exception 'Campagne % introuvable.', p_id using errcode = 'no_data_found';
    end if;
  else
    update public.association_campaigns set actif = false, maj_le = public.app_now() where actif;

    insert into public.association_campaigns (intitule, objectif_kits, fin_le, actif)
    values (p_intitule, p_objectif_kits, p_fin_le, true)
    returning * into v_campagne;
  end if;

  delete from public.association_campaign_regions where campaign_id = v_campagne.id;

  insert into public.association_campaign_regions (campaign_id, region, kits)
  select
    v_campagne.id,
    btrim(ligne->>'region'),
    greatest(0, coalesce((ligne->>'kits')::integer, 0))
  from jsonb_array_elements(coalesce(p_regions, '[]'::jsonb)) ligne
  where length(btrim(coalesce(ligne->>'region', ''))) > 0;

  return v_campagne;
end;
$$;
