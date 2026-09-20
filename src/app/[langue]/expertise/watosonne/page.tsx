import type { Metadata } from 'next';

import { langueValide } from '@/i18n';
import { IDENTITE_EDITEUR } from '@/content/editorial';
import { lirePresentationWatosonne } from '@/content/watosonne';
import { WatosonneV3 } from '@/components/v2/watosonne-v3';
import { estV3 } from '@/design/version';
import styles from '@/components/v2/expertise.module.css';
import boutique from '@/components/v2/boutique.module.css';

/**
 * EXPERTISE & CONSEIL — Watosonne Consulting.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SECOND CABINET, SOUS `/expertise/watosonne`.                         │
 * │                                                                          │
 * │ L'entrée « Expertise & conseil » du menu est devenue DÉROULANTE et porte │
 * │ désormais deux cabinets. Le chemin dit la parenté : Watosonne est sous   │
 * │ `/expertise`, pas à côté — un visiteur qui remonte d'un cran arrive sur  │
 * │ Mapoukam, qui est l'autre moitié de la même offre de conseil.            │
 * │                                                                          │
 * │ `enveloppe/v2.tsx` allume les DEUX entrées du menu sur le préfixe        │
 * │ `/expertise`, ce qui est juste : le dépliant reste ouvert quand on       │
 * │ passe de l'un à l'autre.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN NE FAIT AUCUNE REQUÊTE, ET C'EST VOULU.                       │
 * │                                                                          │
 * │ Tout ce qu'il affiche vient de `src/content/watosonne.ts`, versionné.    │
 * │ Conséquences, toutes recherchées :                                       │
 * │                                                                          │
 * │ • il s'affiche même Docker éteint — on montre cette page en rendez-vous ;│
 * │ • il n'a pas d'état de chargement, donc pas d'écran vide sur connexion   │
 * │   lente ;                                                                │
 * │ • il n'y a rien à protéger : aucune ligne n'est réservée, donc aucun     │
 * │   droit à vérifier, donc aucune règle d'accès à recopier.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  const presentation = lirePresentationWatosonne(langue);
  return { title: presentation.titre, description: presentation.chapeau };
}

export default async function PageWatosonne({ params }: Parametres) {
  const langue = langueValide((await params).langue);
  const presentation = lirePresentationWatosonne(langue);

  /*
   * Le numéro sans ses espaces : composé au doigt, un `tel:` espacé est
   * refusé par certains combinés. Vide, la ligne disparaît — `IDENTITE_EDITEUR`
   * n'affiche jamais une coordonnée à moitié.
   */
  const telephone = IDENTITE_EDITEUR.telephone.replace(/\s/g, '');

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ SOUS ORGANIC, L'ÉCRAN EST CELUI DU PROTOTYPE. AILLEURS, IL EXISTE    │
   * │ QUAND MÊME.                                                          │
   * │                                                                      │
   * │ Le prototype ne décrit que la V3, et c'est la version servie. Mais    │
   * │ une page qui ne s'afficherait que sous un thème serait une page à     │
   * │ moitié livrée : le commutateur de `src/design/version.ts` existe pour │
   * │ qu'on puisse revenir en arrière, et un retour en arrière qui vide un  │
   * │ écran du menu n'est pas un retour en arrière.                         │
   * │                                                                      │
   * │ La V2 rend donc le MÊME contenu dans les briques éditoriales déjà     │
   * │ employées par `/expertise` — bannière, sections, appel. Aucune        │
   * │ nouvelle feuille : ce qui n'est pas dessiné est emprunté.             │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  if (estV3()) {
    return <WatosonneV3 langue={langue} />;
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
        {/* ── Le cadre, et le profil ───────────────────────────────────── */}
        <div className={styles.presentation}>
          <section>
            <h2>{presentation.cadre.titre}</h2>

            {presentation.cadre.paragraphes.map((paragraphe) => (
              <p key={paragraphe}>{paragraphe}</p>
            ))}

            <ul>
              {presentation.promesses.map((promesse) => (
                <li key={promesse}>{promesse}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2>{presentation.profil.nom}</h2>
            <p>{presentation.profil.titre}</p>

            <ul>
              {presentation.profil.reperes.map((repere) => (
                <li key={repere}>{repere}</li>
              ))}
            </ul>
          </section>

          {/* ── Les trois prestations ──────────────────────────────────── */}
          {presentation.prestations.map((prestation) => (
            <section key={prestation.cle}>
              <h2>{prestation.titre}</h2>
              <p>{prestation.tarifPrecision}</p>

              <ul>
                {prestation.gains.map((gain) => (
                  <li key={gain}>{gain}</li>
                ))}
              </ul>

              {prestation.documents ? (
                <ul>
                  {prestation.documents.map((document) => (
                    <li key={document}>{document}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

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
