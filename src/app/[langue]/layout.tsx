import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { LANGUES_INTERFACE, traduire, type LangueInterface } from '@/i18n';
import { Entete, PiedDePage } from '@/components/enveloppe';
import { EnteteV2, PiedDePageV2 } from '@/components/enveloppe/v2';
import { versionDesign } from '@/design/version';
import { sorteEnveloppe } from '@/design/enveloppe';
import { Bulles } from '@/components/v2/bulles';
import { DefilementSousHero } from '@/components/v2/defilement-sous-hero';
import { apercu } from '@/lib/orders/orders';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { identifierAppelant } from '@/lib/auth/session';
import type { Utilisateur } from '@/domain/api/contract';
import { getServerEnv } from '@/lib/config/env';
import { getClock } from '@/lib/clock';

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

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ L'ÉTAT DU PANIER EST RÉSOLU ICI, ET LE MONTANT VIENT DU SERVEUR.      │
  // │                                                                        │
  // │ La V2 écrit le montant dans l'en-tête, sur toutes les pages. Il vient  │
  // │ d'`apercu` — le module qu'emploie `PUT /api/orders` — et JAMAIS d'une  │
  // │ addition des lignes : le total dépend de la zone d'encaissement et     │
  // │ d'un éventuel code promo, que seule la commande connaît.               │
  // │                                                                        │
  // │ L'échec est silencieux et rend un panier vide : un en-tête qui tombe   │
  // │ emporterait toutes les pages du site avec lui.                         │
  // └────────────────────────────────────────────────────────────────────────┘
  const panier = await (async () => {
    if (!appelant || versionDesign() !== 'v2') return { nombre: 0, affichage: null };

    const vue = await apercu(appelant, { zoneAffichee: 'international' }).catch(() => null);
    if (!vue || vue.total.lignes.length === 0) return { nombre: 0, affichage: null };

    const formater = formateur(await lireDevise(vue.total.devise));
    return { nombre: vue.total.lignes.length, affichage: formater(vue.total.total) };
  })().catch(() => ({ nombre: 0, affichage: null }));

  if (versionDesign() === 'v2') {
    const sorte = sorteEnveloppe(chemin);

    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ NI BARRE NI PIED SUR L'AUTHENTIFICATION ET L'ADMINISTRATION.        │
     * │                                                                      │
     * │ Deux raisons distinctes, décidées dans `sorteEnveloppe` :            │
     * │                                                                      │
     * │   * les cinq écrans d'authentification n'ont qu'une tâche, et chaque │
     * │     élément qui ne la sert pas est une occasion de partir ailleurs   │
     * │     au moment précis où l'on demande un mot de passe ;               │
     * │                                                                      │
     * │   * l'administration a son propre rail : superposer l'en-tête public │
     * │     donnerait deux navigations concurrentes, et un pied commercial   │
     * │     sous un tableau de commandes.                                    │
     * │                                                                      │
     * │ Les bulles restent : elles ne gênent rien et tiennent la charte.     │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    if (sorte === 'nue') {
      return (
        <>
          <Bulles />
          <main id="contenu">{children}</main>
        </>
      );
    }

    return (
      <>
        <Bulles />

        <EnteteV2
          langue={courante}
          utilisateur={utilisateur}
          chemin={chemin}
          requete={requete}
          panier={panier}
          pose={sorte === 'transparente'}
        />

        {/*
         * Sur les pages INTÉRIEURES, la vue se place sous le bandeau de tête.
         * Jamais sur l'accueil : son hero est ce qu'on vient voir.
         */}
        {sorte === 'complete' ? <DefilementSousHero cible="[data-banniere]" /> : null}

        <main id="contenu">{children}</main>

        <PiedDePageV2
          langue={courante}
          chemin={chemin}
          requete={requete}
          annee={getClock().now().getFullYear()}
        />
      </>
    );
  }

  return (
    <>
      <Entete langue={courante} utilisateur={utilisateur} chemin={chemin} requete={requete} />
      <main id="contenu">{children}</main>
      {/*
       * L'année du bas de page vient de l'HORLOGE INJECTABLE, jamais d'une
       * lecture directe de l'heure du navigateur. La console de simulation
       * avance le temps pour éprouver les fins de période et la fenêtre de
       * trois mois des nouveautés ; un pied de page qui lirait l'heure du
       * système afficherait alors une année différente du reste du site.
       */}
      <PiedDePage
        langue={courante}
        chemin={chemin}
        requete={requete}
        annee={getClock().now().getFullYear()}
      />
    </>
  );
}
