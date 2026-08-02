-- 0038 — L'acteur devient obligatoire dès qu'une requête applicative est en jeu
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ LA CORRECTION D'A1 : LA DISTINCTION ÉTAIT CONVENTIONNELLE, ELLE DEVIENT   │
-- │ STRUCTURELLE.                                                             │
-- │                                                                            │
-- │ Le déclencheur d'octroi exigeait un motif « dès lors qu'un administrateur │
-- │ est identifié ». J'avais décrit cela comme distinguant le « geste humain » │
-- │ de « l'écriture technique » — c'était faux. La contrainte distinguait      │
-- │ seulement ACTEUR FOURNI de ACTEUR ABSENT, et rien n'empêchait une route    │
-- │ applicative écrite plus tard d'omettre l'acteur et de se confondre avec un │
-- │ seed.                                                                     │
-- │                                                                            │
-- │ LE CRITÈRE JUSTE EST CELUI DE `app_now()` : ce n'est pas l'intention de    │
-- │ l'appelant qui décide, c'est une propriété de la CONNEXION, que le code    │
-- │ applicatif ne peut pas se donner.                                         │
-- │                                                                            │
-- │   * `app_now()` n'honore un décalage d'horloge que si l'artefact           │
-- │     `dev_clock_activation` existe — absent en production.                 │
-- │                                                                            │
-- │   * ici, l'acteur n'est facultatif que si la connexion est DIRECTE, c'est- │
-- │     à-dire hors du contexte de jeton PostgREST.                           │
-- │                                                                            │
-- │ Une route applicative parle nécessairement par PostgREST, qui pose         │
-- │ `request.jwt.claims` sur chaque requête. Elle ne peut donc plus emprunter  │
-- │ le chemin des seeds — par construction, et non par convention.            │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- Ce qui reste légitimement sans acteur : migrations, seeds, fixtures de test,
-- et `psql` ouvert à la main. Toutes passent par une connexion directe.

/**
 * La requête vient-elle d'une route applicative ?
 *
 * Vrai dès que PostgREST a posé son contexte de jeton — ce qu'il fait sur
 * CHAQUE requête, y compris sous `service_role`, où les revendications portent
 * `"role": "service_role"`.
 *
 * Une connexion directe (`pg`, `psql`, `supabase db reset`) n'a pas ce
 * paramètre : il est absent, et non vide.
 */
create function public.contexte_applicatif()
  returns boolean
  language plpgsql
  stable
as $$
declare
  v_claims text;
begin
  v_claims := current_setting('request.jwt.claims', true);
  return v_claims is not null and v_claims <> '' and v_claims <> 'null';
end;
$$;

comment on function public.contexte_applicatif() is
  'Vrai si la requete vient d''une route applicative (PostgREST a pose `request.jwt.claims`). Faux en connexion directe : migration, seed, fixture de test, psql. Meme principe que `app_now()` : c''est une propriete de la CONNEXION, que le code applicatif ne peut pas se donner.';

grant execute on function public.contexte_applicatif() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Le déclencheur d'octroi, repris
--
-- Deux changements :
--   * l'acteur est exigé dès que la requête est applicative, et plus seulement
--     quand il se trouve être présent ;
--   * le retrait consigne la LIGNE COMPLÈTE (correction A2).
-- ---------------------------------------------------------------------------

create or replace function public.tracer_octroi()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.type = 'offert' then
      -- ┌──────────────────────────────────────────────────────────────────┐
      -- │ LA LIGNE ENTIÈRE, ET NON TROIS CHAMPS (correction A2).           │
      -- │                                                                  │
      -- │ Un droit `offert` est le SEUL type de droit sans trace externe    │
      -- │ permettant de le reconstituer : un achat a sa commande et sa      │
      -- │ facture, un octroi manuel n'a rien d'autre que cette ligne. La    │
      -- │ supprimer en n'en gardant que trois champs rendait la décision    │
      -- │ irréversible ET irreconstituable.                                 │
      -- │                                                                  │
      -- │ `to_jsonb(old)` capture tout, y compris `accorde_le` et `id` —    │
      -- │ ce qu'il faut pour rétablir à l'identique une suppression faite   │
      -- │ par erreur. Le coût est d'une colonne déjà présente.              │
      -- └──────────────────────────────────────────────────────────────────┘
      perform public.journaliser_admin(
        'droit_retire', 'entitlement', old.id,
        to_jsonb(old),
        null, null);
    end if;
    return old;
  end if;

  if new.type <> 'offert' then
    return new;
  end if;

  -- L'ACTEUR EST EXIGÉ DÈS QUE LA REQUÊTE EST APPLICATIVE.
  --
  -- Une route qui octroierait un droit sans acteur produirait une trace
  -- indiscernable d'un seed : le journal cesserait de dire qui a donné du
  -- contenu gratuitement, ce qui est précisément sa raison d'être.
  if public.contexte_applicatif() and public.acteur_courant() is null then
    raise exception 'Un octroi de droits par une route applicative exige un acteur identifie.'
      using errcode = 'insufficient_privilege',
            hint = 'Passer par public.admin_octroyer_droit(p_acteur, ...).';
  end if;

  if public.acteur_courant() is not null and public.motif_courant() is null then
    raise exception 'Un octroi manuel de droits exige un motif.'
      using errcode = 'check_violation',
            hint = 'Deposer le motif dans le parametre de session `app.motif`.';
  end if;

  perform public.journaliser_admin(
    'droit_octroye', 'entitlement', new.id,
    null,
    jsonb_build_object('user_id', new.user_id, 'book_id', new.book_id,
                       'peut_telecharger', new.peut_telecharger,
                       'expire_le', new.expire_le),
    null);
  return new;
end;
$$;

comment on function public.tracer_octroi() is
  'Trace les octrois et retraits de droits OFFERTS. L''acteur est OBLIGATOIRE des que la requete vient d''une route applicative (`contexte_applicatif()`) ; il n''est facultatif qu''en connexion directe — migration, seed, fixture. Le retrait consigne la ligne entiere : un droit offert n''a aucune autre trace permettant de le reconstituer.';
