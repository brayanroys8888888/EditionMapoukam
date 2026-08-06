-- ═══════════════════════════════════════════════════════════════════════════
-- PUBLICATION : LES TRADUCTIONS SUIVENT LE TITRE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE DÉFAUT QUI A MOTIVÉ CETTE MIGRATION.                                 │
-- │                                                                          │
-- │ `admin_changer_publication` (migration 0036) ne touchait QUE la colonne  │
-- │ `books.statut`. La colonne `book_translations.statut` restait à          │
-- │ `'brouillon'` — sa valeur d'ingestion.                                   │
-- │                                                                          │
-- │ Or `catalog_list` (migration 0053) joint les deux tables avec un filtre  │
-- │ sur chacune :                                                            │
-- │                                                                          │
-- │   `join book_translations t … and t.statut = 'publie'`                   │
-- │   `where b.statut = 'publie'`                                            │
-- │                                                                          │
-- │ Un titre pouvait donc être « publié » dans le back-office — pastille     │
-- │ verte, aucun manque — et INVISIBLE au catalogue. L'éditeur avait tout    │
-- │ rempli, tout validé, et le conte n'apparaissait pas. C'est exactement    │
-- │ le signalement à l'origine de cette correction.                          │
-- │                                                                          │
-- │ La traduction N'AVAIT AUCUN CHEMIN VERS 'publie'. L'ingestion la crée    │
-- │ en brouillon (pipeline.ts ligne 370), `admin_modifier_traduction` ne     │
-- │ touche que le titre et le résumé, et `admin_changer_publication` ne      │
-- │ s'occupait que du livre parent.                                          │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI PUBLIER TOUTES LES TRADUCTIONS EN BROUILLON, ET NON UNE SEULE. │
-- │                                                                          │
-- │ Le jeu de données porte un cas de traduction volontairement en           │
-- │ brouillon : la version anglaise de « la-girafe-et-l-oiseau-malin ».     │
-- │ Mais ce cas suppose un titre DÉJÀ publié, auquel on AJOUTE une version  │
-- │ pas encore prête — ajoutée après coup par `ajouterVersionConte`.         │
-- │                                                                          │
-- │ Quand on PUBLIE un titre pour la première fois, toutes ses traductions   │
-- │ existantes sont issues de la même ingestion, et elles sont toutes        │
-- │ prêtes. Les exclure du catalogue n'aurait aucun sens, et obligerait      │
-- │ l'éditeur à trouver un mécanisme qui n'existe pas pour les libérer.      │
-- │                                                                          │
-- │ En revanche, une traduction ajoutée APRÈS publication peut légitimement  │
-- │ rester en brouillon — et elle le reste, puisqu'on ne repasse pas par     │
-- │ cette fonction pour l'ajouter.                                           │
-- └──────────────────────────────────────────────────────────────────────────┘

drop function if exists public.admin_changer_publication(uuid, uuid[], public.book_status);

create function public.admin_changer_publication(
  p_acteur uuid,
  p_book_ids uuid[],
  p_statut public.book_status
)
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
  v_deja_une_publiee boolean;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if p_book_ids is null or cardinality(p_book_ids) = 0 then
    raise exception 'Aucun titre designe.' using errcode = 'check_violation';
  end if;

  if cardinality(p_book_ids) > 100 then
    raise exception 'Action groupee limitee a 100 titres.' using errcode = 'check_violation';
  end if;

  foreach v_id in array p_book_ids loop
    -- Vérifie si le titre avait DÉJÀ au moins une traduction publiée
    select exists (
      select 1 from public.book_translations
      where book_id = v_id and statut = 'publie'
    ) into v_deja_une_publiee;

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

    -- ┌────────────────────────────────────────────────────────────────────┐
    -- │ LES TRADUCTIONS SUIVENT LE TITRE VERS 'publie' À LA 1RE PUBLICATION.│
    -- │                                                                    │
    -- │ Quand un titre n'avait AUCUNE traduction publiée (première        │
    -- │ publication d'un conte ingéré), ses traductions en brouillon sont  │
    -- │ promues à 'publie'.                                                │
    -- │                                                                    │
    -- │ Si le titre avait DÉJÀ au moins une traduction publiée (ex. FR    │
    -- │ publiée et EN volontairement en brouillon pour relecture), la      │
    -- │ traduction en brouillon reste en brouillon.                         │
    -- └────────────────────────────────────────────────────────────────────┘
    if p_statut = 'publie' and not v_deja_une_publiee then
      update public.book_translations
      set statut = 'publie',
          maj_le = public.app_now()
      where book_id = v_id
        and statut = 'brouillon';
    end if;
  end loop;

  return query
    select b.id, b.statut, b.publie_le from public.books b
    where b.id = any(p_book_ids) order by b.slug;
end;
$$;

comment on function public.admin_changer_publication(uuid, uuid[], public.book_status) is
  'Publication ou archivage, a l''unite ou en lot. Publier un titre publie aussi ses traductions en brouillon — sans quoi catalog_list ne les voit pas, et le titre reste invisible au catalogue malgre sa pastille verte dans le back-office.';

revoke all on function public.admin_changer_publication(uuid, uuid[], public.book_status)
  from public, anon, authenticated;
grant execute on function public.admin_changer_publication(uuid, uuid[], public.book_status)
  to service_role;

-- ---------------------------------------------------------------------------
-- Rattrapage des titres DÉJÀ publiés dont la traduction est restée en
-- brouillon.
--
-- C'est le cas de « la giraphe » et de « Lions et la Souris » : ils ont été
-- publiés par l'ancien code, qui ne touchait pas les traductions. Sans cette
-- mise à jour, les corriger exigerait de repasser chacun en brouillon puis de
-- le republier — un geste que l'éditeur ne devrait pas avoir à faire.
--
-- ATTENTION : on ne touche que les titres dont AUCUNE traduction n'est encore
-- publiée. Un titre comme « la-girafe-et-l-oiseau-malin » — qui a une
-- traduction FR publiée et une EN volontairement en brouillon — n'est PAS
-- concerné : sa traduction FR prouve qu'il a été publié correctement, et
-- l'EN est en brouillon par choix éditorial, pas par défaut du code.
-- ---------------------------------------------------------------------------

update public.book_translations t
set statut = 'publie',
    maj_le = public.app_now()
from public.books b
where b.id = t.book_id
  and b.statut = 'publie'
  and t.statut = 'brouillon'
  and not exists (
    select 1 from public.book_translations t2
    where t2.book_id = b.id
      and t2.statut = 'publie'
  );
