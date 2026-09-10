import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { LANGUES_INTERFACE, langueValide, traduire } from '@/i18n';
import { ficheQuerySchema } from '@/domain/catalog/schemas';
import { lireFiche } from '@/lib/catalog/repository';
import { lireAvis } from '@/lib/catalog/avis';
import { lirePlanches } from '@/lib/content/planches';
import { identifierAppelantAvecCookies } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/config/env';
import { PageFicheLivre } from '@/components/fiche';
import { FicheV2 } from '@/components/v2/fiche';
import { structureRefondue } from '@/design/version';
import { ajouterAuPanier } from '../../panier/actions';
import { deposerAvis, retirerAvis } from './actions';

/**
 * Fiche d'un conte — §4.1 F3.
 *
 * Rendue côté serveur, et appelant `lireFiche` — le module qu'emploie déjà
 * `/api/catalog/[slug]`. Un brouillon, un titre archivé et un slug inconnu
 * produisent tous un 404 : du point de vue d'un visiteur, ces trois cas
 * doivent se ressembler, faute de quoi le catalogue à venir serait devinable
 * un slug à la fois.
 */
interface Parametres {
  params: Promise<{ langue: string; slug: string }>;
}

const SLUG_VALIDE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function charger(langueBrute: string, slug: string) {
  const langue = langueValide(langueBrute);
  if (!SLUG_VALIDE.test(slug)) return null;

  const query = ficheQuerySchema.parse({ langue });
  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );

  const fiche = await lireFiche(appelant?.id ?? null, slug, query);

  /*
   * L'APPELANT EST RENDU AVEC LA FICHE.
   *
   * `generateMetadata` et le rendu appellent tous deux `charger`, et
   * l'identification coûte deux allers-retours. La rendre plutôt que de la
   * refaire évite d'en payer un troisième au moment de lire les avis.
   */
  return { fiche, appelant };
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const { langue: langueBrute, slug } = await params;
  const langue = langueValide(langueBrute);

  const fiche = (await charger(langueBrute, slug).catch(() => null))?.fiche ?? null;
  if (!fiche) return { title: traduire(langue, 'pages.introuvableTitre') };

  const base = getServerEnv().NEXT_PUBLIC_APP_URL;

  return {
    title: fiche.titre,
    description: fiche.resume ?? traduire(langue, 'marque.baseline'),
    alternates: {
      canonical: `${base}/${langue}/contes/${fiche.slug}`,
      // Les deux traductions d'un même conte ne doivent pas se faire
      // concurrence dans les moteurs : sans `hreflang`, une seule est indexée,
      // et rarement celle qu'on aurait choisie (§5.4).
      languages: Object.fromEntries(
        LANGUES_INTERFACE.map((code) => [code, `${base}/${code}/contes/${fiche.slug}`]),
      ),
    },
    openGraph: {
      title: fiche.titre,
      ...(fiche.resume ? { description: fiche.resume } : {}),
      ...(fiche.couverture ? { images: [fiche.couverture.fiche] } : {}),
    },
  };
}

export default async function PageFiche({ params }: Parametres) {
  const { langue: langueBrute, slug } = await params;
  const langue = langueValide(langueBrute);

  const charge = await charger(langueBrute, slug);
  if (!charge?.fiche) notFound();

  const { fiche, appelant } = charge;

  /*
   * LES AVIS SONT LUS AVEC LE JETON DE L'APPELANT.
   *
   * `lireAvis` interroge `book_reviews` par le client de l'utilisateur : les
   * deux politiques de lecture de la table s'appliquent donc — les avis
   * publiés pour tout le monde, plus le sien quel que soit son statut. Aucun
   * `where` écrit ici ne décide de ce qui est visible.
   *
   * Ne lève jamais : une fiche doit s'afficher même sans ses avis.
   */
  const avis = await lireAvis(
    fiche.id,
    appelant ? { id: appelant.id, accessToken: appelant.accessToken } : null,
  );

  /*
   * La MÉTHODE — dépôt ou correction — est décidée ICI, sur la présence d'un
   * avis existant, et jamais transmise par le client : un lecteur n'a qu'un
   * avis par titre, et lui demander de savoir dans quel état il se trouve
   * serait lui faire porter une règle qui n'est pas la sienne.
   */
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LES PLANCHES NE SONT CHARGÉES QUE POUR UN LIVRET.                    │
   * │                                                                      │
   * │ Elles coûtent un aller-retour par page, plus une signature. Sur un    │
   * │ conte, la fiche montre sa couverture et n'en a aucun usage : les      │
   * │ demander quand même ferait payer huit requêtes à chaque affichage de  │
   * │ chaque titre du catalogue, pour un résultat jeté.                     │
   * │                                                                      │
   * │ Le contrôle des droits reste entier : `lirePlanches` passe par        │
   * │ `servirPage`, qui consulte `getAccess` avant de lire quoi que ce      │
   * │ soit. Un visiteur sans droit reçoit son extrait, et rien de plus.     │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const planches =
    fiche.type_document === 'livret_pedagogique'
      ? await lirePlanches(appelant?.id ?? null, fiche.id, langue)
      : undefined;

  const actionAvis = deposerAvis.bind(null, langue, fiche.id, fiche.slug, avis.mien !== null);
  const actionRetraitAvis = retirerAvis.bind(null, langue, fiche.id, fiche.slug);

  const base = getServerEnv().NEXT_PUBLIC_APP_URL;

  /**
   * Schema.org — décrit le conte aux moteurs.
   *
   * Aucun prix n'y figure. Il dépend de la zone du visiteur et, pour un titre
   * possédé, ne s'affiche même pas : le publier dans une donnée structurée
   * mise en cache par les moteurs le figerait pour tout le monde.
   */
  const donneesStructurees = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: fiche.titre,
    author: { '@type': 'Person', name: fiche.auteur },
    inLanguage: fiche.langues,
    url: `${base}/${langue}/contes/${fiche.slug}`,
    ...(fiche.resume ? { description: fiche.resume } : {}),
    ...(fiche.illustrateur
      ? { illustrator: { '@type': 'Person', name: fiche.illustrateur } }
      : {}),
    ...(fiche.nb_pages !== null ? { numberOfPages: fiche.nb_pages } : {}),
    ...(fiche.couverture ? { image: fiche.couverture.fiche } : {}),
  };

  const structurees = (
    <script
      type="application/ld+json"
      // Sérialisé par `JSON.stringify` depuis un objet construit ici : aucune
      // chaîne venue du client n'y entre.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(donneesStructurees) }}
    />
  );

  if (structureRefondue()) {
    return (
      <>
        {structurees}
        <FicheV2
          langue={langue}
          fiche={fiche}
          avis={avis}
          {...(planches ? { planches } : {})}
          connecte={appelant !== null}
          actionAjout={ajouterAuPanier.bind(null, langue, fiche.id, langue)}
          actionAvis={actionAvis}
          actionRetraitAvis={actionRetraitAvis}
        />
      </>
    );
  }

  return (
    <PageFicheLivre
      langue={langue}
      fiche={fiche}
      avis={avis}
      connecte={appelant !== null}
      actionAjout={ajouterAuPanier.bind(null, langue, fiche.id, langue)}
      actionAvis={actionAvis}
      actionRetraitAvis={actionRetraitAvis}
    >
      {structurees}
    </PageFicheLivre>
  );
}
