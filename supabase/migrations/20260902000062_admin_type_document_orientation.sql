-- ---------------------------------------------------------------------------
-- Ce qui manquait pour que la migration 0061 SERVE À QUELQUE CHOSE : de quoi
-- poser le type de document et l'orientation, puis les relire.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE MÊME DÉFAUT QUE `books.region`, REPRIS AVANT QU'IL NE COÛTE.         │
-- │                                                                          │
-- │ La 0061 a créé `type_document` et `orientation`. Aucune fonction         │
-- │ `admin_*` ne permettait de les POSER, et `admin_lire_livre` ne les       │
-- │ rendait pas : tout le catalogue serait resté « conte » et « portrait »,  │
-- │ sans qu'aucun écran ne puisse dire le contraire.                        │
-- │                                                                          │
-- │ C'est exactement ce qui s'est produit sur `region` entre les migrations  │
-- │ 0044 et 0057 — exigée à la publication, impossible à écrire. Une seule   │
-- │ différence, et elle rend le défaut PLUS long à voir, pas moins réel :    │
-- │ `conte` et `portrait` étant des valeurs par défaut non nulles,           │
-- │ « Publier » ne reste pas éteint. Rien ne proteste. Le catalogue se       │
-- │ contente d'être faux.                                                    │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI L'ORIENTATION N'EST PAS DÉDUITE DU FICHIER DÉPOSÉ.             │
-- │                                                                          │
-- │ L'ingestion connaît les dimensions de chaque page : elle pourrait donc   │
-- │ deviner. Mais un livret porte souvent une couverture portrait devant des │
-- │ planches paysage, et un conte peut contenir une double page. Une         │
-- │ déduction se tromperait donc SANS LE DIRE, sur le champ qui décide de la │
-- │ mise en page — le raisonnement même du commentaire de                    │
-- │ `region_depuis_origine`, qui réserve la déduction à l'amorçage.         │
-- └──────────────────────────────────────────────────────────────────────────┘

drop function if exists public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint,
  public.region_conte, text
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
  p_illustrateur text default null,
  p_type_document public.document_type default null,
  p_orientation public.page_orientation default null
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
      -- Non nulles en base : `coalesce` y garde son sens de « ne touche pas »,
      -- et ne peut jamais servir à les effacer.
      type_document      = coalesce(p_type_document, type_document),
      orientation        = coalesce(p_orientation, orientation),
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
  public.region_conte, text, public.document_type, public.page_orientation
) is
  'Modifie les champs métier d''un titre. `type_document` et `orientation` y ont été ajoutés le 2 septembre 2026 : la migration 0061 avait créé les colonnes sans qu''aucune fonction ne permette de les poser — tout le catalogue serait resté « conte » et « portrait ».';

revoke all on function public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint,
  public.region_conte, text, public.document_type, public.page_orientation
) from public, anon, authenticated;
grant execute on function public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint, smallint,
  public.region_conte, text, public.document_type, public.page_orientation
) to service_role;

-- ---------------------------------------------------------------------------
-- La LECTURE, sans laquelle l'écriture s'écrase elle-même
--
-- Un champ qu'on peut écrire sans le relire est un champ qu'on écrase : l'écran
-- afficherait « conte » sur un livret, et le premier enregistrement des champs
-- métier le ramènerait à « conte » pour de bon. C'est le défaut que la
-- migration 0059 a dû rattraper sur `region`, et son commentaire le dit dans
-- ces termes. On referme ici les trois côtés d'un coup — créer, poser, relire —
-- pour ne pas rejouer l'écart des migrations 0044 à 0059.
--
-- `drop` puis `create` et non `create or replace` : PostgreSQL refuse de
-- changer le type de retour d'une fonction par remplacement, et la liste des
-- colonnes d'un `returns table` en fait partie.

drop function if exists public.admin_lire_livre(uuid);

create function public.admin_lire_livre(p_book_id uuid)
  returns table (
    id uuid,
    slug text,
    auteur text,
    illustrateur text,
    origine_culturelle text,
    region public.region_conte,
    type_document public.document_type,
    orientation public.page_orientation,
    age_min smallint,
    age_max smallint,
    themes text[],
    nb_pages_extrait smallint,
    statut public.book_status,
    gratuit boolean,
    inclus_abonnement boolean,
    disponible_achat boolean,
    publie_le timestamptz,
    prix jsonb,
    traductions jsonb,
    manques text[],
    publiable boolean
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select
    b.id,
    b.slug,
    b.auteur,
    b.illustrateur,
    b.origine_culturelle,
    -- Exigée à la publication depuis la 0044, posable depuis la 0057, lisible
    -- depuis la 0059. Les trois se tiennent : un champ qu'on peut écrire sans
    -- le relire est un champ qu'on écrase.
    b.region,
    b.type_document,
    b.orientation,
    b.age_min,
    b.age_max,
    b.themes,
    b.nb_pages_extrait,
    b.statut,
    b.gratuit,
    b.inclus_abonnement,
    b.disponible_achat,
    b.publie_le,
    coalesce((
      select jsonb_object_agg(bp.zone, jsonb_build_object('montant', bp.montant, 'devise', bp.devise))
      from public.book_prices bp where bp.book_id = b.id
    ), '{}'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', bt.id,
          'langue', bt.langue,
          'titre', bt.titre,
          'resume', bt.resume,
          'statut', bt.statut,
          'nb_pages', bt.nb_pages,
          -- Des ÉTATS, jamais des chemins. Le back-office a besoin de savoir
          -- si une version est complète ; il n'a aucun usage de la clé de
          -- stockage, et la lui donner reviendrait à lui donner le fichier.
          'lisible', bt.fichier_lecture is not null,
          'telechargeable', bt.fichier_telechargement is not null
        )
        order by bt.langue
      )
      from public.book_translations bt where bt.book_id = b.id
    ), '[]'::jsonb),
    public.manques_pour_publication(b.id),
    (cardinality(public.manques_pour_publication(b.id)) = 0)
  from public.books b
  where b.id = p_book_id;
$$;

comment on function public.admin_lire_livre(uuid) is
  'Un titre et tout ce que le back-office en édite : champs métier, région, type de document, orientation, prix par zone, versions linguistiques avec leur identifiant, et ce qui lui manque pour être publiable — calculé par `manques_pour_publication()`, la fonction qu''applique le déclencheur. Les versions portent `lisible` et `telechargeable`, des états et non des chemins de stockage.';

revoke all on function public.admin_lire_livre(uuid) from public, anon, authenticated;
grant execute on function public.admin_lire_livre(uuid) to service_role;
