import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import type { EntreeCatalogue } from '@/domain/catalog/types';
import { Revele } from './revele';
import styles from './apropos.module.css';
import boutique from './boutique.module.css';
import accueil from './accueil.module.css';

/**
 * À PROPOS — DIRECTION V2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE DATE, AUCUN CHIFFRE INVENTÉ.                                     │
 * │                                                                          │
 * │ Le site actuel affiche « Fondées en [Année de création] » — le crochet   │
 * │ est resté. Plutôt que de combler le trou avec une année plausible, la    │
 * │ phrase est réécrite sans date : une maison d'édition ne gagne rien à     │
 * │ dater sa fondation, et tout à ne pas se tromper dessus.                  │
 * │                                                                          │
 * │ Le mur de couvertures, lui, vient du CATALOGUE RÉEL : c'est ce qui       │
 * │ distingue une maison qui publie d'une maison qui annonce.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const VALEURS = [
  { titre: 'v2.aproposValeur1Titre', corps: 'v2.aproposValeur1Corps' },
  { titre: 'v2.aproposValeur2Titre', corps: 'v2.aproposValeur2Corps' },
  { titre: 'v2.aproposValeur3Titre', corps: 'v2.aproposValeur3Corps' },
  { titre: 'v2.aproposValeur4Titre', corps: 'v2.aproposValeur4Corps' },
] as const;

/** Les initiales de la fondatrice, dérivées du nom — jamais recopiées. */
function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot.charAt(0).toUpperCase())
    .join('');
}

export function AproposV2({
  langue,
  couvertures,
}: {
  langue: LangueInterface;
  /** Quelques titres du catalogue, pour le mur. Vide si la base est muette. */
  couvertures: EntreeCatalogue[];
}): ReactNode {
  const nomFondatrice = traduire(langue, 'v2.aproposFondatrice');

  return (
    <>
      <div className={boutique.banniere} data-banniere>
        <div className={boutique.banniereInterieur}>
          <span className={boutique.oeil}>{traduire(langue, 'v2.aproposOeil')}</span>
          <h1 className={boutique.banniereTitre}>{traduire(langue, 'v2.aproposTitre')}</h1>
          <p className={boutique.banniereTexte}>{traduire(langue, 'v2.aproposTexte')}</p>
        </div>
      </div>

      <div className={boutique.page}>
        {/* ── Le récit ──────────────────────────────────────────────────── */}
        <section className={styles.recit}>
          <div className={styles.visuel}>
            <img
              src="/images/apropos-fondation.png"
              alt={traduire(langue, 'v2.aproposHistoireTitre')}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--rayon-panneau)' }}
            />
          </div>

          <div>
            <span className={accueil.oeil}>{traduire(langue, 'v2.aproposHistoireOeil')}</span>
            <h2 className={accueil.titreSection}>
              {traduire(langue, 'v2.aproposHistoireTitre')}
            </h2>

            <div className={styles.texte} style={{ marginTop: '22px' }}>
              <p>{traduire(langue, 'v2.aproposH1')}</p>
              <p>{traduire(langue, 'v2.aproposH2')}</p>
              <p>{traduire(langue, 'v2.aproposH3')}</p>
            </div>
          </div>
        </section>

        {/* ── La citation ───────────────────────────────────────────────── */}
        <Revele>
          <figure className={styles.citation}>
            <blockquote className={styles.citationTexte}>
              {traduire(langue, 'v2.aproposCitation')}
            </blockquote>

            <figcaption className={styles.citationAuteur}>
              {/*
                Les initiales sont CALCULÉES depuis le nom : recopier « MF »
                à côté du nom créerait deux sources, et la seconde survivrait
                à un changement de la première.
              */}
              <span className={styles.initiales} aria-hidden="true">
                {initiales(nomFondatrice)}
              </span>
              <span className={styles.citationNom}>
                {nomFondatrice}
                <span className={styles.citationRole}>
                  {traduire(langue, 'v2.aproposFondatriceRole')}
                </span>
              </span>
            </figcaption>
          </figure>
        </Revele>

        {/* ── Les quatre principes ──────────────────────────────────────── */}
        <section className={boutique.bloc}>
          <span className={accueil.oeil}>{traduire(langue, 'v2.aproposValeursOeil')}</span>
          <h2 className={accueil.titreSection} style={{ marginBottom: '28px' }}>
            {traduire(langue, 'v2.aproposValeursTitre')}
          </h2>

          <ol className={styles.valeurs}>
            {VALEURS.map((valeur, rang) => (
              <li key={valeur.titre}>
                <Revele rang={rang}>
                  <div className={styles.valeur}>
                    <span className={styles.valeurNumero} aria-hidden="true">
                      {rang + 1}
                    </span>
                    <p className={styles.valeurTitre}>
                      {traduire(langue, valeur.titre as CleTraduction)}
                    </p>
                    <p className={styles.valeurCorps}>
                      {traduire(langue, valeur.corps as CleTraduction)}
                    </p>
                  </div>
                </Revele>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Le catalogue en preuve ────────────────────────────────────── */}
        {couvertures.length > 0 ? (
          <section className={boutique.bloc}>
            <span className={accueil.oeil}>{traduire(langue, 'v2.aproposCatalogueOeil')}</span>
            <h2 className={accueil.titreSection} style={{ marginBottom: '28px' }}>
              {traduire(langue, 'v2.aproposCatalogueTitre')}
            </h2>

            <ul className={styles.mur}>
              {couvertures.map((entree, rang) => (
                <li key={entree.id}>
                  <Revele rang={rang}>
                    <a className={styles.murCarte} href={`/${langue}/contes/${entree.slug}`}>
                      {entree.couverture ? (
                        <img
                          src={entree.couverture.vignette}
                          width={320}
                          height={480}
                          loading="lazy"
                          decoding="async"
                          // Le titre est le libellé du lien qui l'entoure :
                          // le répéter le ferait entendre deux fois.
                          alt=""
                          className={styles.murImage}
                        />
                      ) : null}
                      <span className="sr-only">{entree.titre}</span>
                    </a>
                  </Revele>
                </li>
              ))}
            </ul>

            <div style={{ marginTop: '32px' }}>
              <a className={accueil.boutonVert} href={`/${langue}/catalogue`}>
                {traduire(langue, 'accueil.voirTout')}
              </a>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
