-- 0024 — Validation de la publication (principe arbitré : ingestion permissive,
--        publication stricte)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ RENDRE LES ÉTATS PROBLÉMATIQUES INATTEIGNABLES, PLUTÔT QUE DE LES GÉRER.  │
-- │                                                                            │
-- │ La chaîne d'ingestion est volontairement PERMISSIVE : elle accepte un PDF  │
-- │ dont l'auteur est inconnu et crée une fiche en brouillon portant           │
-- │ « À renseigner ». C'est voulu — refuser l'ingestion obligerait l'éditeur à │
-- │ tout saisir avant même de voir le résultat du rendu.                       │
-- │                                                                            │
-- │ La PUBLICATION, elle, est stricte. C'est le seul moment où un titre        │
-- │ devient visible, vendable et facturable : c'est donc là que les            │
-- │ vérifications doivent mordre.                                              │
-- │                                                                            │
-- │ VÉRIFIÉ EN BASE, ET NON DANS LE FORMULAIRE. Un contrôle côté interface se  │
-- │ contourne par un appel direct à l'API, se perd à la première refonte, et   │
-- │ ne protège pas des scripts d'import. Le déclencheur, lui, tient quel que   │
-- │ soit le chemin d'écriture — y compris `service_role`, qui contourne RLS.   │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- CE QUE CETTE VALIDATION REND IMPOSSIBLE
--
--   * un titre publié dont l'auteur est resté « À renseigner » ;
--   * un titre publié sans origine culturelle — l'élément différenciant du
--     positionnement éditorial (§4.1 F3) ;
--   * un titre publié sans tranche d'âge, alors que le catalogue filtre dessus ;
--   * un titre vendu à l'unité sans prix dans une zone active, qui ferait
--     basculer la devise d'un panier en silence (docs/PLAN.md D4 point 8).

-- ---------------------------------------------------------------------------
-- Zones tarifaires actives.
--
-- Table plutôt que constante : ouvrir une zone est une décision commerciale,
-- et elle doit pouvoir se prendre sans migration. La colonne `active` permet
-- de préparer une zone sans l'imposer immédiatement aux titres déjà publiés.
-- ---------------------------------------------------------------------------

create table public.active_price_zones (
  zone public.price_zone primary key,
  active boolean not null default true,
  maj_le timestamptz not null default public.app_now()
);

comment on table public.active_price_zones is
  'Zones tarifaires ouvertes à la vente. Un titre `disponible_achat` ne peut être publié que s''il a un prix dans CHACUNE des zones actives.';

insert into public.active_price_zones (zone, active) values
  ('international', true),
  ('afrique', true);

alter table public.active_price_zones enable row level security;

grant select on public.active_price_zones to anon, authenticated;

-- Lisible : la grille tarifaire est publique. Non modifiable par un client.
create policy active_price_zones_lecture_publique on public.active_price_zones
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- La validation.
-- ---------------------------------------------------------------------------

/**
 * Ce qui manque à un titre pour être publiable.
 *
 * Rend un tableau vide quand le titre est publiable. Exposée séparément du
 * déclencheur pour que le back-office (étape 13) puisse afficher la liste des
 * manques AVANT que l'éditeur ne tente la publication : découvrir un refus au
 * moment de valider est une mauvaise expérience, et la même règle sert alors
 * aux deux usages sans risque de divergence.
 */
create function public.manques_pour_publication(p_book_id uuid)
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
  'Liste ce qui empêche un titre d''être publié. Tableau vide = publiable. Sert au déclencheur ET au back-office, pour que les deux disent exactement la même chose.';

/**
 * Déclencheur de publication.
 *
 * Ne mord QU'AU PASSAGE au statut `publie`. Un titre déjà publié dont on
 * modifie un champ sans rapport n'est pas revalidé : la contrainte porte sur la
 * TRANSITION, pas sur l'état permanent. Sans cette précaution, retirer un prix
 * d'un titre publié échouerait avec un message parlant de publication, ce qui
 * égarerait plus qu'il n'aiderait.
 */
create function public.valider_publication()
  returns trigger
  language plpgsql
as $$
declare
  v_manques text[];
begin
  if new.statut = 'publie' and (tg_op = 'INSERT' or old.statut is distinct from 'publie') then
    v_manques := public.manques_pour_publication(new.id);

    if array_length(v_manques, 1) > 0 then
      raise exception
        'Publication refusée : il manque % au titre « % ».',
        array_to_string(v_manques, ', '), new.slug
        using errcode = 'check_violation',
              hint = 'Complétez la fiche au back-office avant de publier.';
    end if;
  end if;

  return new;
end;
$$;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CONTRAINTE DIFFÉRÉE À LA FIN DE LA TRANSACTION, ET C'EST NÉCESSAIRE.     │
-- │                                                                          │
-- │ Les prix d'un titre vivent dans une AUTRE table. Un script qui insère le │
-- │ livre puis ses prix — ce que font les seeds, et ce que fera tout import  │
-- │ en masse — présenterait, à l'instant de l'insertion du livre, un titre   │
-- │ publié sans aucun prix. Vérifier immédiatement le refuserait alors que   │
-- │ la transaction, une fois complète, est parfaitement valide.              │
-- │                                                                          │
-- │ `initially deferred` fait porter la vérification sur l'ÉTAT FINAL de la  │
-- │ transaction, qui est le seul qui compte. La garantie est intacte : rien  │
-- │ ne peut être commité en violation. Elle est seulement jugée au bon       │
-- │ moment.                                                                  │
-- │                                                                          │
-- │ Constaté en écrivant cette migration : la version immédiate faisait      │
-- │ échouer `npm run db:reset` sur les seeds eux-mêmes.                      │
-- └──────────────────────────────────────────────────────────────────────────┘
create constraint trigger books_valider_publication
  after insert or update of statut on public.books
  deferrable initially deferred
  for each row
  execute function public.valider_publication();

comment on function public.valider_publication() is
  'Interdit le passage au statut `publie` d''un titre incomplet. Vérifié en base : un contrôle de formulaire se contourne par un appel direct à l''API.';

revoke all on function public.valider_publication() from public, anon, authenticated;
grant execute on function public.manques_pour_publication(uuid) to service_role, authenticated;
