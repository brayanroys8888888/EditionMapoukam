import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { EntreeCatalogue } from '@/domain/catalog/types';
import { Couverture, SubstitutCouverture } from '@/components/catalogue/couverture';
import { teinteDepuisThemes } from '@/components/motif';
import styles from './livret.module.css';

/**
 * LE KIT OFFERT, MIS EN AVANT — rayon des livrets, direction Organic.
 *
 * Prototype d'Organic (le `.dc.html` du dossier de reprise), lignes 1116 à
 * 1136 — son nom de fichier n'est pas écrit ici : il porte le nom commercial,
 * et `i18n.test.ts` refuse que ce nom s'écrive ailleurs que dans `marque.nom`,
 * commentaires compris. Toutes les cotes en sont transcrites : grille
 * `1.25fr .75fr`, rayon 34, couverture à
 * 330 px de haut au minimum, corps à 34 px de rembourrage, objectifs cochés,
 * deux boutons dont le premier occupe le reste de la ligne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL NE RECALCULE AUCUN DROIT — IL N'EN LIT MÊME PAS.                     │
 * │                                                                          │
 * │ Le panneau ne s'affiche que pour un titre `gratuit`, et c'est le RAYON   │
 * │ qui le choisit ainsi. Ici, `gratuit` est un booléen LU sur l'entrée,     │
 * │ jamais dérivé : `frontend-architecture` interdit qu'un composant déduise │
 * │ un droit, et « offert » en est un.                                       │
 * │                                                                          │
 * │ Les deux boutons ne sont donc pas des promesses : ils mènent à la fiche  │
 * │ et au lecteur, qui vérifient l'un comme l'autre les droits côté serveur  │
 * │ à chaque requête. Un panneau ne peut pas ouvrir une porte.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PASTILLE SAUGE NE PORTE PAS DE BLANC — DÉPART ASSUMÉ.                │
 * │                                                                          │
 * │ La maquette écrit du blanc sur la sauge. Mesuré, ce couple vaut 3,73:1,  │
 * │ sous les 4,5:1 qu'exige WCAG 2.1 AA pour du texte — et le cahier des     │
 * │ charges §5.3 fixe AA. La sauge garde donc sa place d'aplat et reçoit     │
 * │ l'olive profond, ce que le douzième rôle (`--second` / `--second-contre`) │
 * │ nomme précisément.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/*
 * La couverture est demandée large : elle occupe 1,25 colonne sur 2 d'un
 * panneau qui va jusqu'à 1240 px, soit environ 690 px à l'écran le plus large.
 */
const COUVERTURE_LARGEUR = 720;
const COUVERTURE_HAUTEUR = 495;

/** La coche des objectifs — un tracé, pas un caractère. */
function Coche(): ReactNode {
  return (
    <svg
      className={styles.coche}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  );
}

export function LivretMisEnAvant({
  langue,
  entree,
}: {
  langue: LangueInterface;
  entree: EntreeCatalogue;
}): ReactNode {
  const fiche = `/${langue}/contes/${entree.slug}`;

  return (
    <article className={styles.panneau}>
      {/*
       * `data-orientation` : une planche DEBOUT se contient dans un cadre
       * couché, elle ne s'y recadre pas — même raison que sur la carte, écrite
       * en long dans `carte-conte.tsx`. Ici le cadre est encore plus large que
       * sur une carte, et le recadrage y coûterait davantage.
       */}
      <div className={styles.visuel} data-orientation={entree.orientation}>
        {/*
         * La taille `mise_en_avant` existe pour exactement cet emploi : une
         * image de 690 px servie en vignette serait floue, et servie en pleine
         * taille coûterait le double du poids utile.
         */}
        {entree.couverture ? (
          <Couverture
            langue={langue}
            url={entree.couverture.mise_en_avant}
            largeur={COUVERTURE_LARGEUR}
            hauteur={COUVERTURE_HAUTEUR}
            tailles="(max-width: 880px) 100vw, 690px"
            teinte={teinteDepuisThemes(entree.themes)}
            /* Vide : le titre est écrit dans la colonne de droite, et le
               redire ferait entendre deux fois la même phrase. */
            alt=""
            classeImage={styles.image}
          />
        ) : (
          <SubstitutCouverture langue={langue} teinte={teinteDepuisThemes(entree.themes)} />
        )}

        {/*
         * La pastille est décorative : « Gratuit » est répété par le bouton
         * d'ouverture et par la carte du même titre dans la grille.
         */}
        <span className={styles.pastille} aria-hidden="true">
          {/*
           * « 1 fiche », jamais « 1 fiches » — deux clés, pas une règle de
           * pluriel : le singulier ne se fabrique pas en retirant un « s ».
           * Même arbitrage que `catalogue.nbPagesUne`, et le défaut s'est
           * montré le même jour, sur les mêmes feuilles d'une page.
           */}
          {entree.nb_pages === 1
            ? traduire(langue, 'livrets.miseEnAvantBadgeUne')
            : traduire(langue, 'livrets.miseEnAvantBadge').replace(
                '{n}',
                String(entree.nb_pages ?? 0),
              )}
        </span>
      </div>

      <div className={styles.corps}>
        {entree.niveau ? (
          <span className={styles.niveau}>{entree.niveau}</span>
        ) : null}

        <h2 className={styles.titre}>
          {/*
           * Le titre du panneau est un LIEN, comme celui d'une carte : il est
           * la première chose qu'on vise, et un titre mort obligerait à
           * chercher le bouton pour faire ce qu'on croyait pouvoir faire ici.
           */}
          <a className={styles.titreLien} href={fiche}>
            {entree.titre}
          </a>
        </h2>

        {entree.resume ? <p className={styles.resume}>{entree.resume}</p> : null}

        {/*
         * Les objectifs — colonne `objectifs`, migration 0079.
         *
         * Une LISTE et non une suite de paragraphes : le nombre d'objectifs
         * est une information, et un lecteur d'écran annonce « liste de
         * quatre éléments » avant de les lire. La maquette les écrit en `<p>`,
         * ce qui les rend indistincts les uns des autres.
         */}
        {entree.objectifs.length > 0 ? (
          <ul className={styles.objectifs}>
            {entree.objectifs.map((objectif) => (
              <li key={objectif} className={styles.objectif}>
                <Coche />
                {objectif}
              </li>
            ))}
          </ul>
        ) : null}

        <div className={styles.actions}>
          <a className={styles.actionPrincipale} href={fiche}>
            {traduire(langue, 'livrets.miseEnAvantOuvrir')}
          </a>
          <a className={styles.actionSecondaire} href={`/${langue}/lire/${entree.slug}`}>
            {traduire(langue, 'livrets.miseEnAvantFeuilleter')}
          </a>
        </div>
      </div>
    </article>
  );
}
