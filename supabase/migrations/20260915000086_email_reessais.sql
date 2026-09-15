-- 0086 — Nouvelles tentatives d'envoi des emails.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UN ÉCHEC D'ENVOI N'EST PLUS DÉFINITIF DÈS LE PREMIER ESSAI.             │
-- │                                                                          │
-- │ `marquer_email` (0041) passait un email à `echoue` au premier échec, et  │
-- │ `emails_a_envoyer` ne reprend que les emails `en_attente` : une panne    │
-- │ passagère du serveur de messagerie perdait l'email pour de bon. C'est    │
-- │ arrivé en production le 15 septembre 2026 à une confirmation de         │
-- │ commande payée. L'en-tête de `src/lib/emails/file.ts` promettait         │
-- │ pourtant qu'un email en échec « partira au prochain vidage ».            │
-- │                                                                          │
-- │ Décision du propriétaire, 15 septembre 2026 : un email en échec reste    │
-- │ `en_attente`, et n'est abandonné (`echoue`) qu'à sa CINQUIÈME tentative. │
-- │ Au-delà, l'échec est durable — une adresse invalide, un expéditeur       │
-- │ refusé — et le retenter indéfiniment ne ferait qu'user le quota.         │
-- │                                                                          │
-- │ La règle vit ICI, et nulle part ailleurs : `viderFile` se contente de    │
-- │ rapporter le succès ou l'échec d'un envoi.                               │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Dans un UPDATE, chaque expression du SET lit la ligne AVANT modification :
-- `tentatives + 1` est donc bien le numéro de la tentative qu'on marque.

create or replace function public.marquer_email(
  p_id uuid,
  p_envoye boolean,
  p_erreur text default null
)
  returns void
  language sql
  security definer
  set search_path = public, pg_temp
as $$
  update public.email_outbox
  set statut = case
                 when p_envoye then 'envoye'::public.email_statut
                 when tentatives + 1 >= 5 then 'echoue'::public.email_statut
                 else 'en_attente'::public.email_statut
               end,
      tentatives = tentatives + 1,
      derniere_erreur = p_erreur,
      envoye_le = case when p_envoye then public.app_now() else envoye_le end
  where id = p_id;
$$;

comment on function public.marquer_email(uuid, boolean, text) is
  'Marque le résultat d''un envoi. Un échec laisse l''email en attente, sauf à la cinquième tentative, où il passe à echoue (migration 0086).';

revoke all on function public.marquer_email(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.marquer_email(uuid, boolean, text) to service_role;
