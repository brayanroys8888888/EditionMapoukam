-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0093 — UN CODE PROMOTIONNEL PEUT ÊTRE PROGRAMMÉ.                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ C'EST UNE RÈGLE MÉTIER NOUVELLE, ET ELLE EST LE MIROIR D'UNE ANCIENNE.  │
-- │                                                                          │
-- │ `expire_le` existe depuis l'origine : passée cette date, le code est     │
-- │ refusé. `debut_le` est la même chose par l'autre bout — avant cette      │
-- │ date, le code est refusé aussi. La comparaison est STRICTE des deux      │
-- │ côtés : un code qui commence à 12 h 00 est accepté à 12 h 00, un code    │
-- │ qui expire à 12 h 00 est refusé à 12 h 00.                               │
-- │                                                                          │
-- │ Le prototype d'administration du 17 septembre 2026 affiche un statut     │
-- │ « Programmé », qui n'a de sens qu'avec une date de début. Sans elle, ce  │
-- │ segment de filtre serait vide pour toujours.                             │
-- │                                                                          │
-- │ Nulle = « depuis toujours ». C'est le comportement d'aujourd'hui, et     │
-- │ tous les codes existants la gardent : la migration n'en programme aucun  │
-- │ rétroactivement.                                                         │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE QUE CETTE MIGRATION N'AJOUTE PAS, ET POURQUOI.                       │
-- │                                                                          │
-- │ Le prototype veut aussi une PORTÉE (« s'applique à » : contes, livrets,  │
-- │ abonnement, adhésion), une limite PAR CLIENT, et une option « première   │
-- │ commande uniquement ». Ces trois-là ne sont pas des champs d'affichage : │
-- │ elles changent ce qu'un code COUVRE, donc le calcul de la remise, donc   │
-- │ ce qui est facturé. `docs/cahier-des-charges.md` ne les porte pas.       │
-- │                                                                          │
-- │ CLAUDE.md : « N'invente pas de règle métier absente de la               │
-- │ spécification. » Elles attendent une décision du propriétaire.           │
-- └──────────────────────────────────────────────────────────────────────────┘

alter table public.promo_codes
  add column debut_le timestamptz;

comment on column public.promo_codes.debut_le is
  'Instant à partir duquel le code est acceptable. Nul : depuis toujours. Miroir de expire_le, comparaison stricte des deux côtés.';

/*
 * Une fenêtre à l'endroit, ou pas de fenêtre du tout.
 *
 * `debut_le >= expire_le` décrit un code qui n'est jamais valable : ce n'est
 * pas une programmation, c'est une faute de saisie. La refuser en base plutôt
 * qu'à l'écran vaut pour toutes les portes d'entrée, y compris celles qu'on
 * n'a pas encore écrites.
 */
alter table public.promo_codes
  add constraint promo_codes_fenetre_a_l_endroit
    check (debut_le is null or expire_le is null or debut_le < expire_le);

-- ══════════════════════════════════════════════════════════════════════════
-- Le STATUT d'un code, calculé une seule fois.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ QUATRE ÉTATS, ET L'ORDRE DES QUESTIONS COMPTE.                          │
-- │                                                                          │
-- │ Un code désactivé à la main est INACTIF, quoi qu'en disent ses dates —   │
-- │ c'est une décision humaine, et elle prime. Ensuite viennent les faits :  │
-- │ pas encore commencé, déjà fini, déjà épuisé. Sinon, il est actif.        │
-- │                                                                          │
-- │ « Épuisé » est demandé APRÈS « expiré » : un code à la fois épuisé et    │
-- │ expiré est dit expiré, parce que c'est la raison qui ne se répare pas —  │
-- │ relever le plafond d'un code expiré ne le rendrait pas acceptable.       │
-- │                                                                          │
-- │ La fonction est l'UNIQUE implémentation : la liste l'appelle, les        │
-- │ compteurs de segments l'appellent, et le filtre l'appelle. Trois         │
-- │ `case when` recopiés auraient fini par compter autre chose que ce que la │
-- │ liste montre.                                                            │
-- └──────────────────────────────────────────────────────────────────────────┘

create type public.statut_promo as enum ('inactif', 'programme', 'expire', 'epuise', 'actif');

create function public.statut_promo(
  p_actif boolean,
  p_debut_le timestamptz,
  p_expire_le timestamptz,
  p_usage_max integer,
  p_usage_count integer,
  p_at timestamptz default public.app_now()
) returns public.statut_promo
language sql
immutable
as $$
  select case
    when not p_actif then 'inactif'::public.statut_promo
    when p_debut_le is not null and p_at < p_debut_le then 'programme'::public.statut_promo
    when p_expire_le is not null and p_expire_le <= p_at then 'expire'::public.statut_promo
    when p_usage_max is not null and p_usage_count >= p_usage_max
      then 'epuise'::public.statut_promo
    else 'actif'::public.statut_promo
  end;
$$;

comment on function public.statut_promo(boolean, timestamptz, timestamptz, integer, integer, timestamptz) is
  'Statut affiché d''un code promotionnel. Unique implémentation : la liste, les compteurs et le filtre l''appellent. Les bornes sont celles de calculerRemise — début inclusif, expiration exclusive.';

grant execute on function public.statut_promo(boolean, timestamptz, timestamptz, integer, integer, timestamptz)
  to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- La liste.
-- ══════════════════════════════════════════════════════════════════════════

drop function public.admin_lister_promos(integer, integer);

create function public.admin_lister_promos(
  p_page integer default 1,
  p_taille integer default 25,
  p_statut text default null,
  p_recherche text default null
) returns table (
  id uuid,
  code text,
  type public.promo_type,
  valeur bigint,
  devise text,
  zone public.price_zone,
  debut_le timestamptz,
  expire_le timestamptz,
  actif boolean,
  usage_max integer,
  usage_count integer,
  statut public.statut_promo,
  total_lignes bigint
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with base as (
    select p.*,
           public.statut_promo(p.actif, p.debut_le, p.expire_le, p.usage_max, p.usage_count,
                               public.app_now()) as etat
    from public.promo_codes p
    where (p_recherche is null
           or length(btrim(p_recherche)) = 0
           or p.code ilike '%' || btrim(p_recherche) || '%')
  ),
  filtre as (
    select * from base where p_statut is null or base.etat::text = p_statut
  ),
  compte as (select count(*) as total from filtre)
  select
    filtre.id, filtre.code, filtre.type, filtre.valeur, filtre.devise, filtre.zone,
    filtre.debut_le, filtre.expire_le, filtre.actif, filtre.usage_max, filtre.usage_count,
    filtre.etat,
    compte.total
  from filtre cross join compte
  /*
   * Les codes ACTIFS en premier, puis les programmés, puis le reste : c'est
   * l'ordre de l'énumération, et c'est celui de l'attention. Un code épuisé
   * n'appelle rien ; un code actif peut encore coûter de l'argent.
   */
  order by filtre.etat desc, filtre.cree_le desc, filtre.id
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

comment on function public.admin_lister_promos(integer, integer, text, text) is
  'Liste paginée des codes promotionnels avec leur statut calculé, pour l''administration.';

revoke all on function public.admin_lister_promos(integer, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_lister_promos(integer, integer, text, text) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- Les compteurs de segments.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Même contrat que les commandes (0090) et les abonnements (0092) : la
-- recherche s'applique, jamais le statut lui-même ; tous les statuts sortent,
-- y compris à zéro ; le prédicat est le même que celui de la liste.

create function public.admin_compter_promos_par_statut(
  p_recherche text default null
) returns table (statut public.statut_promo, nb bigint)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with retenus as (
    select public.statut_promo(p.actif, p.debut_le, p.expire_le, p.usage_max, p.usage_count,
                               public.app_now()) as etat
    from public.promo_codes p
    where (p_recherche is null
           or length(btrim(p_recherche)) = 0
           or p.code ilike '%' || btrim(p_recherche) || '%')
  )
  select valeur.statut, count(retenus.etat)
  from unnest(enum_range(null::public.statut_promo)) as valeur(statut)
  left join retenus on retenus.etat = valeur.statut
  group by valeur.statut
  order by valeur.statut;
$$;

comment on function public.admin_compter_promos_par_statut(text) is
  'Nombre de codes promotionnels par statut, pour les compteurs des segments. Suit la recherche, jamais le statut. Rend les cinq statuts, y compris à zéro.';

revoke all on function public.admin_compter_promos_par_statut(text)
  from public, anon, authenticated;
grant execute on function public.admin_compter_promos_par_statut(text) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- L'enregistrement, avec la date de début.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CORPS REPRIS VERBATIM, AU NOUVEAU CHAMP PRÈS.                           │
-- │                                                                          │
-- │ Cette fonction porte trois choses qu'on ne voit pas dans sa signature :  │
-- │ le refus d'un code à montant fixe sans devise NI zone, l'upsert sur le   │
-- │ code — c'est ce qui permet de RÉÉCRIRE un code existant — et un retour   │
-- │ de la ligne entière, pas d'un identifiant.                               │
-- │                                                                          │
-- │ Les réécrire de mémoire aurait perdu les trois. Le corps est donc copié  │
-- │ tel quel, et `debut_le` s'y insère aux quatre endroits qui le demandent. │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Le nouveau paramètre est AJOUTÉ EN FIN, avec un défaut : les appels
-- existants restent valables et créent un code sans date de début,
-- c'est-à-dire exactement ce qu'ils créaient avant.

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `drop` PUIS `create`, ET NON `create or replace`.                       │
 * │                                                                          │
 * │ Un paramètre de plus fait une SIGNATURE différente : `create or replace` │
 * │ n'aurait rien remplacé, il aurait créé une SURCHARGE. Les deux           │
 * │ fonctions auraient alors coexisté, et un appel à quatre arguments serait │
 * │ devenu ambigu — « function is not unique », sur un chemin qui marchait   │
 * │ la veille.                                                               │
 * │                                                                          │
 * │ C'est le piège que la migration 0088 avait déjà consigné pour            │
 * │ `create_order`. Il s'est reproduit ici, et le test l'a attrapé.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
drop function public.admin_enregistrer_promo(
  uuid, text, public.promo_type, bigint, text, public.price_zone, timestamptz, integer, boolean
);

create function public.admin_enregistrer_promo(
  p_acteur uuid,
  p_code text,
  p_type public.promo_type,
  p_valeur bigint,
  p_devise text default null,
  p_zone public.price_zone default null,
  p_expire_le timestamptz default null,
  p_usage_max integer default null,
  p_actif boolean default true,
  p_debut_le timestamptz default null
) returns public.promo_codes
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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

  insert into public.promo_codes
    (code, type, valeur, devise, zone, debut_le, expire_le, usage_max, actif)
  values (upper(btrim(p_code)), p_type, p_valeur,
          case when p_type = 'montant' then p_devise end,
          case when p_type = 'montant' then p_zone end,
          p_debut_le, p_expire_le, p_usage_max, p_actif)
  on conflict (code) do update
    set type = excluded.type,
        valeur = excluded.valeur,
        devise = excluded.devise,
        zone = excluded.zone,
        debut_le = excluded.debut_le,
        expire_le = excluded.expire_le,
        usage_max = excluded.usage_max,
        actif = excluded.actif
  returning * into v_promo;

  return v_promo;
end;
$$;

comment on function public.admin_enregistrer_promo(uuid, text, public.promo_type, bigint, text, public.price_zone, timestamptz, integer, boolean, timestamptz) is
  'Crée ou réécrit un code promotionnel depuis l''administration, avec sa fenêtre de validité. L''acteur est posé pour l''audit avant l''écriture.';

revoke all on function public.admin_enregistrer_promo(uuid, text, public.promo_type, bigint, text, public.price_zone, timestamptz, integer, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_enregistrer_promo(uuid, text, public.promo_type, bigint, text, public.price_zone, timestamptz, integer, boolean, timestamptz)
  to service_role;
