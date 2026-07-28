-- 0004 — Comptes utilisateurs (§8.1 `users`)
--
-- La table porte le nom de la spécification, `users`, et non `profiles`. Elle
-- est adossée à `auth.users`, qui reste la source de vérité de
-- l'authentification. `public.users` porte les données métier.
--
-- CLAUDE.md règle 7 — AUCUNE DONNÉE D'ENFANT. Le compte appartient au parent
-- adulte. Aucun prénom, âge ou date de naissance d'enfant nulle part. Cette
-- table ne doit jamais en accueillir : c'est une contrainte de conformité
-- (RGPD, COPPA — §11.2), pas une préférence de modélisation.

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  nom_complet text,
  langue_preferee text not null default 'fr' check (langue_preferee in ('fr', 'en')),
  role public.user_role not null default 'user',
  -- §4.3 F11 — suspension d'un compte par un administrateur.
  suspendu boolean not null default false,
  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now()
);

comment on table public.users is
  'Comptes utilisateurs. Le compte appartient au parent adulte : aucune donnée d''enfant n''est collectée (CLAUDE.md règle 7, spécification §11.2).';
comment on column public.users.role is
  'Rôle applicatif. Non modifiable par l''utilisateur : le privilège UPDATE de cette colonne n''est accordé à personne d''autre que service_role.';
comment on column public.users.suspendu is
  'Suspension administrative (§4.3 F11). Non modifiable par l''utilisateur.';

create index users_role_idx on public.users (role) where role = 'admin';

-- Création automatique du profil à l'inscription.
--
-- `security definer` : le déclencheur s'exécute dans le contexte de gotrue,
-- qui n'a aucun droit d'écriture sur `public.users`.
create function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, nom_complet, langue_preferee)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'nom_complet', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'langue_preferee', ''), 'fr')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crée le profil métier à l''inscription. Le rôle vaut toujours `user` : il n''est jamais lu depuis les métadonnées fournies par le client, qui sont sous son contrôle.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Vérité de l'adresse email : elle vit dans auth.users. On la recopie ici pour
-- les recherches d'administration, en la maintenant synchronisée.
create function public.handle_user_email_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.users set email = new.email, maj_le = public.app_now() where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  execute function public.handle_user_email_change();

-- Test d'appartenance au rôle administrateur.
--
-- `security definer` est indispensable : cette fonction est appelée depuis les
-- politiques RLS de `public.users` elle-même. Sans contournement de RLS, la
-- politique s'appellerait récursivement.
create function public.is_admin(p_user uuid default auth.uid())
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
    where u.id = p_user
      and u.role = 'admin'
      and u.suspendu = false
  );
$$;

comment on function public.is_admin(uuid) is
  'Vrai si l''utilisateur est administrateur et non suspendu. security definer pour éviter la récursion des politiques RLS de public.users.';

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated, service_role;
