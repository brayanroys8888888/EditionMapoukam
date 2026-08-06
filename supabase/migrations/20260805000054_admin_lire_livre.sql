-- ---------------------------------------------------------------------------
-- Lecture d'UN titre, pour l'écran d'édition du back-office.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI UNE FONCTION DE PLUS, PLUTÔT QUE `admin_lister_livres`.        │
-- │                                                                          │
-- │ La liste ne filtre que par statut. Retrouver un titre par son            │
-- │ identifiant aurait donc voulu dire rapatrier une page entière et la      │
-- │ parcourir en TypeScript — c'est-à-dire lire cinquante lignes pour en     │
-- │ afficher une, et se casser dès que le titre cherché tombe page deux.     │
-- │                                                                          │
-- │ Elle ne rend pas non plus les champs que l'édition modifie :             │
-- │ `origine_culturelle`, les bornes d'âge, la longueur d'extrait, ni les    │
-- │ traductions. Les ajouter à la liste aurait alourdi un écran de           │
-- │ cinquante lignes de données que quarante-neuf d'entre elles n'affichent  │
-- │ jamais.                                                                  │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ `manques` VIENT DE `manques_pour_publication`, COMME PARTOUT AILLEURS.  │
-- │                                                                          │
-- │ C'est la fonction qu'applique le déclencheur de publication. L'écran     │
-- │ d'édition affiche donc exactement ce que la base refusera — jamais une   │
-- │ liste de contrôle réécrite, qui aurait divergé au premier champ ajouté   │
-- │ et fait découvrir le refus au moment de publier.                        │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Comme toutes les fonctions d'administration : `security definer`, réservée à
-- `service_role`, et sans mutation — l'écran d'édition écrit par
-- `admin_modifier_livre`, `admin_definir_prix` et `admin_changer_publication`,
-- qui vérifient le rôle en base et posent l'acteur pour l'audit.

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
    -- Les traductions sont rendues en TABLEAU et non en objet indexé par
    -- langue : l'écran les affiche dans l'ordre, et un objet aurait imposé au
    -- code applicatif de connaître la liste des langues pour les parcourir.
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'langue', bt.langue,
          'titre', bt.titre,
          'resume', bt.resume,
          'statut', bt.statut,
          'nb_pages', bt.nb_pages,
          -- Les CHEMINS de fichiers ne sortent pas : ce sont des clés de
          -- stockage, et le back-office n'a besoin que de savoir s'ils
          -- existent. Un chemin affiché finit recopié dans une URL.
          'a_fichier_lecture', bt.fichier_lecture is not null,
          'a_fichier_telechargement', bt.fichier_telechargement is not null
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
  'Un titre et tout ce que le back-office en édite : champs métier, prix par zone, traductions, et ce qui lui manque pour être publiable — calculé par `manques_pour_publication()`, la fonction qu''applique le déclencheur.';

revoke all on function public.admin_lire_livre(uuid) from public, anon, authenticated;
grant execute on function public.admin_lire_livre(uuid) to service_role;
