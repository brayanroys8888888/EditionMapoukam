-- 0002 — Horloge de la base : app_now()
--
-- docs/PLAN.md §2.5. Le moteur de droits est une fonction PostgreSQL appelée
-- par les politiques RLS. Une politique RLS ne reçoit aucun paramètre
-- applicatif : il faut donc un pont entre l'horloge injectée côté Node et le
-- SQL. Ce pont est un paramètre de session, `app.now`.
--
-- Trois durcissements, exigés par la validation du plan :
--
--   (a) L'override n'est honoré QUE si l'artefact d'activation existe en base.
--       La table ci-dessous est créée par migration, mais la LIGNE n'est
--       insérée que par supabase/seed.sql, c'est-à-dire uniquement en
--       développement. Sur une base de production, la table est vide et
--       app_now() vaut now(), quel que soit l'état du code applicatif.
--
--   (b) `app.now` n'est jamais dérivé d'une entrée utilisateur : ni en-tête
--       HTTP, ni paramètre de requête, ni cookie. Sa seule source est le
--       DevClock, un état détenu par le serveur et modifié par la console /dev.
--       Un test parcourt les sources et échoue si la chaîne « app.now »
--       apparaît hors du module autorisé.
--
--   (c) Un test positionne `app.now` SANS l'artefact et vérifie que app_now()
--       renvoie bien l'heure réelle.

create table public.dev_clock_activation (
  id smallint primary key default 1 check (id = 1),
  note text not null,
  active_le timestamptz not null default now()
);

comment on table public.dev_clock_activation is
  'Artefact d''activation de l''horloge simulée. Créée vide par migration ; la ligne unique n''est insérée QUE par le seed de développement. Sur une base de production, cette table doit rester vide.';

-- `security definer` : la fonction est appelée depuis des politiques RLS
-- évaluées en tant qu'`anon` ou `authenticated`, qui n'ont aucun droit de
-- lecture sur l'artefact d'activation. Sans cela, l'horloge simulée serait
-- inopérante pour un visiteur non authentifié.
create function public.app_now()
  returns timestamptz
  language plpgsql
  stable
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_override text;
begin
  if not exists (select 1 from public.dev_clock_activation) then
    return now();
  end if;

  v_override := nullif(current_setting('app.now', true), '');
  if v_override is null then
    return now();
  end if;

  return v_override::timestamptz;
exception
  when others then
    -- Une valeur illisible ne doit jamais faire tomber une politique RLS :
    -- on retombe sur l'heure réelle, qui est le comportement sûr.
    return now();
end;
$$;

comment on function public.app_now() is
  'Instant courant vu par la logique métier. Renvoie now(), sauf si l''artefact dev_clock_activation existe ET que le paramètre de session app.now est positionné. Voir docs/PLAN.md §2.5.';

revoke all on function public.app_now() from public;
grant execute on function public.app_now() to anon, authenticated, service_role;
