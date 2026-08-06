-- ---------------------------------------------------------------------------
-- `admin_lire_livre` rend enfin ce que l'écran d'édition doit MODIFIER :
-- la région du titre, et l'identifiant de chaque version linguistique.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI CES DEUX-LÀ, ET POURQUOI MAINTENANT.                           │
-- │                                                                          │
-- │ La migration 0057 a donné à `admin_modifier_livre` le paramètre          │
-- │ `p_region`, et à `admin_modifier_traduction` sa version corrigée. Les    │
-- │ deux écritures existaient donc, mais la LECTURE ne suivait pas :         │
-- │                                                                          │
-- │ - sans `region`, l'écran ne peut pas préremplir son choix. Il montrerait │
-- │   « aucune » sur un titre qui en a une, et le premier enregistrement     │
-- │   des champs métier l'écraserait sans que personne l'ait voulu ;         │
-- │ - sans l'identifiant d'une version, l'écran ne peut désigner AUCUNE      │
-- │   ligne à corriger. `admin_modifier_traduction` est clé par cet          │
-- │   identifiant, et la langue ne le remplace pas — ce serait une seconde   │
-- │   clé, à tenir unique par titre pour toujours.                          │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UN IDENTIFIANT DE VERSION N'EST PAS UN CHEMIN DE STOCKAGE.              │
-- │                                                                          │
-- │ La migration 0056 a retiré les noms qui laissaient croire que cette      │
-- │ fonction rendait des clés de fichiers. La précaution tenait à ceci :     │
-- │ « qui lit le chemin peut servir le fichier ». Une clé primaire de        │
-- │ `book_translations` n'ouvre rien — elle ne sert qu'à nommer la ligne     │
-- │ auprès d'une fonction qui revérifie le rôle en base, et qui exige        │
-- │ depuis la 0058 que la version appartienne au titre indiqué.             │
-- └──────────────────────────────────────────────────────────────────────────┘
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
    -- depuis celle-ci. Les trois se tiennent : un champ qu'on peut écrire sans
    -- le relire est un champ qu'on écrase.
    b.region,
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
  'Un titre et tout ce que le back-office en édite : champs métier, région, prix par zone, versions linguistiques avec leur identifiant, et ce qui lui manque pour être publiable — calculé par `manques_pour_publication()`, la fonction qu''applique le déclencheur. Les versions portent `lisible` et `telechargeable`, des états et non des chemins de stockage.';

revoke all on function public.admin_lire_livre(uuid) from public, anon, authenticated;
grant execute on function public.admin_lire_livre(uuid) to service_role;
