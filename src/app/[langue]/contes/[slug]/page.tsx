import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { LANGUES_INTERFACE, langueValide, traduire } from '@/i18n';
import { ficheQuerySchema } from '@/domain/catalog/schemas';
import { lireFiche } from '@/lib/catalog/repository';
import { identifierAppelant } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/config/env';
import { PageFicheLivre } from '@/components/fiche';
import { FicheV2 } from '@/components/v2/fiche';
import { versionDesign } from '@/design/version';
import { ajouterAuPanier } from '../../panier/actions';

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
  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );

  return lireFiche(appelant?.id ?? null, slug, query);
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const { langue: langueBrute, slug } = await params;
  const langue = langueValide(langueBrute);

  const fiche = await charger(langueBrute, slug).catch(() => null);
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

  const fiche = await charger(langueBrute, slug);
  if (!fiche) notFound();

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

  if (versionDesign() === 'v2') {
    return (
      <>
        {structurees}
        <FicheV2
          langue={langue}
          fiche={fiche}
          actionAjout={ajouterAuPanier.bind(null, langue, fiche.id, langue)}
        />
      </>
    );
  }

  return (
    <PageFicheLivre
      langue={langue}
      fiche={fiche}
      actionAjout={ajouterAuPanier.bind(null, langue, fiche.id, langue)}
    >
      {structurees}
    </PageFicheLivre>
  );
}
