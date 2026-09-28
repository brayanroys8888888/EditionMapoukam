-- ---------------------------------------------------------------------------
-- L'ASSOCIATION DAVE — la campagne en cours et le mot du mois.
--
-- Deux contenus que l'équipe écrit et que l'adhérent lit en tête de son
-- espace. Ils ont en commun d'être UNIQUES à un instant donné, et de garder
-- leur histoire.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Le mot du mois
-- ---------------------------------------------------------------------------

create table public.association_words (
  id uuid primary key default gen_random_uuid(),
  texte text not null check (length(btrim(texte)) between 1 and 2000),
  signature text not null default 'Le bureau de l''Association DAVE',

  /*
   * Un seul mot AFFICHÉ à la fois, et tous les précédents conservés.
   *
   * Le document demande l'historique « en production » ; il est là dès le
   * premier jour, parce qu'un historique ne se reconstitue pas après coup —
   * ce qui a été écrasé est perdu.
   */
  actif boolean not null default false,

  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now()
);

/*
 * L'index partiel porte l'unicité. Même motif que `vedette` sur les contenus :
 * la base refuse le second, plutôt qu'un écran qui penserait à décocher le
 * premier — et qui l'oublierait un jour.
 */
create unique index association_words_un_seul_actif
  on public.association_words ((true)) where actif;

comment on table public.association_words is
  'Le mot du mois du bureau. Un seul actif à la fois, garanti par un index partiel ; les précédents sont conservés.';

-- ---------------------------------------------------------------------------
-- La campagne
-- ---------------------------------------------------------------------------

create table public.association_campaigns (
  id uuid primary key default gen_random_uuid(),
  intitule text not null check (length(btrim(intitule)) > 0),
  objectif_kits integer not null check (objectif_kits > 0),
  fin_le date,

  actif boolean not null default false,

  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now()
);

create unique index association_campaigns_une_seule_active
  on public.association_campaigns ((true)) where actif;

create table public.association_campaign_regions (
  campaign_id uuid not null references public.association_campaigns (id) on delete cascade,

  /*
   * La région est du TEXTE, pas une énumération.
   *
   * Le document demande de pouvoir « ajouter de nouvelles régions ». Une
   * énumération obligerait à une migration pour chacune — donc à un
   * développeur pour une décision qui appartient à l'association. Le prix est
   * qu'« Ouest » et « ouest » seraient deux régions : la contrainte
   * d'unicité porte donc sur la forme normalisée.
   */
  region text not null check (length(btrim(region)) > 0),
  kits integer not null default 0 check (kits >= 0),

  primary key (campaign_id, region)
);

create unique index association_campaign_regions_sans_doublon
  on public.association_campaign_regions (campaign_id, lower(btrim(region)));

comment on table public.association_campaign_regions is
  'Les kits distribués, région par région. Le TOTAL ne se stocke pas : il se somme, sinon il finirait par ne plus correspondre à ses parts.';

-- ---------------------------------------------------------------------------
-- RLS — lisibles par les adhérents, écrites par l'administration seule
-- ---------------------------------------------------------------------------

alter table public.association_words enable row level security;
alter table public.association_campaigns enable row level security;
alter table public.association_campaign_regions enable row level security;

/*
 * Seul le mot ACTIF est lisible. Les précédents sont une archive de
 * l'association, pas un contenu de l'espace : les servir ferait de chaque
 * brouillon abandonné une page publique.
 */
create policy association_mot_lecture on public.association_words
  for select to authenticated
  using (actif and public.abonnement_ouvre_droit(auth.uid(), 'association'));

create policy association_campagne_lecture on public.association_campaigns
  for select to authenticated
  using (actif and public.abonnement_ouvre_droit(auth.uid(), 'association'));

create policy association_campagne_regions_lecture on public.association_campaign_regions
  for select to authenticated
  using (
    exists (
      select 1 from public.association_campaigns c
      where c.id = association_campaign_regions.campaign_id
        and c.actif
    )
    and public.abonnement_ouvre_droit(auth.uid(), 'association')
  );

/*
 * Aucune politique d'écriture : l'administration passe par `service_role`,
 * qui contourne RLS par construction, et par des fonctions `admin_*` qui
 * revérifient le rôle en base. Une politique d'écriture ici ouvrirait un
 * second chemin, qu'il faudrait tenir d'accord avec le premier.
 */

grant select (id, texte, signature, cree_le) on public.association_words to authenticated;
grant select (id, intitule, objectif_kits, fin_le) on public.association_campaigns to authenticated;
grant select on public.association_campaign_regions to authenticated;

-- ---------------------------------------------------------------------------
-- Le total d'une campagne — sommé, jamais stocké
-- ---------------------------------------------------------------------------

create or replace function public.association_campagne_total(p_campaign_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(sum(kits), 0)::integer
  from public.association_campaign_regions
  where campaign_id = p_campaign_id;
$$;

grant execute on function public.association_campagne_total(uuid) to authenticated;

comment on function public.association_campagne_total(uuid) is
  'La somme des kits par région. Un total stocké à côté de ses parts finit toujours par les contredire, et c''est le total qu''on croit.';
