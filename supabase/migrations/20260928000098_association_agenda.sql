-- ---------------------------------------------------------------------------
-- L'ASSOCIATION DAVE — l'agenda et les inscriptions.
--
-- Ateliers, séminaires en ligne et formations. Un adhérent s'y inscrit depuis
-- son espace ; l'équipe les crée et voit la liste des inscrits.
-- ---------------------------------------------------------------------------

create type public.type_evenement as enum (
  'atelier_presentiel',
  'seminaire_en_ligne',
  'formation_enseignants'
);

create table public.association_events (
  id uuid primary key default gen_random_uuid(),
  type_evenement public.type_evenement not null,
  titre text not null check (length(btrim(titre)) > 0),
  description text not null default '',

  debut_le timestamptz not null,

  -- Le lieu pour un présentiel, le lien pour un séminaire en ligne. Jamais
  -- les deux : une contrainte le dit plutôt qu'une convention orale.
  lieu text,
  lien text,

  /*
   * Le nombre de places. Toujours renseigné : « illimité » se dit avec un
   * grand nombre, et laisser `null` obligerait chaque écran à décider
   * lui-même ce qu'une place absente veut dire.
   */
  places smallint not null check (places > 0),

  publics public.public_association[] not null default '{}',

  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now(),

  /*
   * Un séminaire EN LIGNE n'a pas de lieu, un atelier en PRÉSENTIEL n'a pas
   * de lien. La contrainte porte la règle : sans elle, un écran afficherait
   * « En ligne » sous une adresse de salle, et personne ne saurait laquelle
   * des deux croire.
   */
  constraint association_events_lieu_ou_lien check (
    case
      when type_evenement = 'seminaire_en_ligne' then lieu is null
      else lien is null
    end
  )
);

create index association_events_prochains_idx on public.association_events (debut_le);

comment on table public.association_events is
  'Les ateliers, séminaires et formations de l''association. Réservés aux adhérents : la lecture passe par `abonnement_ouvre_droit`.';
comment on column public.association_events.lien is
  'Le lien de connexion d''un séminaire. NON LISIBLE hors fonction : il vaut une place, et il se recopie.';

-- ---------------------------------------------------------------------------
-- Les inscriptions
-- ---------------------------------------------------------------------------

create table public.association_event_registrations (
  event_id uuid not null references public.association_events (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  inscrit_le timestamptz not null default public.app_now(),

  primary key (event_id, user_id)
);

comment on table public.association_event_registrations is
  'Une ligne par inscription. La clé primaire porte l''unicité : un adhérent ne s''inscrit pas deux fois au même atelier, et aucun écran n''a à le vérifier.';

-- L'atelier dont un contenu rend compte — la colonne attendait sa table.
alter table public.association_contents
  add constraint association_contents_evenement_fkey
    foreign key (evenement_id) references public.association_events (id) on delete set null;

/*
 * `set null` et non `cascade` : effacer un atelier ne doit pas effacer le
 * compte rendu qui en parle. Le texte garde sa valeur quand l'événement
 * disparaît du calendrier — c'est même à ce moment-là qu'il devient la seule
 * trace de ce qui s'est passé.
 */

-- ---------------------------------------------------------------------------
-- RLS — refus par défaut, et une seule implémentation du droit
-- ---------------------------------------------------------------------------

alter table public.association_events enable row level security;
alter table public.association_event_registrations enable row level security;

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA POLITIQUE APPELLE `abonnement_ouvre_droit`, ELLE NE LA RECOPIE PAS.  │
 * │                                                                          │
 * │ C'est la règle structurante du dépôt : l'application et les politiques   │
 * │ RLS interrogent la MÊME fonction. Une politique qui comparerait          │
 * │ elle-même `statut` et `fin_periode` serait une seconde implémentation du │
 * │ droit d'accès — et le jour où la première changerait, c'est la copie     │
 * │ qui aurait l'air d'avoir raison.                                         │
 * │                                                                          │
 * │ Le domaine est écrit `association` : un abonné LECTURE n'entre pas ici.  │
 * │ C'est l'étanchéité de §3.6, et elle se perd en retirant ce mot.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
create policy association_events_lecture_adherents on public.association_events
  for select to authenticated
  using (public.abonnement_ouvre_droit(auth.uid(), 'association'));

/*
 * `anon` n'a AUCUNE politique, et c'est le refus voulu : l'agenda est un
 * contenu réservé. La page publique de l'association n'en montre rien.
 */

create policy association_inscriptions_les_siennes on public.association_event_registrations
  for select to authenticated
  using (user_id = auth.uid());

/*
 * S'inscrire et se désinscrire sont des gestes de l'adhérent lui-même. Deux
 * conditions, et les deux comptent : c'est SA ligne (`user_id = auth.uid()`),
 * et son adhésion ouvre le droit. Sans la seconde, un compte dont l'adhésion
 * a expiré garderait la main sur les inscriptions.
 */
create policy association_inscriptions_sinscrire on public.association_event_registrations
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.abonnement_ouvre_droit(auth.uid(), 'association')
  );

create policy association_inscriptions_se_desinscrire on public.association_event_registrations
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Les privilèges de colonne — le lien d'un séminaire n'est pas dans la liste
-- ---------------------------------------------------------------------------

/*
 * Même modèle que `corps` et `fichier_pdf` : la liste est explicite, et ce
 * qui n'y figure pas est refusé avant qu'une ligne soit lue. Le `lien` d'un
 * séminaire vaut une place — il se recopie et se transmet.
 *
 * Le chemin légitime est l'e-mail envoyé aux INSCRITS une heure avant.
 */
grant select (
  id, type_evenement, titre, description, debut_le, lieu, places, publics,
  cree_le, maj_le
) on public.association_events to authenticated;

grant select, insert, delete on public.association_event_registrations to authenticated;

-- ---------------------------------------------------------------------------
-- Les places restantes — comptées en base, jamais dans un écran
-- ---------------------------------------------------------------------------

/*
 * Deux écrans qui compteraient chacun de leur côté finiraient par ne pas dire
 * la même chose — et celui qui se trompe est toujours celui qui annonce une
 * place libre. La fonction est `stable` : elle lit, elle ne décide pas.
 */
create or replace function public.association_places_restantes(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select greatest(
    0,
    (select e.places from public.association_events e where e.id = p_event_id)
    - (select count(*) from public.association_event_registrations r where r.event_id = p_event_id)
  )::integer;
$$;

grant execute on function public.association_places_restantes(uuid) to authenticated;

comment on function public.association_places_restantes(uuid) is
  'Places encore libres. UNIQUE implémentation : aucun écran ne soustrait lui-même, sinon deux écrans annonceraient deux nombres.';
