'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { LANGUES_INTERFACE, traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { IconeLoupe } from '@/components/icones';
import { Marque } from './marque';
import styles from './menu-mobile.module.css';

/**
 * MENU PLEIN ÉCRAN — d'après `maquette_response/`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES LIENS EXISTENT DÉJÀ DANS L'EN-TÊTE, ET C'EST VOULU.                 │
 * │                                                                          │
 * │ Ce panneau ne remplace pas la navigation : il la double pour l'écran     │
 * │ étroit. La `<nav>` de l'en-tête reste dans le document et se masque en   │
 * │ CSS, si bien que la page garde sa navigation même quand ce composant ne  │
 * │ s'exécute pas — sans JavaScript, sans quoi il n'y aurait plus AUCUN      │
 * │ moyen d'aller au catalogue depuis un téléphone.                          │
 * │                                                                          │
 * │ C'est la raison pour laquelle le bouton d'ouverture est rendu par le     │
 * │ client : il ne doit apparaître que là où il peut fonctionner.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface EntreeMenu {
  cle: CleTraduction;
  chemin: string;
}

const ENTREES: EntreeMenu[] = [
  { cle: 'navigation.catalogue', chemin: 'catalogue' },
  { cle: 'navigation.offres', chemin: 'offres' },
  { cle: 'navigation.blog', chemin: 'blog' },
  { cle: 'navigation.apropos', chemin: 'a-propos' },
  { cle: 'pied.contact', chemin: 'contact' },
];

export function MenuMobile({
  langue,
  chemin,
  requete = '',
  connecte,
  administrateur = false,
}: {
  langue: LangueInterface;
  /** Chemin courant, pour marquer l'entrée active. */
  chemin: string;
  /** Chaîne de requête courante, conservée en changeant de langue. */
  requete?: string;
  connecte: boolean;
  /**
   * Le raccourci d'administration se montre-t-il ?
   *
   * L'en-tête étroit retire ses commandes secondaires, dont ce raccourci. Sans
   * cette reprise, l'administration deviendrait inatteignable depuis un
   * téléphone autrement qu'en tapant l'adresse — et c'est précisément l'appareil
   * sur lequel on n'a pas envie de la taper.
   */
  administrateur?: boolean;
}): ReactNode {
  const [ouvert, setOuvert] = useState(false);
  const bouton = useRef<HTMLButtonElement | null>(null);
  const panneau = useRef<HTMLDivElement | null>(null);

  const segment = chemin.split('/')[2] ?? '';

  /**
   * La MÊME page dans l'autre langue — jamais l'accueil.
   *
   * Renvoyer à la racine ferait perdre l'écran qu'on regardait, et c'est le
   * défaut le plus courant des sélecteurs de langue. Seul le premier segment
   * change ; les filtres portés par la requête suivent.
   */
  function versLangue(cible: LangueInterface): string {
    const segments = chemin.split('/');
    segments[1] = cible;
    return `${segments.join('/')}${requete}`;
  }

  const fermer = useCallback(() => {
    setOuvert(false);
    // Le focus RETOURNE au bouton : sans cela il repart au début du document,
    // et l'on retraverse toute la page pour revenir où l'on était.
    bouton.current?.focus();
  }, []);

  useEffect(() => {
    if (!ouvert) return;

    function surTouche(evenement: KeyboardEvent): void {
      if (evenement.key === 'Escape') fermer();
    }

    /*
     * Trois obligations d'un panneau modal, et elles sont toutes ici :
     * `Escape` ferme, le focus entre dans le panneau, et la page de fond
     * cesse de défiler — sinon on perd sa place en parcourant le menu.
     */
    const defilement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', surTouche);

    const minuterie = window.setTimeout(() => {
      panneau.current?.querySelector<HTMLElement>('a, button')?.focus();
    }, 0);

    /*
     * Si la fenêtre s'élargit au-delà du seuil, le panneau se ferme.
     *
     * Sans cela, faire pivoter une tablette laisserait un aplat vert plein
     * écran par-dessus un site qui a retrouvé sa navigation ordinaire.
     */
    const large = window.matchMedia('(min-width: 901px)');
    const surLargeur = (): void => {
      if (large.matches) setOuvert(false);
    };
    large.addEventListener('change', surLargeur);

    return () => {
      window.clearTimeout(minuterie);
      window.removeEventListener('keydown', surTouche);
      large.removeEventListener('change', surLargeur);
      document.body.style.overflow = defilement;
    };
  }, [ouvert, fermer]);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={styles.bouton}
        onClick={() => {
          setOuvert(true);
        }}
        aria-label={traduire(langue, 'navigation.principal')}
        aria-expanded={ouvert}
      >
        {/* Trois barres, dessinées à la main : trois traits ne méritent pas
            une bibliothèque d'icônes. */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      {ouvert ? (
        <div
          ref={panneau}
          className={styles.panneau}
          role="dialog"
          aria-modal="true"
          aria-label={traduire(langue, 'navigation.principal')}
        >
          <div className={styles.entete}>
            <Marque langue={langue} ton="sombre" petite />

            <button
              type="button"
              className={styles.fermer}
              onClick={fermer}
              aria-label={traduire(langue, 'v2.tiroirFermer')}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <ul className={styles.liens}>
            {ENTREES.map((entree) => {
              const actif = entree.chemin === segment;
              return (
                <li key={entree.chemin}>
                  <a
                    className={actif ? `${styles.lien} ${styles.lienActif}` : styles.lien}
                    href={`/${langue}/${entree.chemin}`}
                    aria-current={actif ? 'page' : undefined}
                  >
                    {traduire(langue, entree.cle)}
                  </a>
                </li>
              );
            })}
          </ul>

          <div className={styles.pied}>
            {/*
             * ┌────────────────────────────────────────────────────────────┐
             * │ LE SÉLECTEUR DE LANGUE, LÀ OÙ ON LE CHERCHE.               │
             * │                                                            │
             * │ L'en-tête étroit ne garde que le menu et le panier. Le      │
             * │ pied de page porte bien un second sélecteur — mais il est   │
             * │ au bout d'une page entière, et personne ne défile jusqu'en  │
             * │ bas pour changer de langue.                                 │
             * │                                                            │
             * │ Le doublon est donc VOULU : §5.5 fait des deux langues une  │
             * │ promesse du produit, et une promesse qu'il faut chercher    │
             * │ n'en est pas une.                                           │
             * └────────────────────────────────────────────────────────────┘
             */}
            <div
              className={styles.langues}
              role="group"
              aria-label={traduire(langue, 'langue.selecteur')}
            >
              {LANGUES_INTERFACE.map((code) =>
                code === langue ? (
                  <span
                    key={code}
                    className={`${styles.langue} ${styles.langueActive}`}
                    aria-current="true"
                  >
                    {traduire(langue, `langue.${code}`)}
                  </span>
                ) : (
                  <a
                    key={code}
                    className={styles.langue}
                    href={versLangue(code)}
                    hrefLang={code}
                    lang={code}
                  >
                    {traduire(langue, `langue.${code}`)}
                  </a>
                ),
              )}
            </div>

            <a className={styles.recherche} href={`/${langue}/catalogue`}>
              <IconeLoupe taille={18} />
              {traduire(langue, 'navigation.recherche')}
            </a>

            {administrateur ? (
              <a className={styles.administration} href={`/${langue}/admin`}>
                {traduire(langue, 'navigation.administration')}
              </a>
            ) : null}

            <a
              className={styles.connexion}
              href={`/${langue}/${connecte ? 'compte' : 'connexion'}`}
            >
              {traduire(langue, connecte ? 'navigation.compte' : 'navigation.connexion')}
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}
