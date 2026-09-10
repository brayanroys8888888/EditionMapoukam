'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { traduire, type LangueInterface } from '@/i18n';
import { RotorInline } from '@/components/etats';
import { metaLivre } from '@/components/catalogue/meta';
import styles from './recherche-globale.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LA RECHERCHE DU SITE ENTIER — LA SUPERPOSITION D'ORGANIC.                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Cotes du prototype de bureau, lignes 133 à 160. Elle s'ouvre depuis la loupe
 * de l'en-tête, depuis n'importe quelle page, et répond pendant la frappe.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA LOUPE RESTE UN LIEN, ET C'EST CE QUI LA FAIT MARCHER SANS SCRIPT.    │
 * │                                                                          │
 * │ Le prototype pose un `<button>` : il n'a rien d'autre à proposer, tout   │
 * │ y est du JavaScript. Ici la loupe est une ANCRE vers `/catalogue`, dont  │
 * │ l'écran porte un vrai formulaire `GET` — et le clic n'est intercepté     │
 * │ que si le script s'exécute.                                              │
 * │                                                                          │
 * │ Sans JavaScript, on arrive donc sur la page de recherche du catalogue    │
 * │ plutôt que sur une loupe morte. C'est l'idiome que `RechercheInstantanee`│
 * │ tient déjà pour le champ du catalogue : la version instantanée ANTICIPE  │
 * │ le chemin de repli, elle ne le remplace pas.                             │
 * │                                                                          │
 * │ Un clic modifié — molette, ⌘, Ctrl, Maj — n'est PAS intercepté : ouvrir  │
 * │ dans un nouvel onglet doit continuer d'ouvrir le catalogue.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PANNEAU EST PORTALISÉ, ET CE N'EST PAS UN DÉTAIL DE GOÛT.           │
 * │                                                                          │
 * │ L'en-tête porte `backdrop-filter`. Une propriété de filtre fait de son   │
 * │ élément un BLOC CONTENEUR pour tout descendant en `position: fixed` :    │
 * │ la superposition, posée dans l'en-tête, se serait ancrée sur l'en-tête   │
 * │ et non sur la fenêtre — haute de 76 px, à l'intérieur de la barre.       │
 * │                                                                          │
 * │ C'est exactement le piège déjà payé par le tiroir du panier. Il attend   │
 * │ toute pièce flottante posée depuis le chrome.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE SECONDE RECHERCHE — C'EST `/api/catalog`, CELUI DU CATALOGUE.    │
 * │                                                                          │
 * │ Le même point d'entrée, le même schéma Zod, la même fonction SQL. Une    │
 * │ recherche « rapide » écrite à côté aurait été une seconde façon de lire  │
 * │ le catalogue : elle aurait divergé au premier filtre ajouté, et c'est    │
 * │ toujours la copie qu'on ne regarde pas qui se met à mentir.              │
 * │                                                                          │
 * │ Les DROITS ne sont pas recalculés ici non plus : chaque entrée porte son │
 * │ `acces` et son `prix.affichage`, lus tels quels.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Le temps qu'on laisse au doigt avant de partir chercher.
 *
 * 180 ms : au-delà la liste traîne derrière la frappe, en deçà on lance une
 * requête par lettre. C'est la valeur du document `11-realtime-behaviour.md`.
 */
const ATTENTE_MS = 180;

/** Ce que la superposition montre — jamais plus, la liste doit rester lisible. */
const RESULTATS_MAX = 6;

/** À vide, le prototype propose quatre titres. */
const RESULTATS_A_VIDE = 4;

/** Six pastilles de suggestion, comme le prototype. */
const SUGGESTIONS_MAX = 6;

interface EntreeCatalogue {
  id: string;
  slug: string;
  titre: string;
  age_min: number | null;
  age_max: number | null;
  nb_pages: number | null;
  couverture: { vignette: string | null } | null;
  prix: { affichage: string | null } | null;
}

export function RechercheGlobale({
  langue,
  className,
  children,
}: {
  langue: LangueInterface;
  /** Les classes du carré d'action de l'en-tête — la loupe reste à sa place. */
  className: string;
  /** L'icône elle-même, rendue par l'en-tête : ce composant ne la dessine pas. */
  children: ReactNode;
}): ReactNode {
  const [ouvert, setOuvert] = useState(false);
  const [monte, setMonte] = useState(false);
  const [q, setQ] = useState('');
  const [entrees, setEntrees] = useState<EntreeCatalogue[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [cherche, setCherche] = useState(false);
  /*
   * `null` tant qu'aucune réponse n'est revenue.
   *
   * Sans ce troisième état, l'écran afficherait « aucun résultat » pendant la
   * toute première requête — on annoncerait une absence qu'on n'a pas encore
   * constatée.
   */
  const [repondu, setRepondu] = useState(false);

  const champ = useRef<HTMLInputElement>(null);
  const loupe = useRef<HTMLAnchorElement>(null);
  const panneau = useRef<HTMLDivElement>(null);

  // `createPortal` demande un document : il n'y en a pas au rendu serveur.
  useEffect(() => {
    setMonte(true);
  }, []);

  const fermer = useCallback(() => {
    setOuvert(false);
    // Le focus REVIENT à la loupe : sans cela il retombe sur le corps, et la
    // tabulation suivante repart du haut de la page.
    loupe.current?.focus();
  }, []);

  /* ── Le raccourci ⌘K / Ctrl+K, et Échap ─────────────────────────────── */

  useEffect(() => {
    function surTouche(evenement: KeyboardEvent): void {
      if ((evenement.metaKey || evenement.ctrlKey) && evenement.key.toLowerCase() === 'k') {
        evenement.preventDefault();
        setOuvert((avant) => !avant);
        return;
      }
      if (evenement.key === 'Escape' && ouvert) fermer();
    }

    window.addEventListener('keydown', surTouche);
    return () => {
      window.removeEventListener('keydown', surTouche);
    };
  }, [ouvert, fermer]);

  /* ── À l'ouverture : le focus au champ, et le fond qui ne défile plus ─ */

  useEffect(() => {
    if (!ouvert) return;

    const defilementInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const minuterie = window.setTimeout(() => {
      champ.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(minuterie);
      document.body.style.overflow = defilementInitial;
    };
  }, [ouvert]);

  /* ── Les suggestions : les VRAIS thèmes du catalogue ────────────────── */

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE PROTOTYPE ÉCRIT SIX LIBELLÉS EN DUR ; NOUS LISONS LES FACETTES.    │
   * │                                                                        │
   * │ « ruse », « nature », « animaux »… sont les thèmes de SON jeu de       │
   * │ démonstration. Les recopier ferait deux dégâts : une pastille en       │
   * │ français sur le site anglais, et — plus grave — une suggestion qui ne  │
   * │ ramène rien le jour où l'éditeur renomme un thème. Une suggestion qui  │
   * │ ne suggère rien est pire qu'une absence de suggestion.                 │
   * │                                                                        │
   * │ `/api/catalog/facets` rend les thèmes RÉELLEMENT présents, déjà        │
   * │ ordonnés par effectif : les six premiers sont donc les six qui         │
   * │ ramènent le plus de titres. Le dessin est celui du prototype, la       │
   * │ donnée est celle du catalogue.                                         │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  useEffect(() => {
    if (!ouvert || suggestions.length > 0) return;

    const abandon = new AbortController();

    void (async () => {
      try {
        const reponse = await fetch(`/api/catalog/facets?langue=${langue}`, {
          signal: abandon.signal,
        });
        if (!reponse.ok) return;
        const donnees = (await reponse.json()) as {
          themes?: { valeur: string; nombre: number }[];
        };
        setSuggestions(
          (donnees.themes ?? []).slice(0, SUGGESTIONS_MAX).map((theme) => theme.valeur),
        );
      } catch {
        // Une suggestion absente n'empêche pas de chercher : on se tait.
      }
    })();

    return () => {
      abandon.abort();
    };
  }, [ouvert, langue, suggestions.length]);

  /* ── La recherche elle-même, différée ───────────────────────────────── */

  useEffect(() => {
    if (!ouvert) return;

    const abandon = new AbortController();
    const terme = q.trim();
    setCherche(true);

    const minuterie = window.setTimeout(() => {
      void (async () => {
        const parametres = new URLSearchParams({
          langue,
          taille: String(terme === '' ? RESULTATS_A_VIDE : RESULTATS_MAX),
        });
        if (terme !== '') parametres.set('q', terme);

        try {
          const reponse = await fetch(`/api/catalog?${parametres.toString()}`, {
            signal: abandon.signal,
          });
          if (!reponse.ok) return;
          const donnees = (await reponse.json()) as { entrees?: EntreeCatalogue[] };
          setEntrees(donnees.entrees ?? []);
          setRepondu(true);
        } catch {
          // Abandon volontaire, ou réseau coupé : la liste précédente reste.
        } finally {
          setCherche(false);
        }
      })();
    }, ATTENTE_MS);

    return () => {
      window.clearTimeout(minuterie);
      abandon.abort();
    };
  }, [ouvert, q, langue]);

  const aucunResultat = repondu && !cherche && q.trim() !== '' && entrees.length === 0;

  return (
    <>
      <a
        ref={loupe}
        className={className}
        href={`/${langue}/catalogue`}
        aria-label={traduire(langue, 'navigation.recherche')}
        aria-expanded={ouvert}
        onClick={(evenement) => {
          // Clic modifié : on laisse le navigateur faire son travail.
          if (
            evenement.metaKey ||
            evenement.ctrlKey ||
            evenement.shiftKey ||
            evenement.altKey ||
            evenement.button !== 0
          ) {
            return;
          }
          evenement.preventDefault();
          setOuvert(true);
        }}
      >
        {children}
      </a>

      {monte && ouvert
        ? createPortal(
            <>
              {/*
               * Le voile n'est pas décoratif : c'est LA cible de sortie au
               * clic. Il porte donc un rôle de bouton et un nom, et il est le
               * premier élément focalisable du panneau.
               */}
              <button
                type="button"
                className={styles.voile}
                aria-label={traduire(langue, 'recherche.fermer')}
                onClick={fermer}
              />

              <div
                ref={panneau}
                className={styles.superposition}
                role="dialog"
                aria-modal="true"
                aria-label={traduire(langue, 'recherche.titre')}
              >
                <div className={styles.interieur}>
                  <div className={styles.rangee}>
                    <svg
                      className={styles.loupe}
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.75"
                      strokeLinecap="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>

                    <input
                      ref={champ}
                      className={styles.champ}
                      type="search"
                      value={q}
                      onChange={(evenement) => {
                        setQ(evenement.target.value);
                      }}
                      placeholder={traduire(langue, 'recherche.placeholder')}
                      aria-label={traduire(langue, 'recherche.titre')}
                      autoComplete="off"
                    />

                    {/*
                     * L'attente est dite par le ROTOR PARTAGÉ, jamais par un
                     * indicateur fabriqué ici. `tests/unit/frontend-architecture`
                     * l'impose, et il a raison : un second rotor divergerait du
                     * premier à la première retouche, et c'est toujours celui
                     * qu'on ne regarde pas qui reste en arrière.
                     */}
                    {cherche ? <RotorInline /> : null}

                    <button type="button" className={styles.echap} onClick={fermer}>
                      {traduire(langue, 'recherche.echap')}
                    </button>
                  </div>

                  {suggestions.length > 0 ? (
                    <div className={styles.suggestions}>
                      <span className={styles.suggestionsLibelle}>
                        {traduire(langue, 'recherche.suggestions')}
                      </span>
                      {suggestions.map((theme) => (
                        <a
                          key={theme}
                          className={styles.pastille}
                          href={`/${langue}/catalogue?themes=${encodeURIComponent(theme)}`}
                        >
                          {theme}
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {/*
                   * `aria-live="polite"` sur la LISTE, et non sur chaque
                   * résultat : c'est le nombre de titres trouvés qu'on
                   * annonce, une fois la frappe reposée, et non six titres
                   * l'un après l'autre pendant qu'on tape.
                   */}
                  <div className={styles.resultats} aria-live="polite" aria-busy={cherche}>
                    {entrees.map((entree) => (
                      <a
                        key={entree.id}
                        className={styles.resultat}
                        href={`/${langue}/contes/${entree.slug}`}
                      >
                        {/*
                         * `alt=""` : le titre est écrit juste à côté, et le
                         * redire ferait entendre deux fois la même phrase.
                         * Les dimensions sont posées pour que la grille ne
                         * saute pas pendant le chargement des vignettes.
                         */}
                        {entree.couverture?.vignette ? (
                          <img
                            className={styles.couverture}
                            src={entree.couverture.vignette}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            width={46}
                            height={66}
                          />
                        ) : (
                          <span className={styles.couvertureVide} aria-hidden="true" />
                        )}

                        <span className={styles.resultatTexte}>
                          <span className={styles.resultatTitre}>{entree.titre}</span>
                          <span className={styles.resultatMeta}>
                            {[metaLivre(langue, entree), entree.prix?.affichage]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>

                  {aucunResultat ? (
                    <p className={styles.aucun}>{traduire(langue, 'recherche.aucun')}</p>
                  ) : null}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
