-- ═══════════════════════════════════════════════════════════════════════════
-- LA BIBLIOTHÈQUE REND LES THÈMES, PLUS LA RÉGION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dernière conséquence de la migration 0071. `library_for_user` rendait
-- `region`, et l'écran « Ma bibliothèque » s'en servait pour une seule chose :
-- colorer le substitut de couverture des titres sans image.
--
-- Depuis la 0071, cette couleur se choisit sur le premier THÈME du titre —
-- `teinteDepuisThemes`, dans `src/components/motif/teinte.ts`. Continuer à
-- rendre `region` laisserait la fonction porter une colonne que plus personne
-- ne lit, et ne porter aucune de celles dont l'écran a besoin.
--
-- `drop` puis `create` : changer une colonne de sortie est un changement de
-- TYPE DE RETOUR, et `create or replace` le refuse. Même contrainte que celle
-- qu'avait rencontrée la migration 0051, pour la même fonction.
--
-- Le corps est repris VERBATIM de la migration 0051. Deux modifications, et
-- deux seulement : `region public.region_conte` devient `themes text[]` dans
-- la déclaration, et `b.region` devient `b.themes` dans la projection.

drop function if exists public.library_for_user(uuid, text, timestamptz);

create function public.library_for_user(
  p_user uuid,
  p_langue text default 'fr',
  p_at timestamptz default public.app_now()
)
  returns table (
    book_id uuid,
    slug text,
    titre text,
    themes text[],
    couverture_jeton text,
    langues text[],
    source text,
    peut_telecharger boolean,
    accorde_le timestamptz,
    expire_le timestamptz,
    derniere_page integer,
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
    b.themes,
    b.couverture_jeton,
    coalesce(
      (select array_agg(bt.langue order by bt.langue)
         from public.book_translations bt
        where bt.book_id = b.id and bt.statut = 'publie'),
      '{}'::text[]
    ),
    -- LA CORRECTION : aucune ligne de droit, aucune source. Le `null` est ce
    -- qui distingue « je possede ce titre » de « j'ai commence ce titre ».
    case
      when d.book_id is null then null
      when d.force = 2 then 'achat'
      else 'offert'
    end,
    coalesce(d.peut_telecharger, false),
    d.accorde_le,
    d.expire_le,
    l.derniere_page,
    l.langue,
    l.maj_le
  from public.books b
  left join droits d on d.book_id = b.id
  left join lecture l on l.book_id = b.id
  left join public.book_translations t
    on t.book_id = b.id and t.langue = p_langue and t.statut = 'publie'
  where (d.book_id is not null or l.book_id is not null)
    and b.statut <> 'brouillon'
  order by coalesce(l.maj_le, d.accorde_le) desc nulls last, b.slug;
$fn$;

comment on function public.library_for_user(uuid, text, timestamptz) is
  'Bibliotheque personnelle : titres possedes et titres commences (§4.2 F6). Rend les THEMES depuis le 3 septembre 2026 — c''est sur eux que se choisit la teinte d''un titre sans couverture, la region ayant quitte le catalogue public avec la migration 0071.';

revoke all on function public.library_for_user(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.library_for_user(uuid, text, timestamptz) to service_role;
