-- ---------------------------------------------------------------------------
-- Ce qui manquait au back-office pour qu'un conte déposé puisse VIVRE.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE DÉFAUT QUI A MOTIVÉ CETTE MIGRATION.                                 │
-- │                                                                          │
-- │ `manques_pour_publication` exige `books.region` depuis la migration      │
-- │ 0044. Aucune fonction `admin_*` ne permettait de la POSER : l'éditeur    │
-- │ déposait son PDF, arrivait sur l'écran d'édition, remplissait tout ce    │
-- │ qu'on lui proposait — et « Publier » restait éteint, avec un manque      │
-- │ nommé `region` qu'aucun champ ne pouvait satisfaire.                     │
-- │                                                                          │
-- │ La région n'est PAS l'origine culturelle. L'origine est un texte libre   │
-- │ — « Peul », « Cameroun » — et la région est l'une des cinq valeurs de    │
-- │ `region_conte`, sur laquelle le catalogue filtre. `region_depuis_origine`│
-- │ sait deviner la seconde depuis la première, mais son commentaire est     │
-- │ formel : « amorçage et reprise de données UNIQUEMENT ; en exploitation,  │
-- │ l'éditeur pose la région à la main ». D'où un champ, et non une          │
-- │ déduction silencieuse qui se tromperait sans le dire.                    │
-- └──────────────────────────────────────────────────────────────────────────┘

drop function if exists public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint
);

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
  p_nb_pages_extrait smallint default null,
  p_region public.region_conte default null,
  p_illustrateur text default null
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
      region             = coalesce(p_region, region),
      illustrateur       = coalesce(p_illustrateur, illustrateur),
      maj_le             = public.app_now()
  where id = p_book_id
  returning * into v_livre;

  if not found then
    raise exception 'Titre % introuvable.', p_book_id using errcode = 'no_data_found';
  end if;

  return v_livre;
end;
$$;

comment on function public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint,
  public.region_conte, text
) is
  'Modifie les champs métier d''un titre. `region` y a été ajoutée le 5 août 2026 : elle est exigée à la publication depuis la migration 0044, et aucune fonction ne permettait de la poser — un conte déposé restait donc impubliable.';

revoke all on function public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint,
  public.region_conte, text
) from public, anon, authenticated;
grant execute on function public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint,
  public.region_conte, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Titre et résumé d'une version linguistique
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI CE QUI VIENT DU PDF DOIT QUAND MÊME POUVOIR ÊTRE CORRIGÉ.      │
-- │                                                                          │
-- │ La chaîne d'ingestion lit le titre dans les métadonnées du PDF, puis     │
-- │ dans le nom de fichier. Elle a donc raison la plupart du temps, et tort  │
-- │ exactement là où on ne peut rien y faire : un PDF exporté depuis un      │
-- │ traitement de texte porte souvent « Document1 » en métadonnée.           │
-- │                                                                          │
-- │ Le résumé, lui, n'est JAMAIS extrait — il est nul après ingestion, et    │
-- │ c'est le texte que lit un client sur la fiche avant d'acheter.           │
-- │                                                                          │
-- │ Le SLUG, en revanche, n'est pas modifiable, et c'est délibéré : il est   │
-- │ dans l'URL publique d'un conte. Le changer casserait les liens partagés  │
-- │ et les marque-pages, pour un gain purement cosmétique.                   │
-- └──────────────────────────────────────────────────────────────────────────┘

create function public.admin_modifier_traduction(
  p_acteur uuid,
  p_translation_id uuid,
  p_titre text default null,
  p_resume text default null
)
  returns public.book_translations
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_traduction public.book_translations;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if p_titre is not null and btrim(p_titre) = '' then
    raise exception 'Le titre ne peut pas être vide.' using errcode = 'check_violation';
  end if;

  update public.book_translations
  set titre  = coalesce(nullif(btrim(p_titre), ''), titre),
      -- Le résumé, lui, peut être VIDÉ : passer une chaîne vide le remet à
      -- nul. C'est un champ facultatif, et l'éditeur doit pouvoir retirer un
      -- texte qu'il a écrit — ce que `coalesce` seul lui interdirait.
      resume = case when p_resume is null then resume
                    when btrim(p_resume) = '' then null
                    else btrim(p_resume) end,
      maj_le = public.app_now()
  where id = p_translation_id
  returning * into v_traduction;

  if not found then
    raise exception 'Version % introuvable.', p_translation_id using errcode = 'no_data_found';
  end if;

  return v_traduction;
end;
$$;

comment on function public.admin_modifier_traduction(uuid, uuid, text, text) is
  'Corrige le titre et le résumé d''une version linguistique. Le slug n''est jamais modifiable : il est dans l''URL publique du conte.';

revoke all on function public.admin_modifier_traduction(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_modifier_traduction(uuid, uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Suppression d'un titre
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ELLE NE MORD QUE SUR UN BROUILLON, ET C'EST LA RÈGLE ENTIÈRE.          │
-- │                                                                          │
-- │ Un dépôt raté doit pouvoir disparaître : un PDF déposé deux fois laisse  │
-- │ un doublon au slug suffixé, que l'archivage ne fait que cacher.          │
-- │                                                                          │
-- │ Mais un titre PUBLIÉ OU ARCHIVÉ ne se supprime pas, même sans vente :    │
-- │ `entitlements` et `order_items` le référencent en `on delete cascade`,   │
-- │ si bien qu'une suppression effacerait SILENCIEUSEMENT les droits de      │
-- │ clients qui ont payé, et les lignes de commandes qui sont des pièces     │
-- │ comptables. L'archivage existe pour cela, et il est réversible.          │
-- │                                                                          │
-- │ La garde est ici, en base, et pas seulement dans l'écran : c'est le seul │
-- │ endroit qu'une route ajoutée dans six mois ne pourra pas contourner.     │
-- └──────────────────────────────────────────────────────────────────────────┘

create function public.admin_supprimer_livre(p_acteur uuid, p_book_id uuid, p_motif text)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_statut public.book_status;
  v_ventes bigint;
begin
  perform public.admin_poser_acteur(p_acteur, p_motif);

  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Une suppression exige un motif.' using errcode = 'check_violation';
  end if;

  select statut into v_statut from public.books where id = p_book_id;

  if not found then
    raise exception 'Titre % introuvable.', p_book_id using errcode = 'no_data_found';
  end if;

  if v_statut <> 'brouillon' then
    raise exception
      'Seul un brouillon se supprime. Un titre publié ou archivé est référencé par des droits et des commandes : archivez-le.'
      using errcode = 'check_violation';
  end if;

  -- Ceinture ET bretelles : le statut suffit en théorie, puisqu'un titre ne
  -- peut être vendu sans avoir été publié. Mais une reprise de données, un
  -- octroi manuel ou un retour en brouillon peuvent laisser un droit derrière
  -- eux — et la cascade les effacerait sans un mot.
  select count(*) into v_ventes
  from public.entitlements where book_id = p_book_id;

  if v_ventes > 0 then
    raise exception
      'Ce titre est rattaché à % droit(s) : il ne se supprime pas.', v_ventes
      using errcode = 'check_violation';
  end if;

  delete from public.books where id = p_book_id;
end;
$$;

comment on function public.admin_supprimer_livre(uuid, uuid, text) is
  'Supprime un BROUILLON, et lui seul — un dépôt raté doit pouvoir disparaître. Un titre publié ou archivé est référencé en cascade par `entitlements` et `order_items` : le supprimer effacerait des droits payés et des pièces comptables. Un motif est obligatoire.';

revoke all on function public.admin_supprimer_livre(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_supprimer_livre(uuid, uuid, text) to service_role;
