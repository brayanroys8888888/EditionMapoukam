import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { RegionConte } from '@/domain/catalog/types';
import styles from './base.module.css';

/**
 * COMPOSANTS DE BASE — partagés, jamais recopiés localement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MÊME RAISON QUE POUR LES ÉTATS : treize écrans qui réinventent chacun    │
 * │ leur bouton produisent treize hauteurs de cible tactile, treize          │
 * │ contours de focus, et treize façons de rater WCAG.                       │
 * │                                                                          │
 * │ Ce qui est tenu ICI l'est partout : la cible de 44 px, le contour de     │
 * │ focus à 3 px, l'état désactivé qui reste lisible, et l'association       │
 * │ libellé/champ/erreur que les lecteurs d'écran exigent.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════════════════════════
// BOUTON
// ═══════════════════════════════════════════════════════════════════════════

export type VarianteBouton = 'primaire' | 'secondaire' | 'discret';

interface ProprietesBouton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBouton;
  /**
   * Travail en cours.
   *
   * Désactive le bouton ET l'annonce. Un bouton qui se contenterait de
   * disparaître ou de rester actif laisserait double-cliquer — ce qui, sur le
   * téléchargement, déclencherait deux générations de copie filigranée.
   */
  enCours?: boolean;
}

export function Bouton({
  variante = 'primaire',
  enCours = false,
  disabled,
  children,
  className,
  ...reste
}: ProprietesBouton): ReactNode {
  return (
    <button
      // `type` explicite : sans lui, un bouton dans un formulaire vaut
      // `submit` et envoie le formulaire au premier clic. C'est le défaut le
      // plus courant des interfaces React, et le plus surprenant.
      type={reste.type ?? 'button'}
      className={[styles.bouton, styles[variante], className].filter(Boolean).join(' ')}
      disabled={disabled === true || enCours}
      aria-busy={enCours || undefined}
      {...reste}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAMP
// ═══════════════════════════════════════════════════════════════════════════

interface ProprietesChamp extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  libelle: string;
  /** Message d'erreur, déjà traduit. Sa présence marque le champ invalide. */
  erreur?: string;
  /** Aide affichée sous le champ, avant toute erreur. */
  aide?: string;
}

/**
 * Champ de formulaire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS LIENS QUE L'ŒIL FAIT ET QUE LE LECTEUR D'ÉCRAN NE DEVINE PAS.     │
 * │                                                                          │
 * │   * `<label for>` relie le libellé au champ — sans lui, l'utilisateur    │
 * │     entend « zone de saisie » et rien d'autre ;                          │
 * │   * `aria-describedby` relie l'aide ET l'erreur au champ ;               │
 * │   * `aria-invalid` dit qu'il y a erreur, ce que la couleur seule dit     │
 * │     aux seuls voyants.                                                   │
 * │                                                                          │
 * │ Les trois sont posés ici une fois, plutôt qu'oubliés dans un formulaire  │
 * │ sur cinq.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Champ({
  id,
  libelle,
  erreur,
  aide,
  className,
  ...reste
}: ProprietesChamp): ReactNode {
  const idAide = aide ? `${id}-aide` : undefined;
  const idErreur = erreur ? `${id}-erreur` : undefined;
  const decrit = [idAide, idErreur].filter(Boolean).join(' ');

  return (
    <div className={styles.champ}>
      <label htmlFor={id} className={styles.libelle}>
        {libelle}
      </label>
      <input
        id={id}
        className={[styles.saisie, erreur ? styles.saisieInvalide : null, className]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={decrit.length > 0 ? decrit : undefined}
        {...reste}
      />
      {aide ? (
        <p id={idAide} className={styles.aide}>
          {aide}
        </p>
      ) : null}
      {erreur ? (
        // `role="alert"` : l'erreur est annoncée dès qu'elle paraît, sans quoi
        // l'utilisateur resoumet sans savoir ce qui a été refusé.
        <p id={idErreur} className={styles.erreur} role="alert">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASTILLE
// ═══════════════════════════════════════════════════════════════════════════

interface ProprietesPastille {
  children: ReactNode;
  /** Colore la pastille aux couleurs d'une région. */
  region?: RegionConte | null;
  /** Filtre actif — l'état est porté par `aria-pressed`, pas par la couleur. */
  actif?: boolean;
  onClick?: () => void;
  /** Libellé accessible du retrait, quand la pastille est un filtre posé. */
  retrait?: string;
}

/**
 * Pastille de filtre, ou étiquette.
 *
 * Avec `onClick`, c'est un bouton bascule : son état vit dans `aria-pressed`.
 * Le signaler par la seule couleur le rendrait invisible à qui ne la distingue
 * pas — et un filtre actif qu'on ne voit pas est un catalogue qui ment.
 */
export function Pastille({
  children,
  region,
  actif = false,
  onClick,
  retrait,
}: ProprietesPastille): ReactNode {
  const style = region
    ? ({
        '--pastille-fond': `var(--region-${region}-fond)`,
        '--pastille-bordure': `var(--region-${region}-bordure)`,
        '--pastille-encre': `var(--region-${region}-encre)`,
      } as React.CSSProperties)
    : undefined;

  if (!onClick) {
    return (
      <span className={styles.pastille} style={style}>
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={[styles.pastille, styles.pastilleBouton, actif ? styles.pastilleActive : null]
        .filter(Boolean)
        .join(' ')}
      style={style}
      aria-pressed={actif}
      aria-label={retrait}
      onClick={onClick}
    >
      {children}
      {retrait ? <span aria-hidden="true">×</span> : null}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGINATION
// ═══════════════════════════════════════════════════════════════════════════

interface ProprietesPagination {
  langue: LangueInterface;
  page: number;
  pages: number;
  total: number;
  /** Construit l'URL d'une page — la pagination vit dans l'URL, pas en mémoire. */
  lien: (page: number) => string;
}

/**
 * Pagination.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DES LIENS, PAS DES BOUTONS.                                             │
 * │                                                                          │
 * │ Une page de catalogue doit être partageable et survivre au rechargement. │
 * │ Des boutons qui muteraient un état en mémoire perdraient les deux — et   │
 * │ priveraient le référencement (§5.4) de tout accès aux pages suivantes.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Pagination({
  langue,
  page,
  pages,
  total,
  lien,
}: ProprietesPagination): ReactNode {
  if (pages <= 1) return null;

  const precedente = page > 1 ? page - 1 : null;
  const suivante = page < pages ? page + 1 : null;

  return (
    <nav className={styles.pagination} aria-label={traduire(langue, 'pagination.libelle')}>
      {precedente ? (
        <a href={lien(precedente)} className={styles.paginationLien} rel="prev">
          {traduire(langue, 'pagination.precedente')}
        </a>
      ) : (
        <span className={styles.paginationInactif} aria-hidden="true">
          {traduire(langue, 'pagination.precedente')}
        </span>
      )}

      {/* `aria-live` : le compteur change sans rechargement complet, et un
          lecteur d'écran doit l'apprendre autrement qu'en relisant la page. */}
      <p className={styles.paginationCompte} aria-live="polite">
        {traduire(langue, 'pagination.position')
          .replace('{page}', String(page))
          .replace('{pages}', String(pages))
          .replace('{total}', String(total))}
      </p>

      {suivante ? (
        <a href={lien(suivante)} className={styles.paginationLien} rel="next">
          {traduire(langue, 'pagination.suivante')}
        </a>
      ) : (
        <span className={styles.paginationInactif} aria-hidden="true">
          {traduire(langue, 'pagination.suivante')}
        </span>
      )}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU
// ═══════════════════════════════════════════════════════════════════════════

export interface ColonneTableau<T> {
  cle: string;
  entete: string;
  rendu: (ligne: T) => ReactNode;
  /** Colonne numérique : alignée à droite, pour que les montants se comparent. */
  numerique?: boolean;
}

interface ProprietesTableau<T> {
  legende: string;
  colonnes: readonly ColonneTableau<T>[];
  lignes: readonly T[];
  cleLigne: (ligne: T) => string;
  vide?: ReactNode;
}

/**
 * Tableau d'administration.
 *
 * `<caption>` est obligatoire et non optionnel : un tableau sans légende oblige
 * un lecteur d'écran à parcourir les en-têtes pour deviner ce qu'il contient.
 * Elle est visuellement masquée, jamais absente.
 *
 * Le débordement est confié à un conteneur qui défile, pour que la page ne
 * défile jamais horizontalement — sur mobile, c'est ce qui rend une liste
 * d'administration inutilisable.
 */
export function Tableau<T>({
  legende,
  colonnes,
  lignes,
  cleLigne,
  vide,
}: ProprietesTableau<T>): ReactNode {
  if (lignes.length === 0 && vide) return <>{vide}</>;

  return (
    <div className={styles.tableauCadre}>
      <table className={styles.tableau}>
        <caption className={styles.invisible}>{legende}</caption>
        <thead>
          <tr>
            {colonnes.map((colonne) => (
              <th
                key={colonne.cle}
                scope="col"
                className={colonne.numerique ? styles.numerique : undefined}
              >
                {colonne.entete}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => (
            <tr key={cleLigne(ligne)}>
              {colonnes.map((colonne) => (
                <td
                  key={colonne.cle}
                  className={colonne.numerique ? styles.numerique : undefined}
                >
                  {colonne.rendu(ligne)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
