-- ---------------------------------------------------------------------------
-- Le motif de revocation remonte jusqu'a l'utilisateur
--
-- +--------------------------------------------------------------------------+
-- | LA VICTIME D'UN VOL N'APPRENAIT RIEN.                                    |
-- |                                                                          |
-- | La detection de reutilisation fonctionnait, mais le message explicite     |
-- | partait a celui qui DECLENCHE la detection — c'est-a-dire, dans le seul   |
-- | scenario qui compte, au VOLEUR. Le titulaire legitime arrivait ensuite    |
-- | sur une lignee deja morte et recevait « session expiree », comme apres    |
-- | une simple deconnexion.                                                   |
-- |                                                                          |
-- | Il se reconnectait donc sans jamais savoir qu'il avait ete compromis, et  |
-- | sans changer son mot de passe. La detection etait techniquement juste et  |
-- | pratiquement inutile.                                                     |
-- +--------------------------------------------------------------------------+
--
-- `revoque_pour` etait deja stocke ; il n'etait simplement pas rendu. La
-- fonction ci-dessous est une EXTRACTION VERBATIM de la migration 0042,
-- obtenue par script : seule la colonne `motif` est ajoutee a la signature et
-- a chacun des cinq retours. `npm run diff:sql` le montre.
--
-- `drop` puis `create` : `create or replace` ne peut pas changer un type de
-- retour. Meme contrainte que `stats_langues` a l'etape 14.
-- ---------------------------------------------------------------------------

drop function if exists public.diagnostiquer_jeton_rafraichissement(text, integer);

create function public.diagnostiquer_jeton_rafraichissement(
  p_hash text,
  p_tolerance_secondes integer default 10
)
  returns table (etat text, user_id uuid, famille uuid, motif text)
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_ligne public.refresh_token_families;
begin
  select * into v_ligne
  from public.refresh_token_families f
  where f.jeton_hash = p_hash;

  if not found then
    return query select 'inconnu'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_ligne.revoque_le is not null then
    return query select 'revoque'::text, v_ligne.user_id, v_ligne.famille, v_ligne.revoque_pour;
    return;
  end if;

  if v_ligne.remplace_le is not null then
    if now() - v_ligne.remplace_le <= make_interval(secs => p_tolerance_secondes) then
      return query select 'course'::text, v_ligne.user_id, v_ligne.famille, null::text;
      return;
    end if;

    -- RÉUTILISATION. Toute la lignée tombe, y compris le jeton courant que
    -- détient peut-être la victime : c'est le prix, et il est volontaire.
    update public.refresh_token_families f
       set revoque_le = now(),
           revoque_pour = 'reutilisation'
     where f.famille = v_ligne.famille
       and f.revoque_le is null;

    return query select 'reutilisation'::text, v_ligne.user_id, v_ligne.famille, 'reutilisation'::text;
    return;
  end if;

  return query select 'valide'::text, v_ligne.user_id, v_ligne.famille, null::text;
end;
$$;

comment on function public.diagnostiquer_jeton_rafraichissement(text, integer) is
  'Diagnostique un jeton presente, REVOQUE la famille en cas de reutilisation hors tolerance, et rend le MOTIF de revocation. Le motif existe pour que la victime d''un vol l''apprenne, et non seulement celui qui a declenche la detection.';

revoke all on function public.diagnostiquer_jeton_rafraichissement(text, integer)
  from public, anon, authenticated;
grant execute on function public.diagnostiquer_jeton_rafraichissement(text, integer) to service_role;
