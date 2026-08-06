import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { EntreeCatalogue, RegionConte } from '@/domain/catalog/types';
import type { ReponseFacettes } from '@/domain/api/contract';
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
 * Les avis, eux, sont de la copie éditoriale et vivent dans le dictionnaire.
 * Ce sont des témoignages du site actuel, repris mot pour mot.
 */

/** Ordre d'affichage des traditions — d'ouest en est. */
const ORDRE_REGIONS: RegionConte[] = [
  'afrique_ouest',
  'sahel',
  'afrique_centrale',
  'afrique_australe',
  'afrique_est',
];

/** Les trois gages de la bande de réassurance. */
const GAGES = [
  { titre: 'v2.gage1Titre', corps: 'v2.gage1Corps' },
  { titre: 'v2.gage2Titre', corps: 'v2.gage2Corps' },
  { titre: 'v2.gage3Titre', corps: 'v2.gage3Corps' },
] as const;

/** Les trois avis, repris du site actuel. */
const AVIS = [
  { texte: 'v2.avis1', auteur: 'v2.avis1Auteur', role: 'v2.avis1Role' },
  { texte: 'v2.avis2', auteur: 'v2.avis2Auteur', role: 'v2.avis2Role' },
  { texte: 'v2.avis3', auteur: 'v2.avis3Auteur', role: 'v2.avis3Role' },
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
  actionAjout,
}: {
  langue: LangueInterface;
  /** `null` quand la base tousse : la vitrine s'affiche quand même. */
  nouveautes: { entrees: EntreeCatalogue[]; total: number } | null;
  facettes: ReponseFacettes | null;
  /** Fabrique l'action d'ajout au panier d'un titre donné. */
  actionAjout?: (livreId: string) => (donnees: FormData) => void | Promise<void>;
}): ReactNode {
  const traditions = ORDRE_REGIONS.map((region) => ({
    region,
    nombre: facettes?.regions.find((facette) => facette.valeur === region)?.nombre ?? 0,
  })).filter((tradition) => tradition.nombre > 0);

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

      {/* ══ LES CINQ TRADITIONS ══════════════════════════════════════════ */}
      {traditions.length > 0 ? (
        <section className={styles.section} aria-labelledby="titre-traditions">
          <div className={styles.interieur}>
            <div className={styles.enteteSection}>
              <div>
                <span className={styles.oeil}>{traduire(langue, 'v2.traditionsOeil')}</span>
                <h2 id="titre-traditions" className={styles.titreSection}>
                  {traduire(langue, 'accueil.traditionsTitre')}
                </h2>
                <p className={styles.sousTitreSection}>
                  {traduire(langue, 'accueil.traditionsIntro')}
                </p>
              </div>
            </div>

            <ul className={styles.traditions}>
              {traditions.map(({ region, nombre }, rang) => {
                const imgIndex = (rang % 4) + 1;
                return (
                  <li key={region}>
                    <Revele rang={rang}>
                      <a className={styles.tradition} href={`/${langue}/catalogue?region=${region}`}>
                        <div style={{ width: '100%', height: '110px', borderRadius: 'var(--rayon-image)', overflow: 'hidden', marginBottom: '14px' }}>
                          <img
                            src={`/images/tradition-${imgIndex}.jpg`}
                            alt={traduire(langue, `regions.${region}`)}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                        <p className={styles.traditionNom}>{traduire(langue, `regions.${region}`)}</p>
                        <p className={styles.traditionCompte}>
                          {nombre === 1
                            ? traduire(langue, 'accueil.traditionsCompteUn')
                            : traduire(langue, 'accueil.traditionsCompte').replace(
                                '{nombre}',
                                String(nombre),
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

      {/* ══ AVIS ═════════════════════════════════════════════════════════ */}
      <section className={`${styles.section} ${styles.sectionDouce}`} aria-labelledby="titre-avis">
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
            {AVIS.map((avis, rang) => (
              <li key={avis.auteur}>
                <Revele rang={rang}>
                  <figure className={styles.avisCarte}>
                    <span className={styles.avisGuillemet} aria-hidden="true">
                      &laquo;
                    </span>
                    <blockquote className={styles.avisTexte}>
                      {traduire(langue, avis.texte)}
                    </blockquote>
                    <figcaption className={styles.avisAuteur}>
                      {traduire(langue, avis.auteur)}
                      <span className={styles.avisRole}>{traduire(langue, avis.role)}</span>
                    </figcaption>
                  </figure>
                </Revele>
              </li>
            ))}
          </ul>
        </div>
      </section>

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
