-- ---------------------------------------------------------------------------
-- Correctif de `admin_lire_livre` : les deux drapeaux de fichiers changent de
-- nom.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE QUE LE NOM PRÉCÉDENT CASSAIT.                                        │
-- │                                                                          │
-- │ La migration 0054 rendait `a_fichier_telechargement` et                  │
-- │ `a_fichier_lecture`. Ce sont des BOOLÉENS — le chemin de stockage ne     │
-- │ sort pas, et c'était déjà la précaution voulue : un chemin affiché finit │
-- │ recopié dans une URL.                                                    │
-- │                                                                          │
-- │ Mais `tests/unit/telechargement-architecture.test.ts` interdit le nom     │
-- │ `fichier_telechargement` hors du service de téléchargement et de la      │
-- │ chaîne d'ingestion, et il a signalé l'écran d'édition. Le test cherche   │
-- │ une CHAÎNE, sans distinguer la colonne du drapeau qui en dérive.         │
-- │                                                                          │
-- │ La tentation était d'ajouter une exception. Elle aurait été fausse pour  │
-- │ la bonne raison : la règle protège le nom de la colonne qui désigne le   │
-- │ fichier vendu, et « qui la lit peut le servir ». Un drapeau qui EMPRUNTE │
-- │ ce nom finit par être pris pour elle — d'abord par un test, ensuite par  │
-- │ quelqu'un qui écrira `select fichier_telechargement` en croyant          │
-- │ prolonger un usage existant.                                            │
-- │                                                                          │
-- │ `telechargeable` et `lisible` disent ce qu'ils sont : des états, pas des │
-- │ chemins. Le back-office n'a jamais eu besoin d'autre chose.              │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- `drop` puis `create` et non `create or replace` : PostgreSQL refuse de
-- changer le type de retour d'une fonction par remplacement, et les noms de
-- colonnes d'un `returns table` en font partie.

drop function if exists public.admin_lire_livre(uuid);

create function public.admin_lire_livre(p_book_id uuid)
  returns table (
    id uuid,
    slug text,
    auteur text,
    illustrateur text,
    origine_culturelle text,
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
  'Un titre et tout ce que le back-office en édite : champs métier, prix par zone, traductions, et ce qui lui manque pour être publiable — calculé par `manques_pour_publication()`, la fonction qu''applique le déclencheur. Les traductions portent `lisible` et `telechargeable`, des états et non des chemins de stockage.';

revoke all on function public.admin_lire_livre(uuid) from public, anon, authenticated;
grant execute on function public.admin_lire_livre(uuid) to service_role;
