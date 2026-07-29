-- 0033 — Une seule implémentation par règle, appelée des deux côtés
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ TROIS FOIS, UNE RÈGLE ÉCRITE EN SQL ET EN TYPESCRIPT A RENDU DES VERDICTS │
-- │ OPPOSÉS. TROIS FOIS, C'EST UN TEST QUI L'A RATTRAPÉE PAR ACCIDENT.        │
-- │                                                                            │
-- │ Cette migration retire deux duplications de plus, dont l'une DIVERGEAIT    │
-- │ déjà en production sans qu'aucun test ne l'ait vue.                        │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A. LONGUEUR D'UNE VERSION — la divergence active
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trois modules répondaient à « combien de pages a cette version ? » :
--
--   * `servirPage`      — une page existe si `book_pages` la porte ;
--   * `reprise_lecture` — borne la reprise sur `count(book_pages)` ;
--   * `enregistrerProgression` — borne l'écriture sur `book_translations.nb_pages`.
--
-- Les deux premiers s'accordent, le troisième non. Sur un titre dont
-- `nb_pages` vaut 12 alors que 6 pages seulement sont rendues, un lecteur
-- pouvait ENREGISTRER la page 10, que le service refusait de servir, et que la
-- reprise ramenait ensuite à 6 — en signalant au passage une « pagination
-- divergente entre langues » alors qu'aucune autre langue n'existait.
--
-- L'utilisateur était donc rembobiné en silence, sur un faux motif.
--
-- LA SOURCE FAIT AUTORITÉ : `book_pages`. `nb_pages` est une métadonnée
-- déclarée à l'ingestion ; `book_pages` est ce qu'on sait réellement servir.
-- Un lecteur ne peut pas atteindre une page qui n'existe pas.

create function public.pages_publiees(p_book_id uuid, p_langue text)
  returns integer
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select count(bp.id)::integer
  from public.book_translations t
  join public.book_pages bp on bp.translation_id = t.id
  where t.book_id = p_book_id
    and t.langue = p_langue
    and t.statut = 'publie';
$$;

comment on function public.pages_publiees(uuid, text) is
  'Nombre de pages RÉELLEMENT servables d''une version publiée. Source unique de la longueur d''une version : `book_pages` fait autorité, `book_translations.nb_pages` n''est qu''une métadonnée déclarée à l''ingestion. Appelée par `reprise_lecture` (SQL) et par le service de progression (TypeScript), pour que les deux ne puissent pas diverger.';

revoke all on function public.pages_publiees(uuid, text) from public, anon;
grant execute on function public.pages_publiees(uuid, text) to authenticated, service_role;

-- `reprise_lecture` recalculait ce compte en interne. Elle l'appelle désormais,
-- pour qu'il n'existe qu'un seul endroit à corriger.
create or replace function public.reprise_lecture(
  p_user_id uuid,
  p_book_id uuid,
  p_langue text
)
  returns table (page integer, langue_origine text, borne_appliquee boolean)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with pages as (
    select public.pages_publiees(p_book_id, p_langue) as nb
  ),
  -- La progression de la langue demandée, si elle existe.
  propre as (
    select rp.derniere_page, rp.langue
    from public.reading_progress rp
    where rp.user_id = p_user_id and rp.book_id = p_book_id and rp.langue = p_langue
  ),
  -- À défaut, la plus récente d'une AUTRE langue du même livre.
  repli as (
    select rp.derniere_page, rp.langue
    from public.reading_progress rp
    where rp.user_id = p_user_id and rp.book_id = p_book_id and rp.langue <> p_langue
    order by rp.maj_le desc
    limit 1
  ),
  retenue as (
    select * from propre
    union all
    select * from repli where not exists (select 1 from propre)
    limit 1
  )
  select
    least(coalesce(r.derniere_page, 1), greatest((select nb from pages), 1)) as page,
    r.langue as langue_origine,
    coalesce(r.derniere_page, 1) > (select nb from pages) as borne_appliquee
  from retenue r
  union all
  select 1, null::text, false
  where not exists (select 1 from retenue)
  limit 1;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- B. FENÊTRE DE VENTE DE 3 MOIS — la duplication dormante
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La règle « un titre n'entre dans l'abonnement qu'une fois sa fenêtre de
-- vente écoulée » (§3.2) était écrite DEUX FOIS, en SQL les deux fois — ce qui
-- la rendait invisible au test qui surveille les réimplémentations en
-- TypeScript :
--
--   * `access_for`   (0016) — décide si un abonné peut ouvrir le titre ;
--   * `catalog_list` (0028) — décide si le titre s'affiche sous le filtre
--                             « accessible par abonnement ».
--
-- Elles s'accordent aujourd'hui. Rien ne les y oblige : corriger un `<=` en
-- `<` d'un seul côté suffirait à afficher au catalogue un titre que l'accès
-- refuse ensuite — un abonné à qui l'on montre une porte fermée.

create function public.fenetre_de_vente_ecoulee(
  p_publie_le timestamptz,
  p_fenetre_jours integer,
  p_at timestamptz
)
  returns boolean
  language sql
  immutable
  parallel safe
as $$
  -- Un titre jamais publié n'a pas commencé sa fenêtre : elle ne peut pas être
  -- écoulée. `null` ne doit surtout pas se propager en `null` ici, où il serait
  -- traité comme « faux » par les uns et ferait échouer un `and` chez les autres.
  select p_publie_le is not null
     and p_publie_le + make_interval(days => p_fenetre_jours) <= p_at;
$$;

comment on function public.fenetre_de_vente_ecoulee(timestamptz, integer, timestamptz) is
  'Fenêtre de vente exclusive écoulée ? (§3.2) Source unique, appelée par `access_for` et par `catalog_list` : la règle décidait auparavant deux fois, et rien ne garantissait qu''elle décide pareil.';

grant execute on function public.fenetre_de_vente_ecoulee(timestamptz, integer, timestamptz)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Les deux appelantes, reprises VERBATIM de 0016 et 0028 : seule la ligne du
-- prédicat change. Recopier la fonction entière est le prix à payer pour ne
-- pas toucher à une migration déjà appliquée.
-- ---------------------------------------------------------------------------

create or replace function public.access_for_books(
  p_user uuid,
  p_books uuid[],
  p_at timestamptz default public.app_now()
)
  returns table (
    book_id uuid,
    can_read boolean,
    can_download boolean,
    reason public.access_reason
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with parametres as (
    select fenetre_nouveaute_jours, periode_grace_jours from public.business_settings where id = 1
  ),
  appelant as (
    select p_user is not null and public.is_admin(p_user) as est_admin
  ),
  -- Un abonnement ouvre le droit dans quatre situations, et quatre seulement.
  abonnement as (
    select exists (
      select 1
      from public.subscriptions s, parametres p
      where p_user is not null
        and s.user_id = p_user
        and (
          -- Essai en cours ou abonnement actif, période non échue.
          (s.statut in ('essai', 'actif') and s.fin_periode > p_at)
          -- Annulé : l'accès est maintenu jusqu'à la fin de la période PAYÉE.
          or (s.statut = 'annule' and s.fin_periode > p_at)
          -- Impayé : l'accès est maintenu pendant la période de grâce, même si
          -- la période d'abonnement est déjà échue.
          or (
            s.statut = 'impaye'
            and s.impaye_depuis is not null
            and s.impaye_depuis + make_interval(days => p.periode_grace_jours) > p_at
          )
        )
    ) as ouvre_droit
  ),
  demandes as (
    select distinct b.id, b.statut, b.gratuit, b.inclus_abonnement, b.publie_le
    from unnest(p_books) as demande(id)
    join public.books b on b.id = demande.id
  ),
  droits as (
    select
      e.book_id,
      bool_or(e.type = 'achat') as a_achat,
      bool_or(e.type = 'offert') as a_octroi,
      bool_or(e.peut_telecharger) as peut_telecharger
    from public.entitlements e
    where p_user is not null
      and e.user_id = p_user
      and e.book_id = any (p_books)
      and (e.expire_le is null or e.expire_le > p_at)
    group by e.book_id
  ),
  calcul as (
    select
      d.id as book_id,
      a.est_admin,
      coalesce(dr.a_achat, false) as a_achat,
      coalesce(dr.a_octroi, false) as a_octroi,
      coalesce(dr.peut_telecharger, false) as peut_telecharger,
      -- Un titre en brouillon n'a jamais été vendu : il n'existe pas pour le
      -- public. Un titre ARCHIVÉ, lui, a pu être acheté — et §3.1 promet à
      -- l'acheteur un accès « sans limite de durée ». L'archivage le retire du
      -- catalogue et de l'abonnement, il ne révoque pas un droit payé.
      (d.statut = 'publie') as au_catalogue,
      (d.statut in ('publie', 'archive')) as exploitable,
      d.gratuit,
      (
        ab.ouvre_droit
        and d.inclus_abonnement
        and d.statut = 'publie'
        -- Fenêtre de vente exclusive (§3.2), décidée par la SEULE
        -- implémentation de la règle. `catalog_list` appelle la même.
        and public.fenetre_de_vente_ecoulee(d.publie_le, pa.fenetre_nouveaute_jours, p_at)
      ) as par_abonnement
    from demandes d
    cross join appelant a
    cross join abonnement ab
    cross join parametres pa
    left join droits dr on dr.book_id = d.id
  )
  select
    c.book_id,
    -- OU LOGIQUE entre toutes les sources. L'ordre est sans importance.
    (
      c.est_admin
      or ((c.a_achat or c.a_octroi) and c.exploitable)
      or (c.gratuit and c.au_catalogue)
      or c.par_abonnement
    ) as can_read,
    -- INDÉPENDANT de `reason`, et jamais accordé par un abonnement ni par
    -- `gratuit`. C'est la règle métier la plus sensible du projet.
    (c.est_admin or (c.peut_telecharger and c.exploitable)) as can_download,
    -- Le titre LE PLUS FORT détenu.
    (case
      when c.a_achat and c.exploitable then 'purchase'
      when (c.a_octroi and c.exploitable) or c.est_admin then 'granted'
      when c.par_abonnement then 'subscription'
      when c.gratuit and c.au_catalogue then 'free'
      when c.au_catalogue then 'preview'
      else 'none'
    end)::public.access_reason as reason
  from calcul c;
$$;

create or replace function public.catalog_list(
  p_langue text default 'fr',
  p_recherche text default null,
  p_age_min smallint default null,
  p_age_max smallint default null,
  p_themes text[] default null,
  p_origine text default null,
  p_acces text default null,
  p_zone public.price_zone default 'international',
  p_tri text default 'nouveautes',
  p_page integer default 1,
  p_taille integer default 20,
  p_at timestamptz default public.app_now()
)
  returns table (
    book_id uuid,
    slug text,
    auteur text,
    illustrateur text,
    age_min smallint,
    age_max smallint,
    origine_culturelle text,
    themes text[],
    couverture_url text,
    inclus_abonnement boolean,
    disponible_achat boolean,
    gratuit boolean,
    publie_le timestamptz,
    titre text,
    resume text,
    nb_pages integer,
    langues text[],
    montant bigint,
    devise text,
    zone_prix public.price_zone,
    score_popularite bigint,
    total bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with requete as (
    select case when nullif(btrim(coalesce(p_recherche, '')), '') is null then null
                else websearch_to_tsquery('french', p_recherche) end as tsq
  ),
  parametres as (
    select fenetre_nouveaute_jours as fenetre from public.business_settings where id = 1
  ),
  -- AUCUN REPLI DE ZONE : la zone demandée, ou aucun prix.
  --
  -- Annoncer « 4,99 € » à un visiteur de la zone Afrique parce que le titre n'a
  -- pas de prix local serait une substitution silencieuse de devise — et le
  -- panier refuserait ensuite ce même titre, la tarification n'admettant plus
  -- ce repli. Le titre reste LISTÉ, simplement sans montant : il peut être
  -- lisible par abonnement.
  prix as (
    select p.book_id, p.montant, p.devise, p.zone as zone_prix
    from public.book_prices p
    where p.zone = p_zone
  ),
  base as (
    select
      b.id,
      b.slug,
      b.auteur,
      b.illustrateur,
      b.age_min,
      b.age_max,
      b.origine_culturelle,
      b.themes,
      b.couverture_url,
      b.inclus_abonnement,
      b.disponible_achat,
      b.gratuit,
      b.publie_le,
      t.titre,
      t.resume,
      t.nb_pages,
      array(
        select t2.langue from public.book_translations t2
        where t2.book_id = b.id and t2.statut = 'publie' order by t2.langue
      ) as langues,
      pr.montant,
      pr.devise,
      pr.zone_prix,
      pop.score as score_popularite,
      -- Pertinence : nulle en l'absence de recherche, pour que le tri demandé
      -- s'applique tel quel.
      case when r.tsq is null then 0
           else ts_rank(b.recherche, r.tsq) + ts_rank(t.recherche, r.tsq) end as pertinence
    from public.books b
    join public.book_translations t
      on t.book_id = b.id and t.langue = p_langue and t.statut = 'publie'
    left join prix pr on pr.book_id = b.id
    left join public.book_popularity pop on pop.book_id = b.id
    cross join requete r
    cross join parametres pa
    where b.statut = 'publie'
      -- Brouillons et titres archivés ne sortent JAMAIS du catalogue public.
      and (r.tsq is null or b.recherche @@ r.tsq or t.recherche @@ r.tsq)
      and (p_age_min is null or b.age_max is null or b.age_max >= p_age_min)
      and (p_age_max is null or b.age_min is null or b.age_min <= p_age_max)
      and (p_themes is null or b.themes && p_themes)
      and (p_origine is null or b.origine_culturelle ilike '%' || p_origine || '%')
      and (
        p_acces is null
        or (p_acces = 'gratuit' and b.gratuit)
        or (p_acces = 'achat' and b.disponible_achat)
        or (
          p_acces = 'abonnement'
          and b.inclus_abonnement
          -- « Accessible par abonnement » signifie accessible MAINTENANT :
          -- un titre encore dans sa fenêtre de vente ne l'est pas. Même
          -- implémentation que `access_for_books`, pour que le catalogue ne
          -- puisse pas montrer une porte que l'accès refuse d'ouvrir.
          and public.fenetre_de_vente_ecoulee(b.publie_le, pa.fenetre, p_at)
        )
      )
  ),
  compte as (select count(*) as total from base)
  select
    base.id,
    base.slug,
    base.auteur,
    base.illustrateur,
    base.age_min,
    base.age_max,
    base.origine_culturelle,
    base.themes,
    base.couverture_url,
    base.inclus_abonnement,
    base.disponible_achat,
    base.gratuit,
    base.publie_le,
    base.titre,
    base.resume,
    base.nb_pages,
    base.langues,
    base.montant,
    base.devise,
    base.zone_prix,
    base.score_popularite,
    compte.total
  from base cross join compte
  order by
    case when p_tri = 'pertinence' then base.pertinence end desc nulls last,
    case when p_tri = 'nouveautes' then base.publie_le end desc nulls last,
    case when p_tri = 'popularite' then base.score_popularite end desc nulls last,
    case when p_tri = 'prix' then base.montant end asc nulls last,
    case when p_tri = 'alphabetique' then base.titre end asc nulls last,
    -- Départage stable : sans lui, deux titres de même rang pourraient
    -- s'échanger d'une page à l'autre et apparaître en double.
    base.titre asc,
    base.id asc
  offset greatest(p_page - 1, 0) * p_taille
  limit p_taille;
$$;

