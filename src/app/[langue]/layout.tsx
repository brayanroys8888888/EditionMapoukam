import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { LANGUES_INTERFACE, traduire, type LangueInterface } from '@/i18n';
import { Entete, PiedDePage } from '@/components/enveloppe';
import { identifierAppelant } from '@/lib/auth/session';
import type { Utilisateur } from '@/domain/api/contract';
import { getServerEnv } from '@/lib/config/env';

/**
 * Enveloppe d'une langue.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉTAT DE CONNEXION EST RÉSOLU ICI, UNE FOIS, CÔTÉ SERVEUR.            │
 * │                                                                          │
 * │ Chaque écran pourrait interroger `/api/auth/me`, et chacun le ferait     │
 * │ différemment : une requête de plus par page, des états divergents entre  │
 * │ l'en-tête et le contenu, et un clignotement entre « Se connecter » et le │
 * │ menu de compte à chaque navigation.                                      │
 * │                                                                          │
 * │ L'enveloppe le résout une fois et le transmet. Le profil est relu EN     │
 * │ BASE — `identifierAppelant` ne fait jamais confiance au jeton seul.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les langues connues deviennent des routes statiques. */
export function generateStaticParams(): { langue: string }[] {
  return LANGUES_INTERFACE.map((langue) => ({ langue }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ langue: string }>;
}): Promise<Metadata> {
  const { langue } = await params;
  if (!LANGUES_INTERFACE.includes(langue as LangueInterface)) return {};

  const courante = langue as LangueInterface;
  const base = getServerEnv().NEXT_PUBLIC_APP_URL;

  return {
    title: {
      default: traduire(courante, 'marque.nom'),
      // Chaque page complète ce gabarit : le nom de marque figure sur tous les
      // onglets sans que chaque page ait à le répéter.
      template: `%s — ${traduire(courante, 'marque.nom')}`,
    },
    description: traduire(courante, 'marque.baseline'),
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ `hreflang` — §5.4.                                                 │
    // │                                                                    │
    // │ Sans ces balises, les deux versions d'une même page se font         │
    // │ concurrence dans les moteurs, qui n'en indexent qu'une — et c'est   │
    // │ rarement celle qu'on aurait choisie. `x-default` désigne la version │
    // │ servie à qui n'exprime aucune préférence.                          │
    // └────────────────────────────────────────────────────────────────────┘
    alternates: {
      languages: {
        ...Object.fromEntries(LANGUES_INTERFACE.map((code) => [code, `${base}/${code}`])),
        'x-default': `${base}/fr`,
      },
    },
  };
}

export default async function EnveloppeLangue({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ langue: string }>;
}) {
  const { langue } = await params;

  // Une langue inconnue est un 404, jamais un repli silencieux : `/de/catalogue`
  // ne doit pas servir le français sous une adresse allemande, ce qui ferait
  // indexer un contenu français comme allemand.
  if (!LANGUES_INTERFACE.includes(langue as LangueInterface)) notFound();
  const courante = langue as LangueInterface;

  const entetes = await headers();
  // Posé par le middleware, qui connaît l'URL réelle. `headers()` ne la porte
  // pas en propre, et le sélecteur de langue doit préserver la page courante.
  const chemin = entetes.get('x-chemin') ?? `/${courante}`;
  const requete = entetes.get('x-requete') ?? '';

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: entetes }),
  );

  const utilisateur: Utilisateur | null = appelant
    ? {
        id: appelant.id,
        email: appelant.email,
        role: appelant.role,
        langue_preferee: appelant.langue_preferee,
      }
    : null;

  return (
    <>
      <Entete langue={courante} utilisateur={utilisateur} chemin={chemin} requete={requete} />
      <main id="contenu">{children}</main>
      <PiedDePage langue={courante} chemin={chemin} requete={requete} />
    </>
  );
}
