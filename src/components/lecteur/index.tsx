'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import { Chargement } from '@/components/etats';
import { poserToast } from '@/components/toast';
import { estV3 } from '@/design/version';
import type { ReponsePage } from '@/domain/api/contract';

import { useBalayage, useEffacement } from './comportements';
import type { Etat } from './etat';
import { SceneV3 } from './scene-v3';
import styles from './lecteur.module.css';

/**
 * LECTEUR EN LIGNE — §4.1 F5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN BOUTON DE TÉLÉCHARGEMENT, D'IMPRESSION OU DE PARTAGE.             │
 * │                                                                          │
 * │ Ce n'est pas un oubli d'ergonomie : la lecture en ligne et le            │
 * │ téléchargement sont deux droits distincts, et le second ne s'obtient     │
 * │ que par l'achat. Un bouton « imprimer » dans le lecteur contournerait    │
 * │ la règle métier centrale du projet.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN 403 SUR UN TITRE POSSÉDÉ EST UNE PERTE DE SESSION, PAS UN REFUS.     │
 * │                                                                          │
 * │ `/api/books/[id]/pages/[page]` est une route PUBLIQUE : elle ne renvoie  │
 * │ jamais 401, et un jeton mort y vaut « visiteur ». Un enfant dont la      │
 * │ session meurt en page 12 d'un conte que ses parents ont ACHETÉ recevrait │
 * │ donc `403 hors_extrait` — c'est-à-dire « achetez ce titre pour lire la   │
 * │ suite ». L'interface accuserait un client de ne pas avoir payé ce qu'il  │
 * │ a payé, en pleine lecture.                                              │
 * │                                                                          │
 * │ D'où `possedeAuChargement` : quand il est vrai, un 403 n'affiche JAMAIS  │
 * │ d'invitation à l'achat, mais une invitation à se reconnecter — et dit    │
 * │ explicitement que le conte lui appartient toujours.                      │
 * │                                                                          │
 * │ C'est le filet. La surveillance PRÉVENTIVE, elle, vit dans le            │
 * │ middleware, au-dessus de tous les écrans (étape F2).                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE COMPOSANT NE DESSINE PLUS QU'UNE SCÈNE SUR DEUX.                     │
 * │                                                                          │
 * │ Toute la logique ci-dessous — droits, signatures, préchargement, reprise │
 * │ de lecture — est la même sous les trois directions visuelles, et elle    │
 * │ n'est écrite qu'ici. Ce qui change est la SCÈNE : celle de la V2 vit au  │
 * │ bas de ce fichier, celle d'Organic dans `scene-v3.tsx`, avec son plein   │
 * │ écran.                                                                   │
 * │                                                                          │
 * │ Recopier la logique dans la seconde scène aurait recopié l'encadré       │
 * │ ci-dessus, c'est-à-dire la règle la plus délicate de l'écran.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface ProprietesLecteur {
  langue: LangueInterface;
  livreId: string;
  slug: string;
  /** Le titre du conte, affiché dans la barre supérieure. */
  titre: string;
  langueContenu: string;
  /** Nombre total de pages du conte, rendu par l'API. Jamais compté ici. */
  total: number;
  /** Page d'ouverture — reprise de lecture, ou 1. */
  pageInitiale: number;
  /**
   * L'utilisateur détenait-il le titre AU CHARGEMENT de la page ?
   *
   * Lu depuis `acces.canRead` côté serveur. C'est cette valeur, et elle seule,
   * qui distingue « votre session est morte » de « ce conte n'est pas à vous ».
   */
  possedeAuChargement: boolean;
}

export function Lecteur({
  langue,
  livreId,
  slug,
  titre,
  langueContenu,
  total,
  pageInitiale,
  possedeAuChargement,
}: ProprietesLecteur): ReactNode {
  const [page, setPage] = useState(pageInitiale);
  const [etat, setEtat] = useState<Etat>({ sorte: 'chargement' });

  /** Pages déjà obtenues, pour ne pas redemander une signature encore valable. */
  const cache = useRef(new Map<number, ReponsePage>());

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LA REPRISE SE DIT, ELLE NE SE DEVINE PAS.                               │
   * │                                                                          │
   * │ Le serveur rend `pageInitiale` depuis `reading_progress` : rouvrir un    │
   * │ conte ramène à la page où l'on s'était arrêté. C'est le bon              │
   * │ comportement — et il est déroutant sans un mot, parce qu'un enfant qui   │
   * │ rouvre son conte tombe au milieu d'une histoire qu'il croyait            │
   * │ recommencer.                                                             │
   * │                                                                          │
   * │ Le message part UNE fois, au montage, et jamais aux pages suivantes :    │
   * │ `pageInitiale` ne bouge pas pendant la lecture, et la garde de           │
   * │ référence protège du double montage du mode strict.                      │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const repriseAnnoncee = useRef(false);

  useEffect(() => {
    if (repriseAnnoncee.current || pageInitiale <= 1) return;
    repriseAnnoncee.current = true;
    poserToast('reprise', { nombre: pageInitiale });
  }, [pageInitiale]);

  const demander = useCallback(
    async (numero: number, signal?: AbortSignal): Promise<ReponsePage | 'refus' | 'echec'> => {
      const enCache = cache.current.get(numero);
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ UNE SIGNATURE EXPIRE EN 300 s. Une page laissée ouverte plus     │
      // │ longtemps doit en redemander une — mais une page ouverte depuis  │
      // │ dix secondes ne doit PAS resigner à chaque rendu, sans quoi on   │
      // │ ferait un aller-retour par pression de touche.                   │
      // │                                                                  │
      // │ L'échéance vient de l'API (`expire_le`), jamais d'un compteur    │
      // │ tenu ici.                                                        │
      // └──────────────────────────────────────────────────────────────────┘
      if (enCache && Date.parse(enCache.expire_le) > Date.now() + 10_000) return enCache;

      const reponse = await fetch(
        `/api/books/${livreId}/pages/${String(numero)}?langue=${langueContenu}`,
        { signal, cache: 'no-store' },
      ).catch(() => null);

      if (!reponse) return 'echec';
      if (reponse.status === 403) return 'refus';
      if (!reponse.ok) return 'echec';

      const donnees = (await reponse.json()) as ReponsePage;
      cache.current.set(numero, donnees);
      return donnees;
    },
    [livreId, langueContenu],
  );

  useEffect(() => {
    const controleur = new AbortController();
    let vivant = true;

    setEtat({ sorte: 'chargement' });

    void (async () => {
      const resultat = await demander(page, controleur.signal);
      if (!vivant) return;

      if (resultat === 'refus') {
        // LE POINT CENTRAL DE CE COMPOSANT. Voir l'encadré en tête de fichier.
        setEtat({ sorte: possedeAuChargement ? 'sessionPerdue' : 'finExtrait' });
        return;
      }
      if (resultat === 'echec') {
        setEtat({ sorte: 'erreur' });
        return;
      }

      setEtat({ sorte: 'page', donnees: resultat });

      // ┌────────────────────────────────────────────────────────────────┐
      // │ LA PAGE SUIVANTE EST PRÉCHARGÉE PENDANT QUE CELLE-CI SE LIT.   │
      // │                                                                │
      // │ Sur la connexion lente que §5.1 décrit, c'est la différence    │
      // │ entre tourner la page et attendre devant un écran blanc.       │
      // │ L'échec est ignoré : ce n'est qu'une avance, pas un besoin.    │
      // └────────────────────────────────────────────────────────────────┘
      if (page < total) {
        void demander(page + 1, controleur.signal).then((suivante) => {
          /*
           * ┌────────────────────────────────────────────────────────────┐
           * │ L'ADRESSE NE SUFFIT PAS : CE SONT LES OCTETS QU'ON ATTEND. │
           * │                                                            │
           * │ Obtenir la signature à l'avance épargne un aller-retour de │
           * │ quelques dizaines de millisecondes ; l'image, elle, pèse   │
           * │ des centaines de kilo-octets. Sur la connexion lente du    │
           * │ §5.1, c'est elle qui fait l'attente.                       │
           * │                                                            │
           * │ `new Image()` la met dans le cache du navigateur sans rien │
           * │ dessiner. L'échec est ignoré — ce n'est qu'une avance.     │
           * └────────────────────────────────────────────────────────────┘
           */
          if (typeof suivante === 'string' || typeof Image === 'undefined') return;
          const avance = new Image();
          avance.decoding = 'async';
          avance.src = suivante.url;
        });
      }

      // ┌────────────────────────────────────────────────────────────────┐
      // │ L'ÉCHEC D'ENREGISTREMENT DE LA PROGRESSION EST INVISIBLE.      │
      // │                                                                │
      // │ Perdre la page de reprise est un désagrément ; interrompre la  │
      // │ lecture d'un enfant pour le lui annoncer en est un plus grand. │
      // │ Aucun message, aucune reprise : le regroupement côté serveur   │
      // │ rattrapera au prochain enregistrement réussi.                  │
      // └────────────────────────────────────────────────────────────────┘
      void fetch(`/api/reading/${livreId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ langue: langueContenu, page }),
        signal: controleur.signal,
      }).catch(() => null);
    })();

    return () => {
      vivant = false;
      controleur.abort();
    };
  }, [page, total, demander, livreId, langueContenu, possedeAuChargement]);

  const aller = useCallback(
    (cible: number) => {
      if (cible >= 1 && cible <= total) setPage(cible);
    },
    [total],
  );

  // Flèches et espace : la navigation au clavier est un critère AA, et c'est
  // aussi ce dont se sert un lecteur installé devant un grand écran — et le
  // seul moyen de tourner la page en plein écran sans bouger la souris.
  useEffect(() => {
    function surTouche(evenement: KeyboardEvent): void {
      if (evenement.key === 'ArrowRight' || evenement.key === ' ') {
        evenement.preventDefault();
        aller(page + 1);
      }
      if (evenement.key === 'ArrowLeft') {
        evenement.preventDefault();
        aller(page - 1);
      }
    }

    window.addEventListener('keydown', surTouche);
    return () => {
      window.removeEventListener('keydown', surTouche);
    };
  }, [page, aller]);

  const positionCle = possedeAuChargement ? 'lecteur.position' : 'lecteur.positionExtrait';
  const libellePosition = traduire(langue, positionCle)
    .replace('{page}', String(page))
    .replace('{total}', String(total));

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA BASCULE EST ICI, ET ELLE EST LA DERNIÈRE LIGNE DE LA LOGIQUE.     │
   * │                                                                      │
   * │ Tout ce qui précède vaut pour les deux scènes ; tout ce qui suit      │
   * │ n'appartient qu'à la V2. La V3 emporte en plus le plein écran, que la │
   * │ V2 n'a jamais eu et n'aura pas : sa scène est bâtie autour de         │
   * │ commandes flottantes, pas autour d'un plateau.                        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  if (estV3()) {
    return (
      <SceneV3
        langue={langue}
        slug={slug}
        titre={titre}
        page={page}
        total={total}
        etat={etat}
        aller={aller}
        possedeAuChargement={possedeAuChargement}
        libellePosition={libellePosition}
      />
    );
  }

  return (
    <SceneV2
      langue={langue}
      slug={slug}
      titre={titre}
      page={page}
      total={total}
      etat={etat}
      aller={aller}
      libellePosition={libellePosition}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LA SCÈNE DE LA V2
// ═══════════════════════════════════════════════════════════════════════════

interface ProprietesSceneV2 {
  langue: LangueInterface;
  slug: string;
  titre: string;
  page: number;
  total: number;
  etat: Etat;
  aller: (cible: number) => void;
  libellePosition: string;
}

/**
 * La scène de la V2 — inchangée, à l'extraction près.
 *
 * Elle efface son interface EN PAGE, au bout de quatre secondes. Le prototype
 * d'Organic ne le fait pas, et sa scène ne le fait donc plus : voir l'encadré
 * de `scene-v3.tsx`. Ce comportement-ci reste ce qu'il était.
 */
function SceneV2({
  langue,
  slug,
  titre,
  page,
  total,
  etat,
  aller,
  libellePosition,
}: ProprietesSceneV2): ReactNode {
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ L'EFFACEMENT EST SUSPENDU dès qu'un message occupe la scène : fin      │
  // │ d'extrait, session perdue, erreur. Effacer les boutons d'un écran qui  │
  // │ demande une action laisserait le lecteur devant un message sans issue. │
  // └────────────────────────────────────────────────────────────────────────┘
  const chromeUtile = etat.sorte === 'page' || etat.sorte === 'chargement';
  const { efface, note } = useEffacement(chromeUtile);

  const balayage = useBalayage((sens) => {
    aller(page + sens);
  });

  return (
    <div className={styles.cadre}>
      <div className={styles.scene} {...balayage}>
        {/* ── Barre supérieure ──────────────────────────────────────────── */}
        <div className={efface ? `${styles.barreHaute} ${styles.efface}` : styles.barreHaute}>
          {/*
            LE SEUL LIEN SORTANT DU LECTEUR.
            Aucun téléchargement, aucune impression, aucun partage, aucune
            publicité — ni ici ni ailleurs dans ce composant.
          */}
          <a className={styles.retour} href={`/${langue}/contes/${slug}`}>
            <span aria-hidden="true">←</span>
            {traduire(langue, 'lecteur.retourFiche')}
          </a>

          <p className={styles.titreLecteur}>{titre}</p>

          {/*
            La position vient de `total`, rendu par l'API — jamais d'un comptage
            fait ici. Sur un accès partiel, le libellé dit « de l'extrait », pour
            qu'on ne croie pas le conte plus court qu'il n'est.
          */}
          <p className={styles.position} aria-live="polite">
            {libellePosition}
          </p>
        </div>

        {/* ── La page ───────────────────────────────────────────────────── */}
        <div className={styles.zonePage}>
          <article className={styles.feuille}>
            {/*
              L'état partagé, jamais un indicateur refabriqué ici : treize écrans
              qui réinventent chacun leur affichage produisent treize
              comportements sur connexion lente.
            */}
            {etat.sorte === 'chargement' ? (
              <Chargement langue={langue} libelle={traduire(langue, 'lecteur.chargement')} />
            ) : null}

            {etat.sorte === 'page' ? (
              <img
                /*
                 * `key` sur l'ADRESSE : elle force React à remonter l'élément
                 * à chaque page, ce qui rejoue l'animation d'entrée. Sans
                 * elle, React réutilise le même `<img>` en changeant `src`,
                 * l'animation ne rejoue pas, et la page suivante apparaît
                 * d'un coup — le « saut » que le fondu existe pour éviter.
                 */
                key={etat.donnees.url}
                src={etat.donnees.url}
                width={etat.donnees.page.largeur}
                height={etat.donnees.page.hauteur}
                alt=""
                /*
                 * La page EST l'écran : rien d'autre n'est à charger, et la
                 * différer reviendrait à retarder la seule chose qu'on est
                 * venu voir. `fetchPriority` la fait passer devant la
                 * préparation de la planche suivante, lancée juste après.
                 */
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className={styles.image}
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
          </article>
        </div>

        {/* ── Navigation ────────────────────────────────────────────────── */}
        {/*
          Trois mécanismes superposés, tous fonctionnels : les zones tactiles
          invisibles au bord de l'écran, les flèches visibles, et le clavier.
          Aucun ne remplace les autres — le geste du bord est celui que tout
          lecteur connaît, la flèche est celle qu'on trouve sans le connaître,
          et le clavier est un critère AA.
        */}
        <button
          type="button"
          className={`${styles.zoneTouche} ${styles.zoneTouchePrecedente}`}
          aria-label={traduire(langue, 'lecteur.pagePrecedente')}
          disabled={page <= 1}
          onClick={() => {
            aller(page - 1);
          }}
        />
        <button
          type="button"
          className={`${styles.zoneTouche} ${styles.zoneToucheSuivante}`}
          aria-label={traduire(langue, 'lecteur.pageSuivante')}
          disabled={page >= total}
          onClick={() => {
            aller(page + 1);
          }}
        />

        <button
          type="button"
          className={
            efface
              ? `${styles.fleche} ${styles.flechePrecedente} ${styles.efface}`
              : `${styles.fleche} ${styles.flechePrecedente}`
          }
          aria-label={traduire(langue, 'lecteur.pagePrecedente')}
          disabled={page <= 1}
          onClick={() => {
            aller(page - 1);
          }}
        >
          <span aria-hidden="true">‹</span>
        </button>

        <button
          type="button"
          className={
            efface
              ? `${styles.fleche} ${styles.flecheSuivante} ${styles.efface}`
              : `${styles.fleche} ${styles.flecheSuivante}`
          }
          aria-label={traduire(langue, 'lecteur.pageSuivante')}
          disabled={page >= total}
          onClick={() => {
            aller(page + 1);
          }}
        >
          <span aria-hidden="true">›</span>
        </button>

        {/* ── Barre inférieure ──────────────────────────────────────────── */}
        <div className={efface ? `${styles.barreBasse} ${styles.efface}` : styles.barreBasse}>
          {/*
            La barre de progression est décorative : la position exacte est déjà
            écrite en toutes lettres dans la barre du haut, et annoncée à chaque
            changement. La redire ici ferait entendre deux fois la même chose.
          */}
          <div className={styles.progression} aria-hidden="true">
            {/*
             * La part est passée SANS UNITÉ, et c'est le CSS qui la convertit
             * en pourcentage. Une multiplication par cent écrite ici tomberait
             * sous la règle qui protège les montants — à raison : c'est
             * exactement la forme qu'un prix mal converti prendrait, et la
             * règle ne peut pas distinguer les deux.
             */}
            <div
              className={styles.progressionRemplie}
              style={{ '--part': page / total } as CSSProperties}
            />
          </div>

          <div
            className={styles.miniatures}
            role="group"
            aria-label={traduire(langue, 'lecteur.titre')}
          >
            {Array.from({ length: total }, (_, index) => index + 1).map((numero) => (
              <button
                key={numero}
                type="button"
                className={
                  numero === page
                    ? `${styles.miniature} ${styles.miniatureActive}`
                    : styles.miniature
                }
                aria-label={traduire(langue, 'lecteur.position')
                  .replace('{page}', String(numero))
                  .replace('{total}', String(total))}
                aria-current={numero === page ? 'true' : undefined}
                onClick={() => {
                  aller(numero);
                }}
              >
                <span className={styles.miniatureNumero}>{numero}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── La note d'aide, une seule fois ────────────────────────────── */}
        {note === 'jamais' ? null : (
          <p
            className={note === 'estompee' ? `${styles.note} ${styles.noteEffacee}` : styles.note}
            // `polite` : elle informe, elle n'interrompt pas une lecture.
            aria-live="polite"
          >
            {traduire(langue, 'lecteur.interfaceEffacee')}
          </p>
        )}
      </div>
    </div>
  );
}
