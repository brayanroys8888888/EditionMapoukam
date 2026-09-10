import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import type { EntreeCatalogue } from '@/domain/catalog/types';
import { lireIllustrationApropos } from '@/content/apropos';

import { Revele } from './revele';
import styles from './apropos-v3.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ À PROPOS — L'ÉCRAN ORGANIC.                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Prototype, lignes 966 à 1030. Les mesures sont dans la feuille voisine,
 * commentées une à une ; ce fichier ne porte que la structure et les données.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE RÉCIT MONTE DANS LE HÉROS — ET LA SECTION « NOTRE HISTOIRE » TOMBE.  │
 * │                                                                          │
 * │ La V2 ouvrait sur un bandeau olive portant un chapeau, puis consacrait   │
 * │ une section entière au récit, annoncée par « Notre histoire ». Le        │
 * │ prototype fait du récit le héros lui-même : sur-titre, titre, les        │
 * │ paragraphes à gauche, la photographie à droite.                          │
 * │                                                                          │
 * │ Deux chaînes du dictionnaire ne sont donc plus affichées ici :           │
 * │                                                                          │
 * │   * `v2.aproposTexte` — le chapeau du bandeau. Il n'est pas perdu : il   │
 * │     reste la MÉTA-DESCRIPTION de la page, qui est son autre emploi ;     │
 * │   * `v2.aproposHistoireOeil` / `…Titre` — l'annonce de la section        │
 * │     disparue. Une page « à propos » qui annonce « Notre histoire » avant │
 * │     de la raconter met deux portes devant une seule pièce.               │
 * │                                                                          │
 * │ Les clés restent au dictionnaire : la V2 les rend toujours.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES TEXTES SONT CEUX DU PROPRIÉTAIRE — 6 SEPTEMBRE 2026.                │
 * │                                                                          │
 * │ Ceux du prototype décrivaient une maison qui ne publie que des contes.   │
 * │ Elle en publie, mais elle édite aussi des ressources pédagogiques, porte │
 * │ une association et fait du conseil : c'est ce que dit `New section/A     │
 * │ propos/Apropos_texte.txt`, et c'est ce que montre l'illustration.        │
 * │                                                                          │
 * │ Ce qui a changé, et pourquoi :                                           │
 * │                                                                          │
 * │   * le récit passe de trois paragraphes inventés à DEUX réels — accueil  │
 * │     et mission. Le troisième n'a plus de clé : il n'existait pas ;       │
 * │   * les quatre « principes » du prototype deviennent les quatre UNIVERS  │
 * │     de la maison. La grille ne bouge pas, son contenu cesse d'être une   │
 * │     supposition ;                                                        │
 * │   * la citation prêtée à la fondatrice devient la DEVISE de la maison,   │
 * │     sans signature — voir l'encadré du panneau.                          │
 * │                                                                          │
 * │ `v2.aproposTexte` reste la méta-description ; `v2.aproposHistoire*` et   │
 * │ `v2.aproposFondatrice*` restent au dictionnaire, la V2 les rend encore.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const PRINCIPES: readonly { titre: CleTraduction; corps: CleTraduction }[] = [
  { titre: 'v2.aproposValeur1Titre', corps: 'v2.aproposValeur1Corps' },
  { titre: 'v2.aproposValeur2Titre', corps: 'v2.aproposValeur2Corps' },
  { titre: 'v2.aproposValeur3Titre', corps: 'v2.aproposValeur3Corps' },
  { titre: 'v2.aproposValeur4Titre', corps: 'v2.aproposValeur4Corps' },
];

const RECIT: readonly CleTraduction[] = ['v2.aproposH1', 'v2.aproposH2'];

export function AproposV3({
  langue,
  couvertures,
}: {
  langue: LangueInterface;
  /** Quelques titres du catalogue, pour la rangée. Vide si la base est muette. */
  couvertures: EntreeCatalogue[];
}): ReactNode {
  const illustration = lireIllustrationApropos(langue);

  return (
    <>
      {/* ── Le héros ──────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <span className={styles.heroCercle} aria-hidden="true" />

        <div className={styles.heroInterieur}>
          <div>
            <span className={styles.oeil}>{traduire(langue, 'v2.aproposOeil')}</span>
            <h1 className={styles.titre}>{traduire(langue, 'v2.aproposTitre')}</h1>

            {RECIT.map((cle) => (
              <p className={styles.paragraphe} key={cle}>
                {traduire(langue, cle)}
              </p>
            ))}
          </div>

          <div className={styles.photo}>
            {/*
             * ┌────────────────────────────────────────────────────────────┐
             * │ CELLE-CI N'EST PAS DÉCORATIVE, ET C'EST ASSEZ RARE POUR    │
             * │ QU'ON L'ÉCRIVE.                                            │
             * │                                                            │
             * │ Les images de ce site illustrent un texte qui dit déjà     │
             * │ tout : leur `alt` est vide, à dessein. Celle-ci PORTE une  │
             * │ information — elle nomme et met en scène les quatre        │
             * │ univers de la maison, et c'est la seule vue d'ensemble de  │
             * │ la page. Elle a donc une description, et celle-ci vit dans │
             * │ `src/content/apropos.ts` : un `alt` tiré du dictionnaire   │
             * │ d'INTERFACE est interdit, et l'encadré de ce fichier-là    │
             * │ dit pourquoi.                                               │
             * └────────────────────────────────────────────────────────────┘
             */}
            <img
              className={styles.image}
              src={illustration.source}
              width={illustration.largeur}
              height={illustration.hauteur}
              alt={illustration.alt}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </section>

      {/* ── La citation ───────────────────────────────────────────────── */}
      <section className={styles.sectionCitation}>
        <Revele>
          <figure className={styles.citation}>
            <blockquote className={styles.citationTexte}>
              {traduire(langue, 'v2.aproposCitation')}
            </blockquote>

            {/*
             * ┌────────────────────────────────────────────────────────────┐
             * │ CE PANNEAU PORTE UNE DEVISE, PAS UNE CITATION.             │
             * │                                                            │
             * │ La V2 y mettait une phrase inventée, signée de la          │
             * │ fondatrice — le même défaut que les textes de              │
             * │ l'association avant leur remplacement : vraisemblable,     │
             * │ bien écrit, et faux.                                        │
             * │                                                            │
             * │ La ligne est maintenant celle de la maison, dans ses       │
             * │ propres mots — elle est imprimée sur l'illustration du      │
             * │ héros, sous le nom. Elle n'est donc attribuée à PERSONNE :  │
             * │ signer une devise de maison du nom d'une personne serait    │
             * │ lui prêter des paroles qu'elle n'a pas dites.               │
             * │                                                            │
             * │ Le sceau reprend l'emblème du logo, et la ligne qui suit    │
             * │ est le mot d'accueil du même texte.                        │
             * └────────────────────────────────────────────────────────────┘
             */}
            <figcaption className={styles.citationAuteur}>
              <span className={styles.sceau} aria-hidden="true" />
              <span className={styles.citationSignature}>
                {traduire(langue, 'v2.aproposSignature')}
              </span>
            </figcaption>
          </figure>
        </Revele>
      </section>

      {/* ── Les quatre principes ──────────────────────────────────────── */}
      <section className={styles.sectionPrincipes}>
        <Revele>
          <div className={styles.enTete}>
            <span className={styles.oeil}>{traduire(langue, 'v2.aproposValeursOeil')}</span>
            <h2 className={styles.titreSection}>
              {traduire(langue, 'v2.aproposValeursTitre')}
            </h2>
          </div>
        </Revele>

        <Revele>
          <ol className={styles.principes}>
            {PRINCIPES.map((principe, rang) => (
              <li className={styles.principe} key={principe.titre}>
                <span className={styles.principeNumero} aria-hidden="true">
                  {rang + 1}
                </span>
                <p className={styles.principeTitre}>{traduire(langue, principe.titre)}</p>
                <p className={styles.principeCorps}>{traduire(langue, principe.corps)}</p>
              </li>
            ))}
          </ol>
        </Revele>
      </section>

      {/* ── Le catalogue en preuve ────────────────────────────────────── */}
      {couvertures.length > 0 ? (
        <section className={styles.sectionCatalogue}>
          <Revele>
            <div className={styles.catalogueEnTete}>
              <div>
                <span className={styles.oeil}>
                  {traduire(langue, 'v2.aproposCatalogueOeil')}
                </span>
                <h2 className={styles.titreCatalogue}>
                  {traduire(langue, 'v2.aproposCatalogueTitre')}
                </h2>
              </div>

              <a className={styles.boutonCatalogue} href={`/${langue}/catalogue`}>
                {traduire(langue, 'accueil.voirTout')}
              </a>
            </div>
          </Revele>

          <Revele>
            <ul className={styles.rangee}>
              {couvertures.map((entree) => (
                <li key={entree.id}>
                  <a className={styles.carte} href={`/${langue}/contes/${entree.slug}`}>
                    {entree.couverture ? (
                      <img
                        className={styles.couverture}
                        src={entree.couverture.vignette}
                        width={268}
                        height={403}
                        loading="lazy"
                        decoding="async"
                        /*
                         * Le titre est écrit juste dessous, DANS le lien : le
                         * répéter en texte de remplacement le ferait entendre
                         * deux fois. La V2 le cachait au contraire — le
                         * prototype, lui, le montre, et c'est ce qui permet
                         * de reconnaître un titre sans plisser les yeux.
                         */
                        alt=""
                      />
                    ) : null}
                    <span className={styles.carteTitre}>{entree.titre}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Revele>
        </section>
      ) : null}
    </>
  );
}
