import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { estV3 } from '@/design/version';
import type { EntreeCatalogue } from '@/domain/catalog/types';
import { LivretMisEnAvant } from '@/components/v2/livret-mis-en-avant';
import { Rayon, aplatirRequete, type ClesRayon } from '../rayon';
import styles from '@/components/v2/boutique.module.css';

/**
 * LIVRETS PÉDAGOGIQUES — le catalogue, vu par un seul type de support.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE N'EST PAS UN SECOND CATALOGUE. C'EST LE MÊME, AVEC UN FILTRE POSÉ.    │
 * │                                                                          │
 * │ Mêmes modules — `listerCatalogue`, `lireFacettes` —, même schéma de       │
 * │ validation, mêmes composants de grille, mêmes droits. Le seul écart      │
 * │ tient en un argument : `type` est IMPOSÉ, et ne peut pas être retiré.     │
 * │                                                                          │
 * │ Cet écran portait autrefois son propre corps, copié de `/catalogue`.     │
 * │ La séparation des rayons en aurait fait une troisième copie : le corps   │
 * │ vit désormais dans `../rayon`, que `/contes` appelle à l'identique.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const CLES: ClesRayon = {
  titre: 'livrets.titre',
  intro: 'livrets.intro',
  compteTous: 'livrets.compteTous',
  compteUn: 'livrets.compteUn',
  videTitre: 'livrets.videTitre',
  compteCarte: 'livrets.compteCarte',
};

interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, CLES.titre),
    description: traduire(langue, CLES.intro),
  };
}

export default async function PageLivrets({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);

  return (
    <Rayon
      langue={langue}
      requete={aplatirRequete(await searchParams)}
      type="livret_pedagogique"
      base={`/${langue}/livrets`}
      cles={CLES}
      {...(estV3()
        ? {
            /*
             * Le kit offert, en haut de l'ecran. Le rayon choisit le titre —
             * le premier `gratuit` de la premiere page, et rien si un filtre
             * est pose : voir l'encadre de `misEnAvant` dans `rayon.tsx`.
             */
            misEnAvant: (entree: EntreeCatalogue) => (
              <LivretMisEnAvant langue={langue} entree={entree} />
            ),

            /*
             * La troisieme carte de la banniere — « A4 · pret a imprimer ».
             *
             * Elle ne compte rien, et c'est pour ca qu'elle vient d'ici : la
             * boutique ne rend que des effectifs de facettes, et une valeur
             * ecrite parmi eux se lirait comme un chiffre du catalogue.
             */
            compteSupplementaire: {
              valeur: traduire(langue, 'livrets.compteFormatValeur'),
              libelle: traduire(langue, 'livrets.compteFormatLibelle'),
            },

            /*
             * ┌──────────────────────────────────────────────────────────────┐
             * │ L'APPEL « SUR MESURE » EST RENDU MEME SANS AUCUN LIVRET.    │
             * │                                                              │
             * │ C'est le seul bloc de cet ecran qui ne depend d'aucune        │
             * │ donnee : il ne compte rien, il ne liste rien, il renvoie vers │
             * │ « Expertise & conseil », qui existe. Un rayon vide a encore   │
             * │ quelque chose a proposer — et c'est ce jour-la que la         │
             * │ proposition compte le plus.                                   │
             * └──────────────────────────────────────────────────────────────┘
             */
            apresGrille: (
              <section className={styles.surMesure}>
                <div>
                  <h2 className={styles.surMesureTitre}>
                    {traduire(langue, 'livrets.surMesureTitre')}
                  </h2>
                  <p className={styles.surMesureCorps}>
                    {traduire(langue, 'livrets.surMesureCorps')}
                  </p>
                </div>
                <a className={styles.surMesureAction} href={`/${langue}/expertise`}>
                  {traduire(langue, 'livrets.surMesureAction')}
                </a>
              </section>
            ),
          }
        : {})}
    />
  );
}
