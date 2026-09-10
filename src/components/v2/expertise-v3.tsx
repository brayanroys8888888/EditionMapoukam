import type { ReactNode } from 'react';

import type { LangueInterface } from '@/i18n';
import { IDENTITE_EDITEUR } from '@/content/editorial';
import {
  REALISATIONS,
  VIDEO_PRESENTATION,
  lirePresentationConsulting,
} from '@/content/consulting';

import { Revele } from './revele';
import styles from './expertise-v3.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ EXPERTISE & CONSEIL — L'ÉCRAN ORGANIC.                                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Prototype, lignes 838 à 922. Les mesures sont dans la feuille voisine ; ce
 * fichier ne porte que la structure et les données.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA SECTION « QUI NOUS SOMMES » MONTE DANS LE HÉROS.                     │
 * │                                                                          │
 * │ La V2 ouvrait sur un bandeau, puis consacrait une section entière à la   │
 * │ certification INSEI, en prose pleine largeur. Le prototype en fait un    │
 * │ PANNEAU, à droite du titre : la promesse et sa preuve se lisent d'un     │
 * │ seul regard, ce qui est exactement ce qu'on demande à une page qui vend  │
 * │ une expertise.                                                           │
 * │                                                                          │
 * │ Les trois engagements de cette même section — sur mesure, tarifs         │
 * │ annoncés d'avance, méthodes validées — restent dans le panneau, en       │
 * │ lignes cochées. Le prototype ne les a pas ; le produit oui, et ce sont   │
 * │ les trois objections d'un directeur d'école à un cabinet.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE REQUÊTE, ET C'EST VOULU.                                         │
 * │                                                                          │
 * │ Tout vient de `src/content/consulting.ts`, versionné. La page s'affiche  │
 * │ donc Docker éteint — un commercial qui la montre en rendez-vous ne       │
 * │ dépend pas de la base — sans état de chargement, et sans aucun droit à   │
 * │ vérifier puisque aucune ligne n'est réservée.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES BOUTONS MÈNENT À `/contact`, ILS N'ENVOIENT RIEN.                   │
 * │                                                                          │
 * │ Il n'existe aucune route qui reçoive un message, et aucun prestataire    │
 * │ d'envoi. Un formulaire de devis posé ici dirait « demande envoyée » à un │
 * │ prospect dont personne ne recevrait la demande : sur une page de vente,  │
 * │ c'est le plus coûteux des faux positifs. Le second lien compose le       │
 * │ numéro — c'est le geste réel du public visé.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** L'ancre du bloc des tarifs — le second bouton du héros y descend. */
const ANCRE_TARIFS = 'offres-consulting';

/** La coche du dossier : 16 px, trait de 3, sans remplissage. */
function Coche(): ReactNode {
  return (
    <svg
      className={styles.coche}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  );
}

export function ExpertiseV3({ langue }: { langue: LangueInterface }): ReactNode {
  const presentation = lirePresentationConsulting(langue);
  const section = presentation.sections[0];

  /*
   * Le numéro sans ses espaces : composé au doigt, un `tel:` espacé est refusé
   * par certains combinés. Vide, la ligne disparaît — `IDENTITE_EDITEUR`
   * n'affiche jamais une coordonnée à moitié.
   */
  const telephone = IDENTITE_EDITEUR.telephone.replace(/\s/g, '');

  return (
    <>
      {/* ── Le héros ──────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <span className={styles.heroCercle} aria-hidden="true" />

        <div className={styles.heroInterieur}>
          <div>
            <span className={styles.oeil}>{presentation.oeil}</span>
            <h1 className={styles.titre}>{presentation.titre}</h1>
            <p className={styles.accroche}>{presentation.accroche}</p>
            <p className={styles.argument}>{presentation.argument}</p>

            <div className={styles.heroActions}>
              <a className={styles.boutonPrincipal} href={`/${langue}/contact`}>
                {presentation.actionAccompagnement}
              </a>
              {/*
                Une ancre, et non un défilement en JavaScript : elle marche
                sans hydratation, se partage, et `scroll-behavior` est déjà
                coupé sous mouvement réduit par le filet de `tokens.css`.
              */}
              <a className={styles.boutonSecondaire} href={`#${ANCRE_TARIFS}`}>
                {presentation.actionTarifs}
              </a>
            </div>
          </div>

          {section ? (
            <div className={styles.preuve}>
              {section.paragraphes?.map((paragraphe) => (
                <p className={styles.preuveTexte} key={paragraphe}>
                  {paragraphe}
                </p>
              ))}

              {section.points ? (
                <ul className={styles.engagements}>
                  {section.points.map((point) => (
                    <li className={styles.engagement} key={point}>
                      <Coche />
                      {point}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Les trois prestations ─────────────────────────────────────── */}
      <section className={styles.sectionPrestations} id={ANCRE_TARIFS}>
        <Revele>
          <div className={styles.enTete}>
            <span className={styles.oeilClair}>{presentation.prestationsOeil}</span>
            <h2 className={styles.titreSection}>{presentation.prestationsTitre}</h2>
            <p className={styles.enTeteTexte}>{presentation.prestationsTexte}</p>
          </div>
        </Revele>

        <Revele>
          <ol className={styles.prestations}>
            {presentation.prestations.map((prestation, rang) => (
              <li
                key={prestation.cle}
                className={`${styles.prestation} ${prestation.vedette ? styles.vedette : ''}`}
              >
                <div className={styles.prestationHaut}>
                  {/*
                    Le rang est DÉCORATIF : la liste est déjà ordonnée, et un
                    lecteur d'écran annonce « élément 2 sur 3 ».
                  */}
                  <span className={styles.rang} aria-hidden="true">
                    {rang + 1}
                  </span>

                  {/*
                    La pastille, elle, ne l'est pas : elle porte une
                    recommandation qu'aucun autre élément de la carte ne donne.
                  */}
                  {prestation.vedette ? (
                    <span className={styles.pastilleVedette}>{prestation.vedette}</span>
                  ) : null}
                </div>

                <h3 className={styles.prestationTitre}>{prestation.titre}</h3>

                {/*
                  Le tarif est une PHRASE de devis — « à partir de », sa
                  monnaie et sa réserve comprises. Il n'est jamais recomposé
                  depuis un nombre : le franc CFA n'a pas de sous-unité, et
                  une division par cent écrite ici multiplierait l'erreur par
                  cent sur chaque ligne.
                */}
                <p className={styles.tarif}>{prestation.tarif}</p>
                {prestation.tarifPrecision ? (
                  <p className={styles.tarifPrecision}>{prestation.tarifPrecision}</p>
                ) : null}

                <p className={styles.gainsTitre}>{presentation.gainsTitre}</p>
                <ul className={styles.gains}>
                  {prestation.gains.map((gain) => (
                    <li className={styles.gain} key={gain}>
                      <Coche />
                      {gain}
                    </li>
                  ))}
                </ul>

                <p className={styles.pourquoi}>{prestation.pourquoi}</p>

                <a className={styles.boutonDevis} href={`/${langue}/contact`}>
                  {presentation.actionDevis}
                </a>
              </li>
            ))}
          </ol>
        </Revele>
      </section>

      {/* ── Les réalisations ──────────────────────────────────────────── */}
      <section className={styles.sectionRealisations}>
        <Revele>
          <div className={styles.enTeteRealisations}>
            <span className={styles.oeilClair}>{presentation.realisationsTitre}</span>
            <h2 className={styles.titreRealisations}>{presentation.realisationsAccroche}</h2>
            <p className={styles.enTeteTexte}>{presentation.realisationsTexte}</p>
          </div>
        </Revele>

        <Revele>
          <ul className={styles.mosaique}>
            {REALISATIONS.map((realisation) => (
              <li className={styles.realisation} key={realisation.cle}>
                <figure className={styles.figure}>
                  {/*
                    La légende est portée par `figcaption`, jamais par `alt` :
                    elle est VISIBLE, et la répéter en texte de remplacement
                    la ferait lire deux fois de suite — la première annoncée
                    comme une image. Le prototype fait les deux ; c'est le
                    défaut que `images-discipline` interdit ici.

                    `width` et `height` réservent la place : onze visuels sur
                    une page, dont un seul est visible au premier écran.
                  */}
                  <img
                    className={styles.visuel}
                    src={`/images/expertise/${realisation.fichier}`}
                    alt=""
                    width={realisation.largeur}
                    height={realisation.hauteur}
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption className={styles.legende}>
                    {presentation.legendes[realisation.cle]}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </Revele>

        {/* ── La vidéo ────────────────────────────────────────────────── */}
        <Revele>
          <figure className={styles.video}>
            {/*
              `preload="none"` : un mégaoctet et demi ne descend que si le
              visiteur presse « lecture ». L'affiche, elle, est une image que
              la mosaïque a déjà chargée — elle ne coûte rien de plus.
            */}
            <video
              className={styles.lecteur}
              controls
              preload="none"
              playsInline
              poster={`/images/expertise/${VIDEO_PRESENTATION.affiche}`}
            >
              <source src={`/images/expertise/${VIDEO_PRESENTATION.fichier}`} type="video/mp4" />
            </video>
            <figcaption className={styles.videoLegende}>{presentation.videoLegende}</figcaption>
          </figure>
        </Revele>
      </section>

      {/* ── L'appel au contact ────────────────────────────────────────── */}
      <section className={styles.sectionAppel}>
        <Revele>
          <div className={styles.appel}>
            <div>
              <h2 className={styles.appelTitre}>{presentation.appel.titre}</h2>
              <p className={styles.appelTexte}>{presentation.appel.texte}</p>
            </div>

            <div className={styles.appelActions}>
              <a className={styles.appelAction} href={`/${langue}/contact`}>
                {presentation.appel.action}
              </a>

              {/*
                Le prototype écrit le NUMÉRO sur ce bouton, et il a raison :
                sur une page qui vend un accompagnement, un numéro visible est
                une preuve qu'on décroche. Il vient de `IDENTITE_EDITEUR`,
                jamais recopié.
              */}
              {telephone ? (
                <a className={styles.appelAppel} href={`tel:${telephone}`}>
                  {IDENTITE_EDITEUR.telephone}
                </a>
              ) : null}
            </div>
          </div>
        </Revele>
      </section>
    </>
  );
}
