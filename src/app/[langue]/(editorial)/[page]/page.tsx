import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LANGUES_INTERFACE, langueValide, traduire } from '@/i18n';
import {
  IDENTITE_EDITEUR,
  PAGES_EDITORIALES,
  lirePageEditoriale,
} from '@/content/editorial';
import { getServerEnv } from '@/lib/config/env';
import ecran from '@/components/ecran/ecran.module.css';

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

  return (
    <article className={ecran.pageTexte}>
      <h1 className={ecran.titre}>{contenu.titre}</h1>

      {/*
        Le nom commercial n'est écrit nulle part dans les contenus : il vit
        en UNE clé de traduction, et un test échoue s'il est recopié ailleurs.
        Les contenus portent donc un jeton, remplacé ici.
      */}
      <p className={ecran.intro}>
        {contenu.chapeau.replace('{marque}', traduire(langue, 'marque.nom'))}
      </p>

      {/*
        LITERATA, et la mesure de lecture.

        Ce sont les seuls textes longs du site hors des contes. Les laisser en
        police d'interface sur toute la largeur de l'écran, c'est garantir
        qu'aucun ne sera lu jusqu'au bout — et ce sont précisément les pages
        qu'on doit pouvoir lire : conditions, confidentialité, contact.
      */}
      <div className={ecran.corpsEditorial}>
        {contenu.sections.map((section) => (
          <section key={section.titre}>
            <h2>{section.titre}</h2>

            {section.paragraphes?.map((paragraphe) => (
              <p key={paragraphe}>{paragraphe}</p>
            ))}

            {section.points ? (
              <ul>
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      {/*
        L'adresse de contact, sur la page de contact uniquement.

        Elle n'est affichée QUE si elle est renseignée : une adresse inventée
        serait pire qu'une adresse absente, puisqu'elle aurait l'air d'être
        vraie et que personne ne relèverait les messages envoyés dessus.
      */}
      {slug === 'contact' && IDENTITE_EDITEUR.emailContact ? (
        <p className={ecran.panneauTitre}>
          <a className={ecran.boutonDiscret} href={`mailto:${IDENTITE_EDITEUR.emailContact}`}>
            {IDENTITE_EDITEUR.emailContact}
          </a>
        </p>
      ) : null}

      {/*
        Mentions légales, sur les conditions générales.

        Même règle : ce qui n'est pas renseigné ne s'affiche pas. Ces valeurs
        sont obligatoires en droit et ne peuvent venir que de l'éditeur.
      */}
      {slug === 'conditions-generales' ? (
        <footer className={ecran.panneau}>
          {IDENTITE_EDITEUR.raisonSociale ? <p>{IDENTITE_EDITEUR.raisonSociale}</p> : null}
          {IDENTITE_EDITEUR.adresse ? <p>{IDENTITE_EDITEUR.adresse}</p> : null}
          {IDENTITE_EDITEUR.immatriculation ? <p>{IDENTITE_EDITEUR.immatriculation}</p> : null}
          {IDENTITE_EDITEUR.directeurPublication ? (
            <p>{IDENTITE_EDITEUR.directeurPublication}</p>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
