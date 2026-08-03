'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import { Chargement } from '@/components/etats';
import type { ReponsePage } from '@/domain/api/contract';

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
 */

interface ProprietesLecteur {
  langue: LangueInterface;
  livreId: string;
  slug: string;
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

type Etat =
  | { sorte: 'chargement' }
  | { sorte: 'page'; donnees: ReponsePage }
  | { sorte: 'finExtrait' }
  | { sorte: 'sessionPerdue' }
  | { sorte: 'erreur' };

export function Lecteur({
  langue,
  livreId,
  slug,
  langueContenu,
  total,
  pageInitiale,
  possedeAuChargement,
}: ProprietesLecteur): ReactNode {
  const [page, setPage] = useState(pageInitiale);
  const [etat, setEtat] = useState<Etat>({ sorte: 'chargement' });

  /** Pages déjà obtenues, pour ne pas redemander une signature encore valable. */
  const cache = useRef(new Map<number, ReponsePage>());

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
      if (page < total) void demander(page + 1, controleur.signal);

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
  // aussi ce dont se sert un lecteur installé devant un grand écran.
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

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-6">
      {/*
        Zone d'affichage. Aucun bouton de téléchargement, d'impression ni de
        partage n'est rendu ici, ni ailleurs dans ce composant.
      */}
      <div className="flex min-h-[60vh] w-full items-center justify-center rounded-lg bg-muted">
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
            src={etat.donnees.url}
            width={etat.donnees.page.largeur}
            height={etat.donnees.page.hauteur}
            alt=""
            className="max-h-[80vh] w-auto max-w-full rounded-lg"
          />
        ) : null}

        {etat.sorte === 'sessionPerdue' ? (
          <div className="flex max-w-md flex-col items-center gap-4 p-6 text-center" role="alert">
            {/*
              AUCUNE INVITATION À L'ACHAT ICI. Le conte est déjà payé ; le
              proposer à la vente serait accuser un client de ne pas l'avoir
              fait, en pleine lecture.
            */}
            <p>{traduire(langue, 'lecteur.sessionPerdue')}</p>
            <a href={`/${langue}/connexion`} className="font-semibold underline">
              {traduire(langue, 'lecteur.sessionPerdueAction')}
            </a>
          </div>
        ) : null}

        {etat.sorte === 'finExtrait' ? (
          <div className="flex max-w-md flex-col items-center gap-4 p-6 text-center">
            <p>{traduire(langue, 'lecteur.finExtrait')}</p>
            <a href={`/${langue}/contes/${slug}`} className="font-semibold underline">
              {traduire(langue, 'lecteur.finExtraitAction')}
            </a>
          </div>
        ) : null}

        {etat.sorte === 'erreur' ? (
          <p role="alert">{traduire(langue, 'lecteur.pageIndisponible')}</p>
        ) : null}
      </div>

      <nav
        className="flex w-full items-center justify-between gap-4"
        aria-label={traduire(langue, 'lecteur.titre')}
      >
        <button
          type="button"
          onClick={() => {
            aller(page - 1);
          }}
          disabled={page <= 1}
          // 44 px : le lecteur doit s'utiliser à une main, sur tablette, par un
          // enfant de six ans.
          className="min-h-11 min-w-11 rounded-md px-4 disabled:opacity-40"
        >
          {traduire(langue, 'lecteur.pagePrecedente')}
        </button>

        {/*
          La position vient de `total`, rendu par l'API — jamais d'un comptage
          fait ici. Sur un accès partiel, le libellé dit « de l'extrait », pour
          qu'on ne croie pas le conte plus court qu'il n'est.
        */}
        <p aria-live="polite" className="text-sm">
          {traduire(langue, positionCle)
            .replace('{page}', String(page))
            .replace('{total}', String(total))}
        </p>

        <button
          type="button"
          onClick={() => {
            aller(page + 1);
          }}
          disabled={page >= total}
          className="min-h-11 min-w-11 rounded-md px-4 disabled:opacity-40"
        >
          {traduire(langue, 'lecteur.pageSuivante')}
        </button>
      </nav>
    </div>
  );
}
