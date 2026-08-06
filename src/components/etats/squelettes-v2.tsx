import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import styles from './squelettes-v2.module.css';

/**
 * SQUELETTES DE CHARGEMENT — DIRECTION V2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE FICHIER VIT DANS `etats/` ET NON DANS `v2/`.                │
 * │                                                                          │
 * │ Un test d'architecture n'autorise QUE la couche partagée — `etats` et    │
 * │ `base` — à fabriquer un indicateur de chargement ; les écrans doivent    │
 * │ la consommer. Il a signalé ce fichier quand il vivait sous `v2/`, et il  │
 * │ avait raison : treize écrans qui réinventent chacun leur affichage       │
 * │ produisent treize comportements sur connexion lente — la condition la    │
 * │ plus courante de cette audience, et celle qu'on voit le moins en         │
 * │ écrivant le code.                                                        │
 * │                                                                          │
 * │ Ces squelettes SONT une couche partagée : trois routes les emploient.    │
 * │ Ils appartiennent donc ici, et non à côté des écrans qui les affichent.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST ANNONCÉ À QUI ÉCOUTE, ET CE QUI NE L'EST PAS.                │
 * │                                                                          │
 * │ Le squelette entier est `aria-busy` et porte UN seul libellé — « en      │
 * │ cours de chargement ». Les blocs gris, eux, sont `aria-hidden` : sans    │
 * │ cela un lecteur d'écran énumérerait douze cadres vides, ce qui est plus  │
 * │ pénible qu'un silence.                                                   │
 * │                                                                          │
 * │ `role="status"` plutôt que `alert` : l'arrivée d'un contenu n'est pas    │
 * │ une urgence, et `alert` interromprait la lecture en cours.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Un bloc gris animé. Décoratif, donc jamais annoncé. */
function Bloc({ className }: { className?: string }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={className === undefined ? styles.bloc : `${styles.bloc} ${className}`}
    />
  );
}

/** Le bandeau vert de tête, commun aux pages intérieures. */
function Banniere(): ReactNode {
  return (
    <div className={styles.banniere} aria-hidden="true">
      <div className={styles.banniereInterieur}>
        <Bloc className={styles.banniereTitre} />
        <Bloc className={styles.banniereTexte} />
      </div>
    </div>
  );
}

/** L'enveloppe accessible commune aux trois squelettes. */
function Cadre({
  langue,
  children,
}: {
  langue: LangueInterface;
  children: ReactNode;
}): ReactNode {
  return (
    <div role="status" aria-busy="true" aria-label={traduire(langue, 'etats.chargement')}>
      {children}
    </div>
  );
}

/**
 * Une grille de cartes de conte — catalogue, accueil.
 *
 * Le nombre de cartes correspond à ce qu'une page rend réellement : trop peu
 * et la page saute vers le bas à l'arrivée, trop et elle saute vers le haut.
 */
export function SqueletteGrille({
  langue,
  nombre = 8,
  avecBanniere = true,
}: {
  langue: LangueInterface;
  nombre?: number;
  avecBanniere?: boolean;
}): ReactNode {
  return (
    <Cadre langue={langue}>
      {avecBanniere ? <Banniere /> : null}

      <div className={styles.page}>
        <ul className={styles.grille}>
          {Array.from({ length: nombre }, (_, rang) => (
            <li key={rang} className={styles.carte}>
              {/* Le rapport 2/3 réserve la HAUTEUR RÉELLE de la couverture :
                  c'est ce bloc, et lui seul, qui empêche le saut de page. */}
              <Bloc className={styles.couverture} />
              <Bloc className={`${styles.ligne} ${styles.ligneCourte}`} />
              <Bloc className={`${styles.ligne} ${styles.ligneTitre}`} />
              <Bloc className={`${styles.ligne} ${styles.ligneMoyenne}`} />
              <Bloc className={styles.bouton} />
            </li>
          ))}
        </ul>
      </div>
    </Cadre>
  );
}

/** La fiche d'un conte — deux colonnes, couverture à gauche. */
export function SqueletteFiche({ langue }: { langue: LangueInterface }): ReactNode {
  return (
    <Cadre langue={langue}>
      <Banniere />

      <div className={styles.page}>
        <div className={styles.fiche}>
          <div className={styles.ficheVisuel}>
            <Bloc className={styles.ficheCouverture} />
          </div>

          <div className={styles.ficheColonne}>
            <Bloc className={`${styles.ligne} ${styles.ligneCourte}`} />
            <Bloc className={styles.ficheTitre} />
            <Bloc className={styles.ligne} />
            <Bloc className={styles.ligne} />
            <Bloc className={`${styles.ligne} ${styles.ligneMoyenne}`} />

            {/* Les quatre cases de réponses — âge, pages, formats, langues. */}
            <div className={styles.reponses}>
              {Array.from({ length: 4 }, (_, rang) => (
                <Bloc key={rang} className={styles.reponse} />
              ))}
            </div>

            <Bloc className={styles.achat} />
          </div>
        </div>
      </div>
    </Cadre>
  );
}

/** La liste du blog — un article en vedette, puis des cartes. */
export function SqueletteArticles({
  langue,
  nombre = 4,
}: {
  langue: LangueInterface;
  nombre?: number;
}): ReactNode {
  return (
    <Cadre langue={langue}>
      <Banniere />

      <div className={styles.page}>
        <ul className={styles.articles}>
          {Array.from({ length: nombre }, (_, rang) => (
            <li key={rang} className={styles.article}>
              <Bloc className={styles.articleVisuel} />
              <div className={styles.articleCorps}>
                <Bloc className={`${styles.ligne} ${styles.ligneCourte}`} />
                <Bloc className={`${styles.ligne} ${styles.ligneTitre}`} />
                <Bloc className={styles.ligne} />
                <Bloc className={`${styles.ligne} ${styles.ligneMoyenne}`} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Cadre>
  );
}
