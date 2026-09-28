-- ---------------------------------------------------------------------------
-- CORRECTIF des 0098 et 0099 — aucune cascade depuis `users`.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ J'AVAIS RAISONNÉ, LE DÉPÔT A UNE RÈGLE. LA RÈGLE GAGNE.                 │
-- │                                                                          │
-- │ Les trois tables nées des 0098 et 0099 référençaient `users` en          │
-- │ `on delete cascade`, avec un argument défendable : un commentaire est un │
-- │ message privé, il s'en va avec son compte.                               │
-- │                                                                          │
-- │ `account-lifecycle.test.ts` l'a refusé, et sa raison porte plus loin que │
-- │ mon argument : « une cascade oubliée emporterait l'historique au premier │
-- │ effacement de compte, SANS BRUIT ». La règle ne protège pas contre le    │
-- │ mauvais raisonnement — elle protège contre l'OUBLI, qui n'en fait aucun. │
-- │                                                                          │
-- │ En `restrict`, effacer un compte échoue tant que ses lignes sont là.     │
-- │ L'effacement devient donc un geste ÉCRIT quelque part, et ce quelque     │
-- │ part est `anonymize_user`, qui efface déjà les commentaires (0099).      │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

alter table public.association_comments
  drop constraint association_comments_user_id_fkey,
  add constraint association_comments_user_id_fkey
    foreign key (user_id) references public.users (id) on delete restrict;

alter table public.association_comment_likes
  drop constraint association_comment_likes_user_id_fkey,
  add constraint association_comment_likes_user_id_fkey
    foreign key (user_id) references public.users (id) on delete restrict;

alter table public.association_event_registrations
  drop constraint association_event_registrations_user_id_fkey,
  add constraint association_event_registrations_user_id_fkey
    foreign key (user_id) references public.users (id) on delete restrict;

/*
 * Ce que l'anonymisation doit encore emporter.
 *
 * La 0099 lui a ajouté les commentaires. Les CŒURS et les INSCRIPTIONS n'y
 * étaient pas : un cœur dit qu'une personne a approuvé un message, une
 * inscription dit qu'elle comptait venir quelque part un jour donné. Les deux
 * sont des faits personnels, et les deux bloqueraient désormais l'effacement
 * du compte — ce qui est exactement l'effet voulu du `restrict` : rien ne
 * part en silence, et l'oubli se voit.
 */
create or replace function public.association_effacer_traces(p_user_id uuid)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  delete from public.association_comment_likes where user_id = p_user_id;
  delete from public.association_event_registrations where user_id = p_user_id;
  delete from public.association_comments where user_id = p_user_id;
$$;

comment on function public.association_effacer_traces(uuid) is
  'Les traces personnelles laissées dans l''espace associatif : cœurs, inscriptions, commentaires. Appelée par `anonymize_user`. Dans cet ordre — un cœur référence un commentaire.';

-- L'anonymisation appelle la fonction au lieu de recopier ses trois
-- effacements : une seule implementation, et les coeurs et inscriptions
-- partent avec les commentaires.
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id uuid)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_utilisateur public.users;
  v_jeton text;
begin
  select * into v_utilisateur from public.users where id = p_user_id for update;
  if not found then
    raise exception 'Compte % introuvable.', p_user_id using errcode = 'no_data_found';
  end if;
  if v_utilisateur.statut = 'anonymise' then
    -- Idempotent : réanonymiser ne doit ni échouer ni effacer deux fois.
    return v_utilisateur;
  end if;

  -- Jeton non réversible. `gen_random_uuid()` et non un hachage de l'adresse :
  -- un hachage resterait vulnérable à une attaque par dictionnaire, l'espace
  -- des adresses email étant énumérable.
  v_jeton := 'anonyme-' || replace(gen_random_uuid()::text, '-', '') || '@anonymise.invalid';

  -- 1. Données personnelles supprimées définitivement.
  perform public.association_effacer_traces(p_user_id);
  delete from public.book_reviews    where user_id = p_user_id;
  delete from public.entitlements    where user_id = p_user_id;
  delete from public.reading_progress where user_id = p_user_id;
  delete from public.download_logs   where user_id = p_user_id;
  delete from public.favorites       where user_id = p_user_id;
  delete from public.cart_items
    where cart_id in (select id from public.carts where user_id = p_user_id);
  delete from public.carts           where user_id = p_user_id;

  -- 2. Le compte perd son identité, mais garde sa ligne : les commandes et les
  --    factures y restent rattachées.
  update public.users
  set email = v_jeton,
      nom_complet = null,
      statut = 'anonymise',
      anonymise_le = public.app_now(),
      maj_le = public.app_now()
  where id = p_user_id
  returning * into v_utilisateur;

  -- 3. Suppression de l'identité d'authentification. C'est elle qui libère
  --    l'ancienne adresse email pour une nouvelle inscription.
  delete from auth.users where id = p_user_id;

  -- 4. Conservées en l'état : orders, order_items, subscriptions, invoices,
  --    payment_events, promo_redemptions. Ce sont des pièces comptables ou
  --    leur support direct.

  return v_utilisateur;
end;
$function$;
