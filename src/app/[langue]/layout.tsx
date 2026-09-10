import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { LANGUES_INTERFACE, traduire, type LangueInterface } from '@/i18n';
import { Entete, PiedDePage } from '@/components/enveloppe';
import { EnteteV2, PiedDePageV2 } from '@/components/enveloppe/v2';
import { BarreOngletsV3, BarreUtilitaireV3, ReserveOngletsV3 } from '@/components/enveloppe/v3';
import { estV3, structureRefondue } from '@/design/version';
import { sorteEnveloppe } from '@/design/enveloppe';
import { Bulles } from '@/components/v2/bulles';
import { Toaster } from '@/components/toast';
import { SynchronisationPanier } from '@/components/panier/synchronisation';
import { DefilementSousHero } from '@/components/v2/defilement-sous-hero';
import { apercu } from '@/lib/orders/orders';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { identifierAppelantAvecCookies } from '@/lib/auth/session';
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

  const appelant = await identifierAppelantAvecCookies(
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
    if (!appelant || !structureRefondue()) return { nombre: 0, affichage: null };

    const vue = await apercu(appelant, { zoneAffichee: 'international' }).catch(() => null);
    if (!vue || vue.total.lignes.length === 0) return { nombre: 0, affichage: null };

    const formater = formateur(await lireDevise(vue.total.devise));
    return { nombre: vue.total.lignes.length, affichage: formater(vue.total.total) };
  })().catch(() => ({ nombre: 0, affichage: null }));

  if (structureRefondue()) {
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

        {/*
         * ┌──────────────────────────────────────────────────────────────────┐
         * │ LA BARRE UTILITAIRE N'EXISTE QUE SOUS LA V3.                    │
         * │                                                                  │
         * │ Elle porte le commutateur de thème, et la V2 n'a pas de thème    │
         * │ sombre : lui poser la barre donnerait un bouton qui ne fait      │
         * │ rien. `themeValide` rend d'ailleurs `null` hors V3 — les deux    │
         * │ conditions disent la même chose, à deux étages.                  │
         * └──────────────────────────────────────────────────────────────────┘
         */}
        {estV3() ? <BarreUtilitaireV3 langue={courante} chemin={chemin} requete={requete} /> : null}

        <EnteteV2
          langue={courante}
          utilisateur={utilisateur}
          chemin={chemin}
          requete={requete}
          panier={panier}
          /*
           * ┌──────────────────────────────────────────────────────────────┐
           * │ SOUS LA V3, L'EN-TÊTE N'EST JAMAIS SUPERPOSÉ.               │
           * │                                                              │
           * │ La V2 le pose en `position: fixed` par-dessus le hero. Avec  │
           * │ une barre utilitaire au-dessus, il la RECOUVRE — le thème et │
           * │ la langue deviennent invisibles sur l'accueil, c'est-à-dire  │
           * │ sur l'écran d'arrivée.                                       │
           * │                                                              │
           * │ Organic ne superpose pas : `02-layout-responsive.md` décrit   │
           * │ un en-tête COLLANT et translucide, sous une barre utilitaire  │
           * │ qui défile. Le hero y est un bandeau de fond doux, pas une    │
           * │ image pleine que l'en-tête viendrait habiter.                 │
           * └──────────────────────────────────────────────────────────────┘
           */
          pose={!estV3() && sorte === 'transparente'}
        />

        {/*
         * ┌──────────────────────────────────────────────────────────────────┐
         * │ SOUS ORGANIC, LA PAGE NE SAUTE PLUS SOUS SA PROPRE BANNIÈRE.    │
         * │                                                                  │
         * │ Sur les pages intérieures de la V2, la vue se plaçait sous le    │
         * │ bandeau de tête : celui-ci était un aplat vert décoratif portant │
         * │ un titre redondant, et le passer faisait gagner un écran.        │
         * │                                                                  │
         * │ La bannière d'Organic n'est pas ce bandeau-là. Elle porte le fil │
         * │ d'Ariane, le titre de l'écran, sa description et les deux        │
         * │ comptes du catalogue — tout ce qui dit OÙ L'ON EST. La sauter    │
         * │ revient à ouvrir une page déjà défilée de 365 px, mesurés, sans  │
         * │ que rien n'explique pourquoi le haut manque.                     │
         * │                                                                  │
         * │ Le composant reste monté pour la V2, dont la bannière n'a pas    │
         * │ changé de rôle.                                                  │
         * └──────────────────────────────────────────────────────────────────┘
         */}
        {sorte === 'complete' && !estV3() ? (
          <DefilementSousHero cible="[data-banniere]" />
        ) : null}

        <main id="contenu">{children}</main>

        <PiedDePageV2
          langue={courante}
          chemin={chemin}
          requete={requete}
          annee={getClock().now().getFullYear()}
        />

        {/*
         * La réserve vient APRÈS le pied, et la barre après elle : sur écran
         * étroit, le dernier élément atteignable doit être le pied de page,
         * pas la première ligne qu'une barre flottante recouvre.
         */}
        {estV3() ? (
          <>
            <ReserveOngletsV3 />
            <BarreOngletsV3 langue={courante} chemin={chemin} panier={panier} />
          </>
        ) : null}

        {/*
         * ┌──────────────────────────────────────────────────────────────────┐
         * │ LE TOAST EST MONTÉ UNE FOIS, ET IL VIT DANS L'ENVELOPPE.        │
         * │                                                                  │
         * │ Sa région `aria-live` doit exister AVANT le message : un lecteur │
         * │ d'écran surveille des régions déjà présentes, et n'annonce pas   │
         * │ une région qui apparaît avec son texte. Le poser dans l'écran    │
         * │ qui déclenche le message serait donc l'annoncer à personne.      │
         * └──────────────────────────────────────────────────────────────────┘
         */}
        <Toaster langue={courante} />

        {/* Deux onglets ouverts, un seul panier — voir l'encadré du module. */}
        <SynchronisationPanier />
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
       * avance le temps pour éprouver les fins de période et les périodes
       * de grâce ; un pied de page qui lirait l'heure du
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
