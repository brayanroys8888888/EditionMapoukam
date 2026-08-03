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

/**
 * Code à usage unique reçu par email.
 *
 * Les espaces sont retirés avant le contrôle : un code copié depuis un client
 * de messagerie arrive souvent sous la forme « 565 333 », et refuser une saisie
 * juste pour cette seule raison est un défaut d'accueil, pas une sécurité.
 */
const codeUsageUnique = z
  .string()
  .trim()
  .transform((valeur) => valeur.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Le code doit comporter six chiffres.'));

/**
 * Les deux usages du code, et il n'y en aura pas d'autre par ce chemin.
 *
 * L'énumération est FERMÉE délibérément : `verifyOtp` accepte aussi des types
 * liés au changement d'adresse email, qu'un client ne doit pas pouvoir
 * déclencher en choisissant lui-même la valeur.
 */
export const TYPES_CODE = ['signup', 'recovery'] as const;
export type TypeCode = (typeof TYPES_CODE)[number];

export const echangeCodeSchema = z.object({
  email,
  code: codeUsageUnique,
  type: z.enum(TYPES_CODE),
});

export type Inscription = z.infer<typeof inscriptionSchema>;
export type Connexion = z.infer<typeof connexionSchema>;
export type DemandeReinitialisation = z.infer<typeof demandeReinitialisationSchema>;
export type ChangementMotDePasse = z.infer<typeof changementMotDePasseSchema>;
export type EchangeCode = z.infer<typeof echangeCodeSchema>;
