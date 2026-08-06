import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import { IDENTITE_EDITEUR, lirePageEditoriale, type SlugEditorial } from '@/content/editorial';
import ecran from '@/components/ecran/ecran.module.css';

/**
 * LE GABARIT DES CINQ PAGES ÉDITORIALES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EXTRAIT DE LA ROUTE POUR ÊTRE PARTAGÉ, PAS PAR GOÛT DU DÉCOUPAGE.       │
 * │                                                                          │
 * │ Depuis la V2, `/[langue]/contact` existe en route PROPRE — une page de   │
 * │ contact avec formulaire et coordonnées. Or Next fait toujours gagner un  │
 * │ segment statique sur un segment dynamique : cette route éclipse donc     │
 * │ `(editorial)/[page]` pour le slug `contact`, dans les DEUX directions.   │
 * │                                                                          │
 * │ Sans ce composant, la V1 aurait silencieusement perdu sa page de         │
 * │ contact éditoriale — remplacée par un écran conçu pour la V2. Ici, la    │
 * │ route de contact rend CE gabarit sous la V1, et le sien sous la V2.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function CorpsEditorial({
  langue,
  slug,
}: {
  langue: LangueInterface;
  slug: SlugEditorial;
}): ReactNode {
  const contenu = lirePageEditoriale(langue, slug);
  if (!contenu) return null;

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
