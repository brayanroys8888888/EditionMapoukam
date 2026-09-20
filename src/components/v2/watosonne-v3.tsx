import type { ReactNode } from 'react';

import type { LangueInterface } from '@/i18n';
import { IDENTITE_EDITEUR } from '@/content/editorial';
import { lirePresentationWatosonne } from '@/content/watosonne';

import { Revele } from './revele';
import styles from './watosonne-v3.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ WATOSONNE CONSULTING — L'ÉCRAN ORGANIC.                                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Prototype, lignes 940 à 1094. Les mesures sont dans la feuille voisine ; ce
 * fichier ne porte que la structure et les données.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PROFIL MONTE DANS LE HÉROS, À LA PLACE DE LA CERTIFICATION.          │
 * │                                                                          │
 * │ Chez Mapoukam, le panneau de droite porte la certification de l'institut │
 * │ — c'est ce qui fonde l'autorité d'un cabinet pédagogique. Ici il porte   │
 * │ une PERSONNE : Mr. WATO, son ancienneté, son diplôme. En conseil aux     │
 * │ entreprises, on n'achète pas un label, on achète quelqu'un.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE REQUÊTE, ET C'EST VOULU.                                         │
 * │                                                                          │
 * │ Tout vient de `src/content/watosonne.ts`, versionné. La page s'affiche   │
 * │ donc Docker éteint — on la montre en rendez-vous — sans état de          │
 * │ chargement, et sans aucun droit à vérifier puisque aucune ligne n'est    │
 * │ réservée.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES BOUTONS MÈNENT À `/contact`, ILS N'ENVOIENT RIEN.                   │
 * │                                                                          │
 * │ Il n'existe aucune route qui reçoive un message, et aucun prestataire    │
 * │ d'envoi — `FileMailer` écrit dans `.mails/`, ce n'est pas un canal vers  │
 * │ le cabinet. Un formulaire de devis posé ici dirait « demande envoyée » à │
 * │ un prospect dont personne ne recevrait la demande : sur une page de      │
 * │ vente, c'est le plus coûteux des faux positifs.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** L'ancre du bloc des prestations — le second bouton du héros y descend. */
const ANCRE_PRESTATIONS = 'offres-watosonne';

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

export function WatosonneV3({ langue }: { langue: LangueInterface }): ReactNode {
  const presentation = lirePresentationWatosonne(langue);
  const [premiereLigne, secondeLigne] = presentation.titreLignes;

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
        <span className={styles.heroCercleVert} aria-hidden="true" />
        <span className={styles.heroCercleTerre} aria-hidden="true" />

        <div className={styles.heroInterieur}>
          <div>
            <span className={styles.oeil}>
              <span className={styles.oeilTrait} aria-hidden="true" />
              {presentation.oeil}
            </span>

            {/*
              Le titre est coupé en deux lignes par le CONTENU, pas par le
              navigateur : à 72 px il tiendrait mal sur une seule, et laisser
              la coupure au hasard de la fenêtre donnerait « Watosonne Con- /
              sulting ». Les deux lignes restent un seul `h1`, donc un seul
              titre pour un lecteur d'écran.
            */}
            <h1 className={styles.titre}>
              {premiereLigne}
              <br />
              {secondeLigne}
            </h1>

            <p className={styles.accroche}>{presentation.accroche}</p>
            <p className={styles.argument}>{presentation.argument}</p>

            <div className={styles.heroActions}>
              <a className={styles.boutonPrincipal} href={`/${langue}/contact`}>
                {presentation.actionDevis}
              </a>
              <a className={styles.boutonSecondaire} href={`#${ANCRE_PRESTATIONS}`}>
                {presentation.actionPrestations}
              </a>
            </div>
          </div>

          {/* ── Le profil ───────────────────────────────────────────────── */}
          <div className={styles.profil}>
            <span className={styles.profilCadre} aria-hidden="true" />

            <div className={styles.profilPanneau}>
              <div className={styles.profilEntete}>
                {/*
                  Les initiales doublent le nom écrit juste à côté : les
                  annoncer ferait entendre « M W, profil exécutif, Mr. WATO ».
                */}
                <span className={styles.profilInitiales} aria-hidden="true">
                  {presentation.profil.initiales}
                </span>
                <div>
                  <p className={styles.profilOeil}>{presentation.profil.oeil}</p>
                  <p className={styles.profilNom}>{presentation.profil.nom}</p>
                </div>
              </div>

              <p className={styles.profilTitre}>{presentation.profil.titre}</p>

              <ul className={styles.profilReperes}>
                {presentation.profil.reperes.map((repere) => (
                  <li className={styles.profilRepere} key={repere}>
                    {repere}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Les trois promesses ─────────────────────────────────────── */}
        <div className={styles.promesses}>
          <ol className={styles.promessesGrille}>
            {presentation.promesses.map((promesse, rang) => (
              <li className={styles.promesse} key={promesse}>
                {/*
                  Le numéro est un ORNEMENT : la liste est ordonnée, et un
                  lecteur d'écran annonce déjà « élément 2 sur 3 ».
                */}
                <span className={styles.promesseRang} aria-hidden="true">
                  {String(rang + 1).padStart(2, '0')}
                </span>
                <span className={styles.promesseTexte}>{promesse}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Notre cadre ───────────────────────────────────────────────── */}
      <section className={styles.sectionCadre}>
        <Revele>
          <div className={styles.cadreGrille}>
            <div>
              <span className={styles.oeilClair}>{presentation.cadre.oeil}</span>
              <h2 className={styles.cadreTitre}>{presentation.cadre.titre}</h2>
            </div>

            <div className={styles.cadreTexte}>
              {presentation.cadre.paragraphes.map((paragraphe) => (
                <p className={styles.cadreParagraphe} key={paragraphe}>
                  {paragraphe}
                </p>
              ))}
            </div>
          </div>
        </Revele>
      </section>

      {/* ── Les trois prestations ─────────────────────────────────────── */}
      <section className={styles.sectionPrestations} id={ANCRE_PRESTATIONS}>
        <Revele>
          <div className={styles.prestationsEntete}>
            <div className={styles.prestationsIntitule}>
              <span className={styles.oeilClair}>{presentation.prestationsOeil}</span>
              <h2 className={styles.prestationsTitre}>{presentation.prestationsTitre}</h2>
            </div>
            <p className={styles.prestationsNote}>{presentation.prestationsTexte}</p>
          </div>
        </Revele>

        <ol className={styles.prestations}>
          {presentation.prestations.map((prestation, rang) => (
            <li key={prestation.cle}>
              <Revele>
                <article className={styles.prestation}>
                  <div className={styles.prestationIntitule}>
                    <span className={styles.prestationRang} aria-hidden="true">
                      {rang + 1}
                    </span>
                    <h3 className={styles.prestationTitre}>{prestation.titre}</h3>
                    <p className={styles.prestationCadrage}>{prestation.tarifPrecision}</p>
                    <a className={styles.boutonDevis} href={`/${langue}/contact`}>
                      {presentation.actionDevis}
                    </a>
                  </div>

                  <div>
                    <p className={styles.gainsTitre}>{presentation.gainsTitre}</p>
                    <ul className={styles.gains}>
                      {prestation.gains.map((gain) => (
                        <li className={styles.gain} key={gain}>
                          <Coche />
                          {gain}
                        </li>
                      ))}
                    </ul>

                    {/*
                      Les livrables ne sont portés que par la conception de
                      documents. L'absence n'est pas un trou : « concevoir des
                      documents stratégiques » a besoin de sa liste pour vouloir
                      dire quelque chose, « auditer une entreprise » non.
                    */}
                    {prestation.documents ? (
                      <div className={styles.documents}>
                        <p className={styles.documentsTitre}>{presentation.documentsTitre}</p>
                        <ul className={styles.documentsListe}>
                          {prestation.documents.map((document) => (
                            <li className={styles.document} key={document}>
                              {document}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </article>
              </Revele>
            </li>
          ))}
        </ol>
      </section>

      {/* ── L'appel final ─────────────────────────────────────────────── */}
      <section className={styles.sectionAppel}>
        <Revele>
          <div className={styles.appel}>
            <span className={styles.appelCercle} aria-hidden="true" />

            <div className={styles.appelTexte}>
              <h2 className={styles.appelTitre}>{presentation.appel.titre}</h2>
              <p className={styles.appelParagraphe}>{presentation.appel.texte}</p>
            </div>

            <div className={styles.appelActions}>
              <a className={styles.appelBouton} href={`/${langue}/contact`}>
                {presentation.appel.action}
              </a>

              {/*
                Le numéro s'affiche TEL QU'IL EST ÉCRIT, espaces compris, et
                c'est le `href` qui les retire : un numéro lisible se retient,
                un numéro collé se recopie mal. Vide, la ligne disparaît.
              */}
              {telephone ? (
                <a
                  className={styles.appelLien}
                  href={`tel:${telephone}`}
                  aria-label={presentation.appel.actionAppel}
                >
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
