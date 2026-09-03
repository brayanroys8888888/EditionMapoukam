import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { EntreeCatalogue } from '@/domain/catalog/types';
import type { ReponseFacettes } from '@/domain/api/contract';
import type { Temoignage } from '@/lib/site/temoignages';
import { Carrousel } from './carrousel';
import { CarteConteV2 } from './carte-conte';
import { Revele } from './revele';
import styles from './accueil.module.css';

/**
 * ACCUEIL — DIRECTION V2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN CHIFFRE, AUCUN PRIX N'EST ÉCRIT DANS CE FICHIER.                  │
 * │                                                                          │
 * │ Les comptes viennent des facettes du catalogue, les prix de             │
 * │ `prix.affichage` rendu par le serveur. C'est la même règle que la V1, et │
 * │ elle vaut d'autant plus ici que cette page est la vitrine : un montant   │
 * │ recopié serait celui que le client lit AVANT de payer l'autre.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les témoignages ne sont plus de la copie non plus : ils vivent en base
 * depuis la migration 0073, traduits et ordonnés par l'éditeur, et arrivent ici
 * par une prop. Ils étaient figés aux clés `v2.avis1` à `v2.avis3`, où en
 * changer un demandait un déploiement.
 */

/**
 * Combien de THÈMES la vitrine met en avant.
 *
 * La section montrait les cinq traditions, dans un ordre écrit ici. Les thèmes
 * viennent des facettes, déjà ordonnés par effectif : il ne reste qu'à décider
 * combien de tuiles tiennent sur une ligne. Cinq, comme avant.
 */
const NOMBRE_THEMES_VITRINE = 5;

/** Les trois gages de la bande de réassurance. */
const GAGES = [
  { titre: 'v2.gage1Titre', corps: 'v2.gage1Corps' },
  { titre: 'v2.gage2Titre', corps: 'v2.gage2Corps' },
  { titre: 'v2.gage3Titre', corps: 'v2.gage3Corps' },
] as const;

function IconeGage({ rang }: { rang: number }): ReactNode {
  const communes = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    width: 22,
    height: 22,
    'aria-hidden': true,
    focusable: false,
  } as const;

  // Trois tracés seulement, dessinés à la main : cadenas, fichier, bulle.
  // Une bibliothèque d'icônes pour trois formes coûterait plus cher que tout
  // le reste de cette page sur la connexion lente du public visé.
  if (rang === 0) {
    return (
      <svg {...communes}>
        <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
        <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      </svg>
    );
  }

  if (rang === 1) {
    return (
      <svg {...communes}>
        <path d="M13.5 3.5H7.2A2.2 2.2 0 0 0 5 5.7v12.6a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2V9z" />
        <path d="M13.5 3.5V9H19" />
      </svg>
    );
  }

  return (
    <svg {...communes}>
      <path d="M20 13.5a3 3 0 0 1-3 3H9l-4 3.5v-3.5H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z" />
    </svg>
  );
}

export function AccueilV2({
  langue,
  nouveautes,
  facettes,
  temoignages,
  actionAjout,
}: {
  langue: LangueInterface;
  /** `null` quand la base tousse : la vitrine s'affiche quand même. */
  nouveautes: { entrees: EntreeCatalogue[]; total: number } | null;
  facettes: ReponseFacettes | null;
  /**
   * Les témoignages publiés. Vide fait disparaître la section — une vitrine
   * sans témoignages vaut mieux qu'une section de citations vides.
   */
  temoignages: readonly Temoignage[];
  /** Fabrique l'action d'ajout au panier d'un titre donné. */
  actionAjout?: (livreId: string) => (donnees: FormData) => void | Promise<void>;
}): ReactNode {
  // Les facettes ne rendent que ce que le catalogue porte vraiment : un thème
  // sans titre publié n'y figure pas, et la vitrine ne peut donc pas proposer
  // une tuile qui mènerait à une page vide.
  const themesVitrine = (facettes?.themes ?? []).slice(0, NOMBRE_THEMES_VITRINE);

  return (
    <div className={styles.page}>
      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className={styles.hero} aria-labelledby="titre-accueil">
        <div className={styles.heroGrille}>
          <div className={styles.heroTexte}>
            <p className={styles.surtitre}>{traduire(langue, 'v2.heroSurtitre')}</p>

            <h1 id="titre-accueil" className={styles.heroTitre}>
              {traduire(langue, 'v2.heroTitre1')}{' '}
              <span className={styles.heroAccent}>{traduire(langue, 'v2.heroTitreAccent')}</span>
            </h1>

            <p className={styles.heroAccroche}>{traduire(langue, 'v2.heroAccroche')}</p>

            <div className={styles.heroActions}>
              <a className={styles.boutonOcre} href={`/${langue}/catalogue`}>
                {traduire(langue, 'v2.heroAction')}
              </a>
              <a className={styles.boutonClair} href={`/${langue}/offres`}>
                {traduire(langue, 'v2.heroActionSecondaire')}
              </a>
            </div>
          </div>

          {/*
           * ┌──────────────────────────────────────────────────────────────┐
           * │ PLUS DE COUVERTURE À CÔTÉ DU TEXTE — L'IMAGE DE FOND SUFFIT. │
           * │                                                              │
           * │ Le hero portait la première nouveauté, inclinée, à droite du │
           * │ titre. Deux images se disputaient la même section : la       │
           * │ photographie de fond et cette vignette posée dessus.         │
           * │                                                              │
           * │ `vedette` reste lu plus bas — le carrousel des nouveautés en │
           * │ a besoin. Seul l'affichage disparaît.                        │
           * └──────────────────────────────────────────────────────────────┘
           */}
        </div>
      </section>

      {/* ══ RÉASSURANCE ══════════════════════════════════════════════════ */}
      <div className={styles.reassurance}>
        <div className={styles.reassuranceGrille}>
          {GAGES.map((gage, rang) => (
            <div key={gage.titre} className={styles.gage}>
              <span className={styles.gagePastille} aria-hidden="true">
                <IconeGage rang={rang} />
              </span>
              <div>
                <p className={styles.gageTitre}>{traduire(langue, gage.titre)}</p>
                <p className={styles.gageCorps}>{traduire(langue, gage.corps)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ NOUVEAUTÉS — EN CARROUSEL ════════════════════════════════════ */}
      {nouveautes && nouveautes.entrees.length > 0 ? (
        <section className={styles.section} aria-labelledby="titre-nouveautes">
          <div className={styles.interieur}>
            <div className={styles.enteteSection}>
              <div>
                <span className={styles.oeil}>{traduire(langue, 'v2.nouveautesOeil')}</span>
                <h2 id="titre-nouveautes" className={styles.titreSection}>
                  {traduire(langue, 'v2.nouveautesTitre')}
                </h2>
                <p className={styles.sousTitreSection}>
                  {traduire(langue, 'v2.nouveautesSousTitre')}
                </p>
              </div>

              <a className={styles.boutonContour} href={`/${langue}/catalogue`}>
                {traduire(langue, 'accueil.voirTout')}
              </a>
            </div>

            <Carrousel langue={langue} libelle={traduire(langue, 'v2.nouveautesTitre')}>
              {nouveautes.entrees.map((entree) => (
                <li key={entree.id}>
                  <CarteConteV2
                    langue={langue}
                    entree={entree}
                    actionAjout={actionAjout?.(entree.id)}
                  />
                </li>
              ))}
            </Carrousel>
          </div>
        </section>
      ) : null}

      {/* ══ NOTRE HISTOIRE ═══════════════════════════════════════════════ */}
      <section className={`${styles.section} ${styles.sectionDouce}`} aria-labelledby="titre-histoire">
        <div className={styles.interieur}>
          <Revele>
            <div className={styles.histoire}>
              {/*
               * Aucune photographie ici, et c'est assumé : nous n'en avons
               * aucune dont les droits soient établis. Un aplat à motif tient
               * la place d'une illustration — jamais un rectangle gris.
               */}
              <div className={styles.histoireVisuel}>
                <img
                  src="/images/pourquoi-contes.png"
                  alt={traduire(langue, 'v2.histoireTitre')}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>

              <div>
                <span className={styles.oeil}>{traduire(langue, 'v2.histoireOeil')}</span>
                <h2 id="titre-histoire" className={styles.titreSection}>
                  {traduire(langue, 'v2.histoireTitre')}
                </h2>

                <p className={styles.histoireTexte} style={{ marginTop: '20px' }}>
                  {traduire(langue, 'v2.histoireCorps1')}
                </p>
                <p className={styles.histoireTexte}>{traduire(langue, 'v2.histoireCorps2')}</p>

                <a className={styles.boutonVert} href={`/${langue}/a-propos`}>
                  {traduire(langue, 'v2.histoireAction')}
                </a>
              </div>
            </div>
          </Revele>
        </div>
      </section>

      {/* ══ LES THÈMES ═══════════════════════════════════════════════════ */}
      {themesVitrine.length > 0 ? (
        <section className={styles.section} aria-labelledby="titre-traditions">
          <div className={styles.interieur}>
            <div className={styles.enteteSection}>
              <div>
                <span className={styles.oeil}>{traduire(langue, 'v2.themesOeil')}</span>
                <h2 id="titre-traditions" className={styles.titreSection}>
                  {traduire(langue, 'accueil.themesTitre')}
                </h2>
                <p className={styles.sousTitreSection}>
                  {traduire(langue, 'accueil.themesIntro')}
                </p>
              </div>
            </div>

            <ul className={styles.traditions}>
              {themesVitrine.map((facette, rang) => {
                const imgIndex = (rang % 4) + 1;
                return (
                  <li key={facette.valeur}>
                    <Revele rang={rang}>
                      {/*
                        `encodeURIComponent` : un thème est de la saisie libre,
                        et une espace ou une esperluette y casserait la requête.
                      */}
                      <a
                        className={styles.tradition}
                        href={`/${langue}/catalogue?themes=${encodeURIComponent(facette.valeur)}`}
                      >
                        <div style={{ width: '100%', height: '110px', borderRadius: 'var(--rayon-image)', overflow: 'hidden', marginBottom: '14px' }}>
                          {/*
                            L'illustration est DÉCORATIVE : elle tourne sur
                            quatre visuels sans rapport avec le thème nommé
                            juste en dessous. Un `alt` la décrivant affirmerait
                            un lien qui n'existe pas ; il est donc vide, et
                            l'image est ignorée par les lecteurs d'écran.
                          */}
                          <img
                            src={`/images/tradition-${imgIndex}.jpg`}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                        <p className={styles.traditionNom}>{facette.valeur}</p>
                        <p className={styles.traditionCompte}>
                          {facette.nombre === 1
                            ? traduire(langue, 'accueil.themesCompteUn')
                            : traduire(langue, 'accueil.themesCompte').replace(
                                '{nombre}',
                                String(facette.nombre),
                              )}
                        </p>
                      </a>
                    </Revele>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ══ TÉMOIGNAGES ══════════════════════════════════════════════════ */}
      {temoignages.length > 0 ? (
        <section
          className={`${styles.section} ${styles.sectionDouce}`}
          aria-labelledby="titre-avis"
        >
          <div className={styles.interieur}>
            <div className={styles.enteteSection}>
              <div>
                <span className={styles.oeil}>{traduire(langue, 'v2.avisOeil')}</span>
                <h2 id="titre-avis" className={styles.titreSection}>
                  {traduire(langue, 'v2.avisTitre')}
                </h2>
              </div>
            </div>

            <ul className={styles.avis}>
              {temoignages.map((temoignage, rang) => (
                <li key={temoignage.id}>
                  <Revele rang={rang}>
                    <figure className={styles.avisCarte}>
                      <span className={styles.avisGuillemet} aria-hidden="true">
                        &laquo;
                      </span>
                      <blockquote className={styles.avisTexte}>{temoignage.texte}</blockquote>
                      <figcaption className={styles.avisAuteur}>
                        {temoignage.auteur}
                        {/*
                          Le rôle est facultatif : un témoignage signé du seul
                          prénom reste un témoignage. Une ligne vide y aurait
                          laissé un blanc que l'œil lit comme un défaut.
                        */}
                        {temoignage.role ? (
                          <span className={styles.avisRole}>{temoignage.role}</span>
                        ) : null}
                      </figcaption>
                    </figure>
                  </Revele>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ══ APPEL FINAL ══════════════════════════════════════════════════ */}
      <section className={styles.appel}>
        <div className={styles.appelInterieur}>
          <h2 className={styles.appelTitre}>{traduire(langue, 'v2.appelTitre')}</h2>
          <p className={styles.appelCorps}>{traduire(langue, 'v2.appelCorps')}</p>

          <div className={styles.appelActions}>
            <a className={styles.boutonOcre} href={`/${langue}/catalogue`}>
              {traduire(langue, 'v2.heroAction')}
            </a>
            <a className={styles.boutonClair} href={`/${langue}/offres`}>
              {traduire(langue, 'accueil.enSavoirPlus')}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
