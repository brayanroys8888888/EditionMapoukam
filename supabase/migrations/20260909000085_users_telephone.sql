-- Ajoute la colonne `telephone` à la table `users`.
--
-- Le profil l'expose dans l'écran de compte (lecture et modification du numéro
-- de téléphone). La colonne est NULLABLE : un utilisateur n'est pas tenu de
-- renseigner son numéro.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telephone text;

COMMENT ON COLUMN public.users.telephone IS
  'Numéro de téléphone facultatif, modifiable par l''utilisateur depuis l''écran de compte.';
