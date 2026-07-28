import { z } from 'zod';

/**
 * Schémas de validation des entrées d'authentification.
 *
 * La politique de mot de passe est fixée à deux endroits : ici, pour expliquer
 * le refus en français, et dans `supabase/config.toml`, pour que Supabase Auth
 * l'applique aussi lorsqu'il est sollicité par un autre chemin. Les deux
 * doivent rester cohérents — un test le vérifie.
 */
export const LONGUEUR_MOT_DE_PASSE_MIN = 10;

const email = z
  .string()
  .trim()
  .min(1, 'L’adresse email est obligatoire.')
  .max(254, 'L’adresse email est trop longue.')
  .pipe(z.email('Adresse email invalide.'))
  .transform((valeur) => valeur.toLowerCase());

const motDePasse = z
  .string()
  .min(LONGUEUR_MOT_DE_PASSE_MIN, `Le mot de passe doit faire au moins ${String(LONGUEUR_MOT_DE_PASSE_MIN)} caractères.`)
  .max(72, 'Le mot de passe ne peut pas dépasser 72 caractères.')
  .refine((valeur) => /[a-zA-Z]/.test(valeur), 'Le mot de passe doit contenir au moins une lettre.')
  .refine((valeur) => /\d/.test(valeur), 'Le mot de passe doit contenir au moins un chiffre.');

export const inscriptionSchema = z.object({
  email,
  password: motDePasse,
  nom_complet: z.string().trim().min(1).max(120).optional(),
  langue_preferee: z.enum(['fr', 'en']).optional(),
});

export const connexionSchema = z.object({
  email,
  // Pas de contrainte de robustesse à la connexion : un mot de passe créé sous
  // une politique plus ancienne doit rester utilisable, et détailler la règle
  // ici renseignerait un attaquant sur le format attendu.
  password: z.string().min(1, 'Le mot de passe est obligatoire.'),
});

export const demandeReinitialisationSchema = z.object({
  email,
});

export const changementMotDePasseSchema = z.object({
  password: motDePasse,
});

export type Inscription = z.infer<typeof inscriptionSchema>;
export type Connexion = z.infer<typeof connexionSchema>;
export type DemandeReinitialisation = z.infer<typeof demandeReinitialisationSchema>;
export type ChangementMotDePasse = z.infer<typeof changementMotDePasseSchema>;
