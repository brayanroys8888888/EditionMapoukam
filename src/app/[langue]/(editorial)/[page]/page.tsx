import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LANGUES_INTERFACE, langueValide, traduire } from '@/i18n';
import {
  PAGES_EDITORIALES,
  lirePageEditoriale,
  type SlugEditorial,
} from '@/content/editorial';
import { getServerEnv } from '@/lib/config/env';
import { CorpsEditorial } from '@/components/editorial';

/**
 * Pages éditoriales — §4.1 F8 à F12.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL GABARIT POUR LES CINQ PAGES.                                    │
 * │                                                                          │
 * │ Elles ont la même forme — un titre, un chapeau, des sections — et ce qui │
 * │ les distingue est leur CONTENU, qui vit dans `src/content/editorial.ts`. │
 * │ Cinq fichiers de page auraient produit cinq mises en page légèrement     │
 * │ différentes, et la correction d'une seule aurait laissé les quatre       │
 * │ autres derrière.                                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le segment est dynamique mais l'énumération est FERMÉE : un slug inconnu
 * produit un 404, et non une page vide. Les segments statiques voisins —
 * `catalogue`, `offres`, `connexion` — l'emportent sur celui-ci, Next.js
 * donnant la priorité au plus spécifique.
 */
interface Parametres {
  params: Promise<{ langue: string; page: string }>;
}

/** Les cinq pages, dans les deux langues, deviennent des routes connues. */
export function generateStaticParams(): { langue: string; page: string }[] {
  return LANGUES_INTERFACE.flatMap((langue) =>
    PAGES_EDITORIALES.map((page) => ({ langue, page })),
  );
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const { langue: langueBrute, page: slug } = await params;
  const langue = langueValide(langueBrute);

  const contenu = lirePageEditoriale(langue, slug);
  if (!contenu) return { title: traduire(langue, 'pages.introuvableTitre') };

  const base = getServerEnv().NEXT_PUBLIC_APP_URL;

  return {
    title: contenu.titre,
    description: contenu.chapeau,
    alternates: {
      canonical: `${base}/${langue}/${slug}`,
      languages: Object.fromEntries(
        LANGUES_INTERFACE.map((code) => [code, `${base}/${code}/${slug}`]),
      ),
    },
  };
}

export default async function PageEditoriale({ params }: Parametres) {
  const { langue: langueBrute, page: slug } = await params;
  const langue = langueValide(langueBrute);

  const contenu = lirePageEditoriale(langue, slug);
  if (!contenu) notFound();

  // Le gabarit vit dans un composant PARTAGÉ : la route de contact le rend
  // elle aussi sous la V1, car son segment statique éclipse celui-ci.
  return <CorpsEditorial langue={langue} slug={slug as SlugEditorial} />;
}
