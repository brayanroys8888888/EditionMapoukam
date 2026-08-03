import type { MetadataRoute } from 'next';

import { LANGUES_INTERFACE } from '@/i18n';
import { slugsPublies } from '@/lib/catalog/repository';
import { getServerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logger';

/**
 * Plan de site — §5.4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ À LA RACINE, ET NON SOUS `[langue]` — CORRECTION DU PLAN.               │
 * │                                                                          │
 * │ `docs/PLAN-FRONTEND.md` situait ce fichier dans `src/app/[langue]/`.     │
 * │ Ç'aurait produit `/fr/sitemap.xml` et `/en/sitemap.xml`, deux adresses   │
 * │ qu'aucun moteur ne cherche — et le middleware livré en F2 tranche déjà   │
 * │ la question : il exclut `/sitemap.xml` et `/robots.txt` du préfixe de    │
 * │ langue, à la racine. Le code en vigueur fait foi sur le plan.            │
 * │                                                                          │
 * │ Un seul plan de site couvre les deux langues, chaque entrée portant ses  │
 * │ `alternates`. C'est la forme que la documentation des moteurs impose     │
 * │ pour que deux traductions ne se fassent pas concurrence.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Pages fixes, présentes dans les deux langues. */
const CHEMINS_FIXES = [
  '',
  '/catalogue',
  '/offres',
  '/a-propos',
  '/questions-frequentes',
  '/conditions-generales',
  '/confidentialite',
  '/contact',
] as const;

function alternates(base: string, chemin: string): { languages: Record<string, string> } {
  return {
    languages: Object.fromEntries(
      LANGUES_INTERFACE.map((code) => [code, `${base}/${code}${chemin}`]),
    ),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getServerEnv().NEXT_PUBLIC_APP_URL;
  const entrees: MetadataRoute.Sitemap = [];

  for (const langue of LANGUES_INTERFACE) {
    for (const chemin of CHEMINS_FIXES) {
      entrees.push({
        url: `${base}/${langue}${chemin}`,
        alternates: alternates(base, chemin),
      });
    }
  }

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ UN CATALOGUE ILLISIBLE NE DOIT PAS FAIRE TOMBER LE PLAN DE SITE.     │
  // │                                                                      │
  // │ Les pages fixes, elles, sont connues sans la base. Rendre un plan     │
  // │ partiel vaut mieux qu'une erreur : un moteur qui reçoit un 500 sur    │
  // │ `/sitemap.xml` cesse de le redemander pendant des jours.              │
  // └──────────────────────────────────────────────────────────────────────┘
  for (const langue of LANGUES_INTERFACE) {
    let titres: { slug: string; publie_le: string | null }[];
    try {
      titres = await slugsPublies(langue);
    } catch (erreur) {
      logger.warn('Plan de site sans les contes', { langue, detail: erreur });
      continue;
    }

    for (const titre of titres) {
      entrees.push({
        url: `${base}/${langue}/contes/${titre.slug}`,
        ...(titre.publie_le ? { lastModified: new Date(titre.publie_le) } : {}),
        alternates: alternates(base, `/contes/${titre.slug}`),
      });
    }
  }

  return entrees;
}

/**
 * Le plan de site est reconstruit à la demande, au plus une fois par heure.
 *
 * Le catalogue bouge à l'échelle de la semaine : le recalculer à chaque
 * passage d'un robot ferait payer une lecture complète de la base pour un
 * résultat identique.
 */
export const revalidate = 3600;
