-- ---------------------------------------------------------------------------
-- Correctif de `admin_modifier_traduction` : la version doit appartenir au
-- titre qu'on dit modifier.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE QUE LA VERSION PRÉCÉDENTE LAISSAIT PASSER.                           │
-- │                                                                          │
-- │ Elle était clé par le seul `translation_id`. La route, elle, porte le     │
-- │ titre parent dans son chemin — `/api/admin/books/<id>/translations` —     │
-- │ et ne s'en servait donc pour RIEN : n'importe quelle version de           │
-- │ n'importe quel titre pouvait être modifiée depuis n'importe quelle        │
-- │ adresse.                                                                 │
-- │                                                                          │
-- │ Ce n'est pas une élévation de privilège : seuls les administrateurs y     │
-- │ accèdent, et ils peuvent de toute façon modifier tous les titres. C'est   │
-- │ une INCOHÉRENCE, et elle coûte deux choses réelles — un identifiant de    │
-- │ chemin qui ne veut rien dire finit par être rempli n'importe comment,     │
-- │ et le journal d'audit rattache la modification à un titre qui n'est pas   │
-- │ le bon.                                                                  │
-- │                                                                          │
-- │ La garde est posée EN BASE plutôt que dans la route : c'est le seul       │
-- │ endroit qu'un second appelant, écrit plus tard, ne pourra pas oublier.    │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- `drop` puis `create` : le nombre de paramètres change.

drop function if exists public.admin_modifier_traduction(uuid, uuid, text, text);

create function public.admin_modifier_traduction(
  p_acteur uuid,
  p_book_id uuid,
  p_translation_id uuid,
  p_titre text default null,
  p_resume text default null
)
  returns public.book_translations
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_traduction public.book_translations;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if p_titre is not null and btrim(p_titre) = '' then
    raise exception 'Le titre ne peut pas être vide.' using errcode = 'check_violation';
  end if;

  update public.book_translations
  set titre  = coalesce(nullif(btrim(p_titre), ''), titre),
      -- Le résumé peut être VIDÉ : passer une chaîne vide le remet à nul.
      -- C'est un champ facultatif, et l'éditeur doit pouvoir retirer un texte
      -- qu'il a écrit — ce que `coalesce` seul lui interdirait.
      resume = case when p_resume is null then resume
                    when btrim(p_resume) = '' then null
                    else btrim(p_resume) end,
      maj_le = public.app_now()
  where id = p_translation_id
    -- LA GARDE. Une version qui n'appartient pas à ce titre ne correspond à
    -- aucune ligne, et le `not found` ci-dessous répond « introuvable » — la
    -- même réponse qu'un identifiant inventé, qui ne dit donc rien de plus.
    and book_id = p_book_id
  returning * into v_traduction;

  if not found then
    raise exception 'Version % introuvable pour le titre %.', p_translation_id, p_book_id
      using errcode = 'no_data_found';
  end if;

  return v_traduction;
end;
$$;

comment on function public.admin_modifier_traduction(uuid, uuid, uuid, text, text) is
  'Corrige le titre et le résumé d''une version linguistique, à condition qu''elle appartienne au titre indiqué. Le slug n''est jamais modifiable : il est dans l''URL publique du conte.';

revoke all on function public.admin_modifier_traduction(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_modifier_traduction(uuid, uuid, uuid, text, text)
  to service_role;
