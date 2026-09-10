import type { Metadata } from 'next';

import { langueValide } from '@/i18n';
import { IDENTITE_EDITEUR } from '@/content/editorial';
import {
  REALISATIONS,
  VIDEO_PRESENTATION,
  lirePresentationConsulting,
} from '@/content/consulting';
import { Revele } from '@/components/v2/revele';
import { ExpertiseV3 } from '@/components/v2/expertise-v3';
import { estV3 } from '@/design/version';
import styles from '@/components/v2/expertise.module.css';
import boutique from '@/components/v2/boutique.module.css';

/**
 * EXPERTISE & CONSEIL — Mapoukam Consulting.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN NE FAIT AUCUNE REQUÊTE, ET C'EST VOULU.                       │
 * │                                                                          │
 * │ Tout ce qu'il affiche vient de `src/content/consulting.ts`, versionné.   │
 * │ Conséquences, toutes recherchées :                                       │
 * │                                                                          │
 * │ • il s'affiche même Docker éteint — un commercial qui montre la page en  │
 * │   rendez-vous ne dépend pas de la base ;                                 │
 * │ • il n'a pas d'état de chargement à gérer, donc pas d'écran vide sur     │
 * │   connexion lente ;                                                      │
 * │ • il n'y a rien à protéger : aucune ligne de cette page n'est réservée,  │
 * │   donc aucun droit à vérifier, donc aucune règle d'accès à recopier.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE BOUTON MÈNE À `/contact`, IL N'ENVOIE RIEN.                          │
 * │                                                                          │
 * │ Même raisonnement que `src/app/[langue]/contact/page.tsx` : il n'existe  │
 * │ aujourd'hui aucune route qui reçoive un message, et aucun prestataire    │
 * │ d'envoi — `FileMailer` écrit dans `.mails/`, ce n'est pas un canal vers  │
 * │ l'éditeur. Un formulaire de devis posé ici dirait « demande envoyée » à  │
 * │ un prospect dont personne ne recevrait la demande : sur une page de      │
 * │ vente, c'est le plus coûteux des faux positifs.                          │
 * │                                                                          │
 * │ La page de contact, elle, remet le message dans le logiciel de courrier  │
 * │ du visiteur, où il voit ce qu'il envoie. Le second bouton compose le     │
 * │ numéro — c'est le geste réel du public visé, sur téléphone.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  const presentation = lirePresentationConsulting(langue);
  return { title: presentation.titre, description: presentation.chapeau };
}

export default async function PageExpertise({ params }: Parametres) {
  const langue = langueValide((await params).langue);
  const presentation = lirePresentationConsulting(langue);

  /*
   * Le numéro sans ses espaces : composé au doigt, un `tel:` espacé est
   * refusé par certains combinés. Vide, la ligne disparaît — `IDENTITE_EDITEUR`
   * n'affiche jamais une coordonnée à moitié.
   */
  const telephone = IDENTITE_EDITEUR.telephone.replace(/\s/g, '');

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ SOUS ORGANIC, L'ÉCRAN EST REDESSINÉ — PAS SEULEMENT REPEINT.         │
   * │                                                                      │
   * │ C'est la seule page du site qui OUVRE SUR L'OLIVE, et ce n'est pas   │
   * │ une variation : elle s'adresse à des directions d'école, pas à des   │
   * │ parents. La certification monte dans un panneau à droite du titre,  │
   * │ les trois offres deviennent des cartes à tarif, et les onze visuels  │
   * │ prennent une mosaïque en colonnes plutôt qu'une grille qui les       │
   * │ recadrerait tous au même rapport.                                    │
   * │                                                                      │
   * │ La V2 reste en place, intacte, sous cette condition — le même        │
   * │ partage que sur `/contact` et `/a-propos`.                           │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  if (estV3()) {
    return <ExpertiseV3 langue={langue} />;
  }

  return (
    <>
      <div className={boutique.banniere} data-banniere>
        <div className={boutique.banniereInterieur}>
          <span className={boutique.oeil}>{presentation.oeil}</span>
          <h1 className={boutique.banniereTitre}>{presentation.titre}</h1>
          <p className={boutique.banniereTexte}>{presentation.chapeau}</p>
        </div>
      </div>

      <div className={boutique.page}>
        {/* ── Qui nous sommes ──────────────────────────────────────────── */}
        <div className={styles.presentation}>
          {presentation.sections.map((section) => (
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

        {/* ── Les trois prestations ────────────────────────────────────── */}
        <h2 className={styles.sectionTitre}>{presentation.prestationsTitre}</h2>
        <p className={styles.sectionTexte}>{presentation.prestationsTexte}</p>

        <ul className={styles.prestations}>
          {presentation.prestations.map((prestation, rang) => (
            <li key={prestation.cle} className={styles.prestation}>
              {/*
                Le rang est DÉCORATIF : il numérote trois cartes déjà portées
                par une liste, et un lecteur d'écran annonce déjà « 1 sur 3 ».
                L'entendre deux fois n'ajoute rien.
              */}
              <span className={styles.rang} aria-hidden="true">
                {rang + 1}
              </span>

              <h3 className={styles.prestationTitre}>{prestation.titre}</h3>

              <p className={styles.tarif}>
                <span className={styles.tarifMontant}>{prestation.tarif}</span>
                {prestation.tarifPrecision ? (
                  <span className={styles.tarifPrecision}>{prestation.tarifPrecision}</span>
                ) : null}
              </p>

              <p className={styles.gainsTitre}>{presentation.gainsTitre}</p>
              <ul className={styles.gains}>
                {prestation.gains.map((gain) => (
                  <li key={gain}>{gain}</li>
                ))}
              </ul>

              <p className={styles.pourquoi}>{prestation.pourquoi}</p>
            </li>
          ))}
        </ul>

        {/* ── Les réalisations ─────────────────────────────────────────── */}
        <h2 className={styles.sectionTitre}>{presentation.realisationsTitre}</h2>
        <p className={styles.sectionTexte}>{presentation.realisationsTexte}</p>

        <ul className={styles.realisations}>
          {REALISATIONS.map((realisation, rang) => (
            <li key={realisation.cle} className={styles.realisation}>
              <Revele rang={rang}>
                {/*
                  `loading="lazy"` et les dimensions réelles : onze visuels sur
                  une page, dont un seul est visible au premier écran. Sans
                  `width`/`height`, la place n'est pas réservée et la page
                  saute à chaque image qui arrive — sur réseau lent, pendant
                  plusieurs secondes.

                  La légende est portée par `figcaption`, jamais par `alt` :
                  elle est visible, et la répéter en texte alternatif la ferait
                  lire deux fois de suite. L'image est donc décorative POUR LE
                  LECTEUR D'ÉCRAN, sa description étant juste dessous.
                */}
                <figure className={styles.figure}>
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
              </Revele>
            </li>
          ))}
        </ul>

        {/* ── La vidéo ─────────────────────────────────────────────────── */}
        <figure className={styles.video}>
          {/*
            `preload="none"` : un mégaoctet et demi ne descend que si le
            visiteur presse « lecture ». L'affiche, elle, est une image que la
            grille ci-dessus a déjà chargée — elle ne coûte rien de plus.
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

        {/* ── L'appel au contact ───────────────────────────────────────── */}
        <div className={styles.appel}>
          <h2 className={styles.appelTitre}>{presentation.appel.titre}</h2>
          <p className={styles.appelTexte}>{presentation.appel.texte}</p>
          <p className={styles.appelActions}>
            <a className={styles.bouton} href={`/${langue}/contact`}>
              {presentation.appel.action}
            </a>

            {telephone ? (
              <a className={styles.boutonSecondaire} href={`tel:${telephone}`}>
                {presentation.appel.actionAppel}
              </a>
            ) : null}
          </p>
        </div>
      </div>
    </>
  );
}
