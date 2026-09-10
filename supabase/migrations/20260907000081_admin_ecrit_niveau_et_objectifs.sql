-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0081 — L'ADMINISTRATION PEUT ÉCRIRE `niveau` ET `objectifs`.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UN CHAMP QU'ON AFFICHE ET QU'ON NE PEUT PAS SAISIR EST UN CHAMP MORT.    │
-- │                                                                          │
-- │ La migration 0079 a créé les deux colonnes et les a fait rendre par      │
-- │ `catalog_list` ; l'écran des livrets les affiche — pastille de niveau    │
-- │ sur la carte, objectifs cochés dans le panneau du kit offert. Aucune     │
-- │ fonction `admin_*` ne pouvait les écrire : elles n'étaient renseignées   │
-- │ que par le dépôt manuel qui a servi à construire l'écran.                │
-- │                                                                          │
-- │ C'est le défaut exact que la 0070 avait corrigé pour `themes` : une      │
-- │ colonne alimentait une facette du catalogue depuis vingt migrations, et  │
-- │ la facette restait vide sur tout titre déposé par l'interface.           │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LA SIGNATURE EST REPRISE, ELLE N'EST PAS RETAPÉE.                       │
-- │                                                                          │
-- │ Le corps ci-dessous est celui que la base rend aujourd'hui               │
-- │ (`pg_get_functiondef`), avec DEUX paramètres ajoutés en fin de liste et  │
-- │ DEUX lignes ajoutées à la mise à jour. Rien d'autre n'a bougé.           │
-- │                                                                          │
-- │ Ce n'est pas une précaution de style. La 0079 avait retapé le            │
-- │ `RETURNS TABLE` de `catalog_list` et renommé `book_id` en `id` au        │
-- │ passage : le client Supabase mappe PAR POSITION, aucune erreur n'a été   │
-- │ levée, et tout le catalogue a rendu `undefined` jusqu'à ce qu'une        │
-- │ migration corrective (0080) régénère la signature depuis son texte       │
-- │ d'origine. Une signature se copie.                                       │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ COMMENT ON EFFACE UN NIVEAU — LA CHAÎNE VIDE, PAS `null`.               │
-- │                                                                          │
-- │ Toute cette fonction tient sur une convention : `null` veut dire « ne    │
-- │ touche pas », de sorte qu'une mise à jour partielle ne remette jamais à  │
-- │ nul ce qu'elle ne nomme pas. La convention est juste, et elle laisse un  │
-- │ trou : sur une colonne NULLABLE, elle rend l'effacement impossible.      │
-- │                                                                          │
-- │ `objectifs` n'a pas le problème — la colonne est `not null default       │
-- │ '{}'`, et un tableau VIDE l'efface, exactement comme `themes` depuis la  │
-- │ 0070. `niveau`, si : c'est un `text` nullable.                           │
-- │                                                                          │
-- │ La CHAÎNE VIDE devient donc l'effacement explicite. Elle ne peut pas     │
-- │ être confondue avec une valeur : un niveau vide n'a aucun sens, et       │
-- │ l'écran d'administration envoie déjà une chaîne vide quand l'éditeur     │
-- │ efface le champ. C'est la seule lecture qui donne à ce geste l'effet     │
-- │ qu'il annonce.                                                           │
-- └──────────────────────────────────────────────────────────────────────────┘

drop function if exists public.admin_modifier_livre(
  uuid, uuid, boolean, boolean, boolean, text, text, smallint, smallint,
  smallint, public.region_conte, text, public.document_type,
  public.page_orientation, text[]
);

create function public.admin_modifier_livre(
  p_acteur uuid,
  p_book_id uuid,
  p_gratuit boolean default null::boolean,
  p_inclus_abonnement boolean default null::boolean,
  p_disponible_achat boolean default null::boolean,
  p_auteur text default null::text,
  p_origine_culturelle text default null::text,
  p_age_min smallint default null::smallint,
  p_age_max smallint default null::smallint,
  p_nb_pages_extrait smallint default null::smallint,
  p_region public.region_conte default null::public.region_conte,
  p_illustrateur text default null::text,
  p_type_document public.document_type default null::public.document_type,
  p_orientation public.page_orientation default null::public.page_orientation,
  p_themes text[] default null::text[],
  p_niveau text default null::text,
  p_objectifs text[] default null::text[]
)
  returns public.books
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v_livre public.books;
  v_themes text[];
  v_objectifs text[];
begin
  perform public.admin_poser_acteur(p_acteur, null);

  -- Nettoyage des thèmes, une fois, ici. `null` traverse intact et signifie
  -- toujours « ne touche pas ».
  if p_themes is not null then
    select coalesce(array_agg(distinct btrim(u.t) order by btrim(u.t)), '{}'::text[])
      into v_themes
    from unnest(p_themes) as u(t)
    where length(btrim(u.t)) > 0;
  end if;

  -- Les objectifs suivent le même nettoyage, à UNE différence près : leur
  -- ORDRE est porteur de sens — ce sont les étapes d'un livret, et les trier
  -- alphabétiquement les mélangerait. On retire donc les vides et on garde la
  -- suite telle que l'éditeur l'a saisie.
  if p_objectifs is not null then
    select coalesce(array_agg(btrim(u.t) order by u.rang), '{}'::text[])
      into v_objectifs
    from unnest(p_objectifs) with ordinality as u(t, rang)
    where length(btrim(u.t)) > 0;
  end if;

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
      themes             = coalesce(v_themes, themes),
      -- Nullable, donc trois cas et non deux — voir l'encadré de tête.
      niveau             = case
                             when p_niveau is null then niveau
                             when btrim(p_niveau) = '' then null
                             else btrim(p_niveau)
                           end,
      objectifs          = coalesce(v_objectifs, objectifs),
      maj_le             = public.app_now()
  where id = p_book_id
  returning * into v_livre;

  if not found then
    raise exception 'Titre % introuvable.', p_book_id using errcode = 'no_data_found';
  end if;

  return v_livre;
end;
$function$;

comment on function public.admin_modifier_livre is
  'Mise a jour partielle d''un titre par l''administration. `null` signifie « ne touche pas » sur chaque champ. Depuis la 0081, `niveau` et `objectifs` sont ecrivables : la chaine vide efface le niveau (colonne nullable), le tableau vide efface les objectifs.';

-- PostgREST garde en cache la signature d'une fonction supprimee puis recreee :
-- sans ce reveil, la base est juste et l'application appelle l'ancienne.
notify pgrst, 'reload schema';
