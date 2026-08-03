-- ---------------------------------------------------------------------------
-- Correction : un titre SEULEMENT LU n'est pas un titre POSSEDE
--
-- +--------------------------------------------------------------------------+
-- | LE DEFAUT, ET IL ETAIT SERIEUX.                                          |
-- |                                                                          |
-- | `case when d.force = 2 then 'achat' else 'offert' end` rendait 'offert'  |
-- | meme quand la jointure sur `entitlements` n'avait RIEN trouve : `d.force`|
-- | valant NULL, le `else` s'appliquait.                                     |
-- |                                                                          |
-- | Consequence : un titre simplement COMMENCE — par un abonne, ou par un    |
-- | ancien abonne — s'affichait dans « Mes achats ». L'interface aurait      |
-- | propose de telecharger un fichier auquel l'utilisateur n'a aucun droit,  |
-- | et le service de telechargement l'aurait refuse. Promettre puis refuser  |
-- | est pire que refuser.                                                    |
-- |                                                                          |
-- | Attrape par le test qui verifie la SEPARATION des deux sections, et non  |
-- | par celui qui verifie que la bibliotheque rend quelque chose. Un test    |
-- | qui se contente de constater une presence ne voit pas une presence DE    |
-- | TROP.                                                                    |
-- +--------------------------------------------------------------------------+
--
-- +--------------------------------------------------------------------------+
-- | SECOND DEFAUT, TROUVE EN CORRIGEANT LE PREMIER.                          |
-- |                                                                          |
-- | La migration 0050 nommait la colonne de sortie `page_reprise`, quand la  |
-- | route lisait `derniere_page`. La valeur arrivait donc TOUJOURS a         |
-- | `undefined`, et la reprise de lecture n'aurait jamais fonctionne — sans  |
-- | erreur, sans trace, juste une page de reprise absente.                   |
-- |                                                                          |
-- | Le nom de sortie s'aligne desormais sur celui de la colonne source. Un   |
-- | renommage de parametre de sortie etant un changement de TYPE DE RETOUR,  |
-- | `create or replace` le refuse : il faut `drop` puis `create`. Meme       |
-- | contrainte que `stats_langues` a l'etape 14.                             |
-- +--------------------------------------------------------------------------+
-- ---------------------------------------------------------------------------

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
    region public.region_conte,
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
    b.region,
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
