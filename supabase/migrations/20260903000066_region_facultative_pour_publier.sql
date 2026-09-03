-- ============================================================================
-- LA RÉGION DU CATALOGUE NE BLOQUE PLUS LA PUBLICATION.
--
-- Décision de l'éditeur du 3 septembre 2026.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE QUI CHANGE, ET RIEN D'AUTRE.                                          │
-- │                                                                          │
-- │ `manques_pour_publication` perd sa branche `region`. Le corps est repris │
-- │ mot pour mot de la migration 0044 pour le reste : auteur, origine        │
-- │ culturelle, âge, et les prix par zone active restent exigés à            │
-- │ l'identique.                                                             │
-- │                                                                          │
-- │ La COLONNE `books.region` demeure, son énumération demeure, la facette   │
-- │ du catalogue public demeure, et l'écran d'administration continue de     │
-- │ permettre de la poser. Ce qui disparaît est son pouvoir de BLOQUER.      │
-- │                                                                          │
-- │ Un titre sans région s'affiche déjà correctement : `Motif` replie sur    │
-- │ la teinte `inconnue`, qui existe dans les jetons depuis l'origine. Le    │
-- │ seul effet visible est qu'un tel titre ne ressort pas sous un filtre de  │
-- │ région — ce qui est exact, puisqu'il n'en a pas.                         │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI LE CHAMP RESTE, AU LIEU D'ÊTRE RETIRÉ.                          │
-- │                                                                          │
-- │ Le retirer casserait la facette `region` du catalogue public, ses tests, │
-- │ et la teinte des titres qui en ont une. La demande était de ne rien      │
-- │ casser : on retire donc son EFFET sur la publication, pas la donnée.     │
-- │                                                                          │
-- │ Un livret pédagogique rendait la contrainte absurde — une fiche          │
-- │ d'activités n'a pas de région d'origine — mais la règle est levée pour   │
-- │ les deux supports. `manques_pour_publication` n'a jamais lu              │
-- │ `type_document` et ne doit pas commencer : ce serait une seconde règle   │
-- │ d'accès au support, exactement ce que le cahier des charges §3.5.2       │
-- │ interdit.                                                                │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Le type de retour est inchangé (`text[]`) : `create or replace` suffit, et
-- le déclencheur de publication comme les écrans d'administration reprennent
-- la nouvelle définition sans être retouchés — c'est tout l'intérêt d'avoir
-- UNE seule implémentation de cette règle.
-- ============================================================================

create or replace function public.manques_pour_publication(p_book_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(manque order by manque), '{}')
  from (
    select 'auteur' as manque
    from public.books b
    where b.id = p_book_id
      and (
        b.auteur is null
        or btrim(b.auteur) = ''
        -- La valeur que pose l'ingestion quand le PDF ne porte pas d'auteur.
        --
        -- Les variantes sont énumérées plutôt que repliées par `unaccent` :
        -- l'extension n'est pas installée, et l'ajouter pour cette seule
        -- comparaison coûterait plus qu'elle ne rapporte. La liste couvre les
        -- deux orthographes plausibles, casse indifférente.
        --
        -- Un test vérifie que la constante `AUTEUR_A_RENSEIGNER` du code
        -- applicatif figure bien parmi ces valeurs : sans lui, changer l'une
        -- sans l'autre rouvrirait la porte en silence.
        or lower(btrim(b.auteur)) in ('à renseigner', 'a renseigner')
      )

    union all

    select 'origine_culturelle'
    from public.books b
    where b.id = p_book_id
      and (b.origine_culturelle is null or btrim(b.origine_culturelle) = '')

    -- ┌──────────────────────────────────────────────────────────────────────┐
    -- │ ICI SE TROUVAIT LA BRANCHE `region`, RETIRÉE LE 3 SEPTEMBRE 2026.    │
    -- │                                                                      │
    -- │ Elle exigeait `books.region is not null` pour publier. La trace est  │
    -- │ laissée en commentaire pour que la lecture de cette fonction dise ce │
    -- │ qui a été décidé, et non seulement ce qui reste.                     │
    -- └──────────────────────────────────────────────────────────────────────┘

    union all

    select 'age'
    from public.books b
    where b.id = p_book_id
      and (b.age_min is null or b.age_max is null)

    union all

    -- Un prix manquant dans une zone active. Le manque nomme la zone : dire
    -- « prix manquant » sans préciser laquelle obligerait l'éditeur à chercher.
    select 'prix_' || z.zone::text
    from public.books b
    cross join public.active_price_zones z
    where b.id = p_book_id
      and b.disponible_achat
      and z.active
      and not exists (
        select 1 from public.book_prices p
        where p.book_id = b.id and p.zone = z.zone
      )
  ) as manques;
$$;

comment on function public.manques_pour_publication(uuid) is
  'Ce qui manque à un titre pour être publiable. UNE seule implémentation : le '
  'déclencheur de publication et les écrans d''administration la lisent tous '
  'les deux. La région du catalogue n''en fait plus partie depuis la migration '
  '0066 (décision de l''éditeur du 3 septembre 2026) : elle reste posable et '
  'reste la facette du catalogue public, mais elle ne bloque plus.';
