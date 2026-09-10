'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import { Chargement } from '@/components/etats';

import { useBalayage, useEffacement } from './comportements';
import { usePleinEcran } from './plein-ecran';
import type { Etat } from './etat';
import styles from './scene-v3.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LA SCÈNE DE LECTURE — L'ÉCRAN ORGANIC.                                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Prototype, lignes 642 à 672. Les mesures sont dans la feuille voisine ; ce
 * fichier ne porte que la structure et les commandes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN BOUTON DE TÉLÉCHARGEMENT, D'IMPRESSION OU DE PARTAGE.             │
 * │                                                                          │
 * │ La règle ne change pas d'une direction visuelle à l'autre : la lecture   │
 * │ en ligne et le téléchargement sont deux droits distincts, et le second   │
 * │ ne s'obtient que par l'achat. Le plein écran ajouté ci-dessous n'est pas │
 * │ une exception — il ne donne accès à aucun fichier, seulement à la même   │
 * │ page signée, en plus grand.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI CHANGE PAR RAPPORT À LA SCÈNE DE LA V2, ET POURQUOI.             │
 * │                                                                          │
 * │ La V2 efface son interface au bout de quatre secondes, EN PAGE. Le       │
 * │ prototype ne le fait pas : ses commandes vivent hors de l'image, dans    │
 * │ une page qui a un en-tête, un pied et une largeur. Les effacer là        │
 * │ n'aurait rien libéré — l'image n'aurait pas grandi d'un pixel.           │
 * │                                                                          │
 * │ Le comportement n'est pas perdu, il a DÉMÉNAGÉ là où il gagne quelque    │
 * │ chose : en plein écran. C'est là que les boutons couvrent la page, et    │
 * │ c'est là qu'ils s'effacent — exactement le mode plein écran d'un lecteur │
 * │ de PDF.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface ProprietesScene {
  langue: LangueInterface;
  slug: string;
  titre: string;
  page: number;
  total: number;
  etat: Etat;
  aller: (cible: number) => void;
  /** Le titre appartient-il au lecteur ? Décide de la mention d'extrait. */
  possedeAuChargement: boolean;
  /** Déjà mis en forme par l'appelant — « Page 3 sur 24 ». */
  libellePosition: string;
}

/** Le chevron du prototype : 24 × 24, trait de 2,75, extrémités rondes. */
function Chevron({ sens }: { sens: 'gauche' | 'droite' }): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={sens === 'gauche' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

/**
 * Les quatre équerres du plein écran — vers l'extérieur pour entrer, vers
 * l'intérieur pour sortir. C'est le pictogramme que tout lecteur de vidéo et
 * de PDF emploie ; en inventer un autre demanderait de l'apprendre.
 */
function Equerres({ sortie }: { sortie: boolean }): ReactNode {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {sortie ? (
        <>
          <path d="M9 3v6H3" />
          <path d="M15 3v6h6" />
          <path d="M9 21v-6H3" />
          <path d="M15 21v-6h6" />
        </>
      ) : (
        <>
          <path d="M3 9V3h6" />
          <path d="M21 9V3h-6" />
          <path d="M3 15v6h6" />
          <path d="M21 15v6h-6" />
        </>
      )}
    </svg>
  );
}

export function SceneV3({
  langue,
  slug,
  titre,
  page,
  total,
  etat,
  aller,
  possedeAuChargement,
  libellePosition,
}: ProprietesScene): ReactNode {
  /*
   * LA RÉFÉRENCE PORTE SUR LA SECTION ENTIÈRE, ET NON SUR L'IMAGE.
   *
   * Mettre l'image seule en plein écran la laisserait sans commandes : le
   * navigateur ne montre QUE l'élément demandé et ses descendants. Les
   * flèches, le compteur et le bouton de sortie vivent donc à l'intérieur de
   * l'élément qui passe en plein écran.
   */
  const cadre = useRef<HTMLElement | null>(null);
  const { disponible, actif, basculer } = usePleinEcran(cadre);

  const balayage = useBalayage((sens) => {
    aller(page + sens);
  });

  /*
   * L'effacement ne vaut qu'en plein écran, et seulement quand la scène montre
   * une page. Un message — fin d'extrait, session perdue, erreur — demande une
   * action : effacer ses boutons enfermerait le lecteur.
   */
  const enPage = etat.sorte === 'page' || etat.sorte === 'chargement';
  const { efface, note } = useEffacement(actif && enPage);

  const commandesEffacees = efface ? ` ${styles.efface}` : '';

  return (
    <section
      ref={cadre}
      className={styles.scene}
      data-plein={actif ? 'oui' : 'non'}
      aria-label={traduire(langue, 'lecteur.titre')}
    >
      <div className={styles.interieur}>
        {/* ── La barre de tête ────────────────────────────────────────────── */}
        <div className={styles.barre}>
          {/*
            LE SEUL LIEN SORTANT DU LECTEUR.
            Aucun téléchargement, aucune impression, aucun partage.
          */}
          <a className={styles.retour} href={`/${langue}/contes/${slug}`}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M19 12H6m5 6-6-6 6-6" />
            </svg>
            {traduire(langue, 'lecteur.retourFiche')}
          </a>

          <p className={styles.titreLecteur}>{titre}</p>

          <div className={styles.cote}>
            {/*
              La position vient de `total`, rendu par l'API — jamais d'un
              comptage fait ici. Sur un accès partiel, le libellé dit « de
              l'extrait », pour qu'on ne croie pas le conte plus court.
            */}
            <p className={styles.position} aria-live="polite">
              {libellePosition}
            </p>

            {/*
              LE BOUTON N'EXISTE QUE SI LE NAVIGATEUR ACCORDE LE PLEIN ÉCRAN.

              Sur iPhone, Safari ne l'accorde qu'aux vidéos : le bouton y serait
              un bouton qui ne fait rien, c'est-à-dire pire que pas de bouton.
            */}
            {disponible ? (
              <button
                type="button"
                className={styles.pleinEcran}
                onClick={basculer}
                aria-pressed={actif}
              >
                <Equerres sortie={false} />
                {traduire(langue, 'lecteur.pleinEcran')}
              </button>
            ) : null}
          </div>
        </div>

        {/* ── Le plateau ──────────────────────────────────────────────────── */}
        <div className={styles.plateau} {...balayage}>
          {etat.sorte === 'chargement' ? (
            <Chargement langue={langue} libelle={traduire(langue, 'lecteur.chargement')} />
          ) : null}

          {etat.sorte === 'page' ? (
            <img
              /*
               * `key` sur l'ADRESSE : elle force React à remonter l'élément à
               * chaque page, ce qui rejoue le fondu. Sans elle, React réutilise
               * le même `<img>` en changeant `src`, et la page suivante
               * apparaît d'un coup — le saut que le fondu existe pour éviter.
               */
              key={etat.donnees.url}
              src={etat.donnees.url}
              width={etat.donnees.page.largeur}
              height={etat.donnees.page.hauteur}
              alt=""
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className={styles.planche}
            />
          ) : null}

          {etat.sorte === 'sessionPerdue' ? (
            <div className={styles.message} role="alert">
              {/*
                AUCUNE INVITATION À L'ACHAT ICI. Le conte est déjà payé ; le
                proposer à la vente serait accuser un client de ne pas l'avoir
                fait, en pleine lecture.
              */}
              <p className={styles.messageTexte}>{traduire(langue, 'lecteur.sessionPerdue')}</p>
              <a className={styles.messageAction} href={`/${langue}/connexion`}>
                {traduire(langue, 'lecteur.sessionPerdueAction')}
              </a>
            </div>
          ) : null}

          {etat.sorte === 'finExtrait' ? (
            <div className={styles.message}>
              <p className={styles.messageTexte}>{traduire(langue, 'lecteur.finExtrait')}</p>
              <a className={styles.messageAction} href={`/${langue}/contes/${slug}`}>
                {traduire(langue, 'lecteur.finExtraitAction')}
              </a>
            </div>
          ) : null}

          {etat.sorte === 'erreur' ? (
            <p className={styles.messageTexte} role="alert">
              {traduire(langue, 'lecteur.pageIndisponible')}
            </p>
          ) : null}

          <button
            type="button"
            className={`${styles.fleche} ${styles.flechePrecedente}${commandesEffacees}`}
            aria-label={traduire(langue, 'lecteur.pagePrecedente')}
            disabled={page <= 1}
            onClick={() => {
              aller(page - 1);
            }}
          >
            <Chevron sens="gauche" />
          </button>

          <button
            type="button"
            className={`${styles.fleche} ${styles.flecheSuivante}${commandesEffacees}`}
            aria-label={traduire(langue, 'lecteur.pageSuivante')}
            disabled={page >= total}
            onClick={() => {
              aller(page + 1);
            }}
          >
            <Chevron sens="droite" />
          </button>

          {/*
            ┌──────────────────────────────────────────────────────────────────┐
            │ LA BARRE FLOTTANTE N'EXISTE QU'EN PLEIN ÉCRAN.                  │
            │                                                                  │
            │ En page, elle doublerait la barre de tête et les pastilles, à    │
            │ trois centimètres d'elles. En plein écran, elles ont disparu     │
            │ avec le reste : c'est le seul endroit où l'on peut encore lire   │
            │ où l'on en est, et en sortir autrement qu'avec Échap.            │
            └──────────────────────────────────────────────────────────────────┘
          */}
          {actif ? (
            <div className={`${styles.flottante}${commandesEffacees}`}>
              <button
                type="button"
                className={styles.flottanteBouton}
                aria-label={traduire(langue, 'lecteur.pagePrecedente')}
                disabled={page <= 1}
                onClick={() => {
                  aller(page - 1);
                }}
              >
                <Chevron sens="gauche" />
              </button>

              <p className={styles.flottantePosition}>{libellePosition}</p>

              <button
                type="button"
                className={styles.flottanteBouton}
                aria-label={traduire(langue, 'lecteur.pageSuivante')}
                disabled={page >= total}
                onClick={() => {
                  aller(page + 1);
                }}
              >
                <Chevron sens="droite" />
              </button>

              <button type="button" className={styles.flottanteSortie} onClick={basculer}>
                <Equerres sortie />
                {traduire(langue, 'lecteur.quitterPleinEcran')}
              </button>
            </div>
          ) : null}

          {/* La note d'aide, une seule fois, au premier effacement. */}
          {note === 'jamais' ? null : (
            <p
              className={note === 'estompee' ? `${styles.aide} ${styles.aideEffacee}` : styles.aide}
              // `polite` : elle informe, elle n'interrompt pas une lecture.
              aria-live="polite"
            >
              {traduire(langue, 'lecteur.interfaceEffacee')}
            </p>
          )}
        </div>

        {/* ── Progression et pastilles ────────────────────────────────────── */}
        {/*
          La barre est décorative : la position exacte est écrite en toutes
          lettres au-dessus, et annoncée à chaque changement. La redire ici
          ferait entendre deux fois la même chose.
        */}
        <div className={styles.progression} aria-hidden="true">
          {/*
           * La part est passée SANS UNITÉ, et c'est le CSS qui la convertit en
           * pourcentage. Une multiplication par cent écrite ici tomberait sous
           * la règle qui protège les montants — à raison : c'est exactement la
           * forme qu'un prix mal converti prendrait.
           */}
          <div
            className={styles.progressionRemplie}
            style={{ '--part': page / total } as CSSProperties}
          />
        </div>

        <div
          className={styles.pastilles}
          role="group"
          aria-label={traduire(langue, 'lecteur.titre')}
        >
          {Array.from({ length: total }, (_, index) => index + 1).map((numero) => (
            <button
              key={numero}
              type="button"
              className={
                numero === page ? `${styles.pastille} ${styles.pastilleActive}` : styles.pastille
              }
              aria-label={traduire(langue, 'lecteur.position')
                .replace('{page}', String(numero))
                .replace('{total}', String(total))}
              aria-current={numero === page ? 'true' : undefined}
              onClick={() => {
                aller(numero);
              }}
            >
              {numero}
            </button>
          ))}
        </div>

        {/*
          LA MENTION D'EXTRAIT NE PARAÎT QUE SUR UN EXTRAIT.

          Le prototype l'écrit toujours — « Les premières pages sont lisibles
          sans compte. Le reste s'ouvre après l'achat. » Sous cette phrase, un
          client qui a PAYÉ lirait qu'il lui reste à payer. C'est le même défaut
          que le message de session perdue corrige plus haut, et il se règle
          avec la même valeur : `canRead`, lue au chargement.
        */}
        {possedeAuChargement ? null : (
          <p className={styles.mention}>{traduire(langue, 'lecteur.extraitLibre')}</p>
        )}
      </div>
    </section>
  );
}
