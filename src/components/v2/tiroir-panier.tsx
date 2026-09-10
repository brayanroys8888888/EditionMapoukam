'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import type { ApercuCommande } from '@/domain/api/contract';
import { IconePanier } from '@/components/icones';
import { useDemandesOuvertureTiroir, useNombrePanier } from '@/components/panier/magasin';
import { metaLivre } from '@/components/catalogue/meta';
import styles from './tiroir-panier.module.css';
import entete from '@/components/enveloppe/v2.module.css';

/**
 * TIROIR DE PANIER.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TOTAL VIENT DU SERVEUR, JAMAIS D'UNE ADDITION FAITE ICI.             │
 * │                                                                          │
 * │ C'est la règle du panier, et elle vaut d'autant plus dans un composant   │
 * │ CLIENT : additionner les prix unitaires affichés donnerait un résultat   │
 * │ juste la plupart du temps, et faux dès qu'un code promo, une remise ou   │
 * │ une zone d'encaissement différente entre en jeu.                        │
 * │                                                                          │
 * │ Le tiroir appelle donc `PUT /api/orders`, qui calcule SANS RIEN          │
 * │ ENREGISTRER — le même module que l'écran du panier. Il lit               │
 * │ `total_affichage`, déjà formaté : le nombre de décimales dépend de la    │
 * │ devise, et le franc CFA n'a pas de sous-unité.                          │
 * │                                                                          │
 * │ Un test d'architecture échoue sur toute arithmétique portant sur         │
 * │ `prix_unitaire` dans un écran. Ce composant n'en contient aucune.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE QUANTITÉ, ET CE N'EST PAS UN OUBLI.                              │
 * │                                                                          │
 * │ La capture du site actuel montre un sélecteur « + 3 − » par ligne. Il    │
 * │ n'a aucun sens ici : un conte est un FICHIER, et un droit s'obtient une  │
 * │ fois. Acheter trois fois le même titre ne donnerait pas trois fichiers,  │
 * │ cela facturerait trois fois le même droit — et le moteur de droits       │
 * │ refuserait les deux derniers.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * La plus large barre de défilement qu'on accepte de compenser.
 *
 * Windows en pose une de 17 px, les thèmes anciens jusqu'à 20. Trente est
 * large ; au-delà, la mesure décrit autre chose qu'une barre — voir l'encadré
 * de la gouttière plus bas.
 */
const GOUTTIERE_MAX_PX = 30;

type Etat =
  | { sorte: 'ferme' }
  | { sorte: 'chargement' }
  | { sorte: 'pret'; apercu: ApercuCommande }
  | { sorte: 'vide' }
  | { sorte: 'erreur' };

export function TiroirPanier({
  langue,
  nombreInitial,
}: {
  langue: LangueInterface;
  /**
   * Le nombre d'articles connu du SERVEUR au rendu de la page.
   *
   * Il pilote la pastille avant toute ouverture : sans lui, le bouton
   * afficherait « 0 » jusqu'au premier clic, y compris pour un panier plein.
   */
  nombreInitial: number;
}): ReactNode {
  const [etat, setEtat] = useState<Etat>({ sorte: 'ferme' });
  const [enCours, setEnCours] = useState<string | null>(null);
  const router = useRouter();

  const bouton = useRef<HTMLButtonElement | null>(null);
  const panneau = useRef<HTMLDivElement | null>(null);

  /** Lit le panier ET son total, en une requête. */
  const charger = useCallback(async () => {
    setEtat({ sorte: 'chargement' });

    const reponse = await fetch('/api/orders', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      // Zone d'AFFICHAGE seulement. La zone d'encaissement est déterminée au
      // paiement, depuis le pays réel du moyen de paiement.
      body: JSON.stringify({ zone_affichee: 'international' }),
      cache: 'no-store',
    }).catch(() => null);

    if (!reponse) {
      setEtat({ sorte: 'erreur' });
      return;
    }

    // 409 `panier_vide` n'est PAS une erreur : c'est un panier vide, et il a
    // son propre écran. Les confondre afficherait « réessayez » à quelqu'un
    // qui n'a simplement rien mis dans son panier.
    if (reponse.status === 409) {
      setEtat({ sorte: 'vide' });
      return;
    }

    // 401 : la session a expiré pendant la navigation. On renvoie vers l'écran
    // du panier, qui sait rediriger vers la connexion — plutôt que d'afficher
    // une erreur technique dans un tiroir.
    if (reponse.status === 401) {
      window.location.href = `/${langue}/panier`;
      return;
    }

    if (!reponse.ok) {
      setEtat({ sorte: 'erreur' });
      return;
    }

    const apercu = (await reponse.json()) as ApercuCommande;
    setEtat(apercu.lignes.length === 0 ? { sorte: 'vide' } : { sorte: 'pret', apercu });
  }, [langue]);

  const ouvrir = useCallback(() => {
    void charger();
  }, [charger]);

  const fermer = useCallback(() => {
    setEtat({ sorte: 'ferme' });
    // Le focus RETOURNE au bouton qui a ouvert le tiroir. Sans cela, il
    // repart au début du document, et l'utilisateur au clavier retraverse
    // toute la navigation pour revenir où il était.
    bouton.current?.focus();
  }, []);

  const ouvert = etat.sorte !== 'ferme';

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ CINQ OBLIGATIONS D'UNE BOÎTE MODALE, ET ELLES SONT TOUTES ICI.        │
   * │                                                                        │
   * │   1. `Escape` ferme — c'est le geste qu'on essaie en premier ;         │
   * │   2. le focus ENTRE dans le panneau à l'ouverture ;                    │
   * │   3. il n'en SORT PAS à la tabulation — voir l'encadré ci-dessous ;    │
   * │   4. la page de fond ne défile plus — sinon on perd sa place en        │
   * │      faisant défiler le tiroir sur un téléphone ;                      │
   * │   5. et elle ne SAUTE PAS pour autant.                                 │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ `aria-modal` NE PIÈGE PAS LE FOCUS — C'EST LE MALENTENDU HABITUEL.     │
   * │                                                                        │
   * │ L'attribut dit aux technologies d'assistance d'ignorer le reste du     │
   * │ document. Il ne dit RIEN au navigateur : la touche Tab continue de     │
   * │ parcourir l'ordre du document, et depuis le dernier bouton du tiroir   │
   * │ elle emmène sur les liens de la page qui se trouve derrière le voile.  │
   * │ On tabule alors sur des cibles qu'on ne voit pas, avec un anneau de    │
   * │ focus caché sous un calque — et le seul moyen de revenir est de        │
   * │ retraverser toute la page.                                             │
   * │                                                                        │
   * │ Le cycle est donc fermé à la main. `:not([disabled])` compte, et       │
   * │ `styles.voile` en fait partie : le voile EST un bouton, et il est le   │
   * │ premier de l'ordre du document — sans lui dans la liste, Maj+Tab       │
   * │ depuis le bouton de fermeture sortirait par le haut.                   │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LA GOUTTIÈRE — POURQUOI LA PAGE SAUTAIT DE QUINZE PIXELS.             │
   * │                                                                        │
   * │ `overflow: hidden` sur le corps retire la barre de défilement, et la   │
   * │ page s'élargit d'un coup de sa largeur. Tout le contenu centré glisse  │
   * │ vers la droite au moment où le tiroir s'ouvre, et revient à la         │
   * │ fermeture. Le défaut n'existe pas sur macOS, où les barres flottent    │
   * │ au-dessus du contenu — d'où la facilité avec laquelle il survit.       │
   * │                                                                        │
   * │ On rend donc à la page, en marge, exactement ce que la barre lui       │
   * │ prenait. La mesure est faite AVANT de masquer le défilement : après,   │
   * │ elle rend zéro.                                                        │
   * │                                                                        │
   * │ La valeur est aussi posée sur la racine, en `--gouttiere-modale` : un  │
   * │ en-tête `position: fixed` ne se laisse pas décaler par une marge du    │
   * │ corps, et doit se compenser lui-même.                                  │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  useEffect(() => {
    if (!ouvert) return;

    function surTouche(evenement: KeyboardEvent): void {
      if (evenement.key === 'Escape') {
        fermer();
        return;
      }

      if (evenement.key !== 'Tab') return;

      const cibles = [
        ...document.querySelectorAll<HTMLElement>(
          `.${styles.voile}, .${styles.tiroir} button:not([disabled]), .${styles.tiroir} a[href]`,
        ),
      ];
      if (cibles.length === 0) return;

      const premier = cibles[0];
      const dernier = cibles.at(-1);
      if (!premier || !dernier) return;

      const actif = document.activeElement;

      if (evenement.shiftKey && actif === premier) {
        evenement.preventDefault();
        dernier.focus();
      } else if (!evenement.shiftKey && actif === dernier) {
        evenement.preventDefault();
        premier.focus();
      } else if (actif instanceof HTMLElement && !cibles.includes(actif)) {
        // Le focus s'est retrouvé hors du tiroir — au premier Tab après une
        // ouverture au clic, par exemple. On le ramène plutôt que de le suivre.
        evenement.preventDefault();
        premier.focus();
      }
    }

    /*
     * Mesurée AVANT le masquage : après, la barre n'occupe plus rien.
     *
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ ET PLAFONNÉE, PARCE QUE LA SOUSTRACTION PEUT MENTIR.                │
     * │                                                                      │
     * │ `clientWidth` vaut 0 partout où le document n'est pas mis en page —  │
     * │ jsdom, un rendu hors écran, un onglet jamais peint. L'écart devient  │
     * │ alors la largeur ENTIÈRE de la fenêtre, et la compensation pousse la │
     * │ page de mille pixels vers la gauche : le remède serait mille fois    │
     * │ pire que le saut qu'il corrige.                                      │
     * │                                                                      │
     * │ Aucune barre de défilement ne dépasse une trentaine de pixels. Au-   │
     * │ delà, la mesure ne décrit pas une barre : on ne compense rien, et le │
     * │ pire qui arrive est le saut d'origine.                               │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    const mesure = window.innerWidth - document.documentElement.clientWidth;
    const gouttiere = mesure > 0 && mesure <= GOUTTIERE_MAX_PX ? mesure : 0;

    const defilementInitial = document.body.style.overflow;
    const margeInitiale = document.body.style.paddingRight;

    document.body.style.overflow = 'hidden';
    if (gouttiere > 0) {
      document.body.style.paddingRight = `${gouttiere}px`;
      document.documentElement.style.setProperty('--gouttiere-modale', `${gouttiere}px`);
    }

    window.addEventListener('keydown', surTouche);

    // Au prochain rendu : le panneau existe alors dans le document.
    const minuterie = window.setTimeout(() => {
      panneau.current?.querySelector<HTMLElement>('button, a')?.focus();
    }, 0);

    return () => {
      window.clearTimeout(minuterie);
      window.removeEventListener('keydown', surTouche);
      document.body.style.overflow = defilementInitial;
      document.body.style.paddingRight = margeInitiale;
      document.documentElement.style.removeProperty('--gouttiere-modale');
    };
  }, [ouvert, fermer]);

  /** Retire une ligne, puis relit le panier — le total change avec elle. */
  const retirer = useCallback(
    async (livreId: string) => {
      setEnCours(livreId);
      await fetch(`/api/cart/items/${livreId}`, { method: 'DELETE' }).catch(() => null);
      setEnCours(null);
      await charger();
      /*
       * ┌──────────────────────────────────────────────────────────────────┐
       * │ `router.refresh()`, ET NON `window.location.reload()`.           │
       * │                                                                  │
       * │ La page derrière le tiroir porte le même panier : sans           │
       * │ rafraîchissement, son montant contredirait le tiroir. Mais un    │
       * │ rechargement complet FERMAIT le tiroir, perdait le focus et      │
       * │ retéléchargeait toute la page — pour une ligne retirée, et sur   │
       * │ la connexion lente du §5.1.                                      │
       * │                                                                  │
       * │ `router.refresh()` ne redemande que l'arbre serveur : le tiroir  │
       * │ reste ouvert, à sa place, et l'état qu'on vient de relire n'est  │
       * │ pas jeté. C'est le même serveur qui répond, donc la même seule   │
       * │ source de vérité sur le contenu du panier.                       │
       * └──────────────────────────────────────────────────────────────────┘
       */
      router.refresh();
    },
    [charger, router],
  );

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LA PASTILLE AVANCE AVEC LE CLIC, PAS AVEC LA RÉPONSE.                 │
   * │                                                                        │
   * │ `useNombrePanier` ajoute au nombre du SERVEUR l'écart optimiste posé   │
   * │ par la carte qu'on vient de cliquer, et le remet à zéro dès qu'un      │
   * │ nouveau nombre arrive. Le serveur reste l'autorité ; l'écart ne fait   │
   * │ que combler l'aller-retour. Voir `panier/magasin.ts`.                  │
   * │                                                                        │
   * │ Quand le tiroir est OUVERT, c'est lui qui compte : il vient de lire le │
   * │ panier, et son compte est plus frais que celui de la page.             │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const nombreAffiche = useNombrePanier(nombreInitial);
  const nombre = etat.sorte === 'pret' ? etat.apercu.lignes.length : nombreAffiche;

  /*
   * L'ouverture demandée DE LOIN — par une carte dont le titre était déjà au
   * panier (`06`). Le compteur ne dit pas « ouvert » : il dit qu'une demande
   * de plus a été faite, ce qui permet de rouvrir un tiroir qu'on vient de
   * fermer. On ignore la valeur initiale, sinon le tiroir s'ouvrirait au
   * premier rendu de chaque page.
   */
  const demandes = useDemandesOuvertureTiroir();
  const premiereDemande = useRef(demandes);

  useEffect(() => {
    if (demandes === premiereDemande.current) return;
    premiereDemande.current = demandes;
    void charger();
  }, [demandes, charger]);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={entete.carreAction}
        onClick={ouvrir}
        aria-label={traduire(langue, 'v2.tiroirOuvrir')}
        aria-expanded={ouvert}
      >
        <IconePanier taille={20} />
        {nombre > 0 ? (
          <span className={entete.pastilleNombre} aria-hidden="true">
            {nombre}
          </span>
        ) : null}
      </button>

      {ouvert ? (
        /*
         * ┌──────────────────────────────────────────────────────────────────┐
         * │ LE TIROIR EST PORTÉ SUR `<body>`, ET CE N'EST PAS UN CONFORT.    │
         * │                                                                  │
         * │ Ce composant est rendu DANS l'en-tête, à côté du bouton qui      │
         * │ l'ouvre. Sous la V3, l'en-tête porte `backdrop-filter` — et une  │
         * │ propriété de filtre fait de l'élément un BLOC CONTENEUR pour ses  │
         * │ descendants `position: fixed`. Le tiroir cessait donc d'être      │
         * │ fixé à la fenêtre pour se caler sur l'en-tête : un panneau de     │
         * │ 76 px de haut, collé sous la barre utilitaire, et un voile qui    │
         * │ ne couvrait que l'en-tête.                                        │
         * │                                                                  │
         * │ Rien ne le signale : le CSS est juste, le composant est juste,    │
         * │ et `position: fixed` continue de s'appliquer — sur un autre       │
         * │ repère. `transform`, `filter`, `perspective` et `will-change`     │
         * │ ont exactement le même effet, ce qui rend le défaut facile à      │
         * │ recréer ailleurs.                                                 │
         * │                                                                  │
         * │ Le portail règle la question à la racine : le panneau vit sous    │
         * │ `<body>`, hors de toute pile de filtres. L'ordre du DOM change,   │
         * │ mais pas l'ordre de tabulation utile — le cycle est piégé à la    │
         * │ main, et le focus revient au bouton à la fermeture.               │
         * └──────────────────────────────────────────────────────────────────┘
         */
        createPortal(
          <>
          {/*
           * Le voile est un BOUTON, pas un `div` cliquable : cliquer à côté
           * pour fermer est une action, et une action doit être atteignable
           * au clavier. `aria-label` le nomme ; il n'a aucun contenu visible.
           */}
          <button
            type="button"
            className={styles.voile}
            onClick={fermer}
            aria-label={traduire(langue, 'v2.tiroirFermer')}
          />

          <div
            ref={panneau}
            className={styles.tiroir}
            role="dialog"
            aria-modal="true"
            aria-label={traduire(langue, 'v2.tiroirTitre')}
          >
            <div className={styles.entete}>
              {/*
               * ┌──────────────────────────────────────────────────────────┐
               * │ DEUX DESSINS POUR UNE SEULE COMMANDE, ET LA FEUILLE      │
               * │ CHOISIT.                                                  │
               * │                                                          │
               * │ La V2 ferme par une flèche posée à GAUCHE du titre — le  │
               * │ tiroir « repart » vers la droite. Organic ferme par une  │
               * │ croix dans un rond de 38 px, à DROITE. Les deux sont     │
               * │ rendus, la feuille n'en montre qu'un, et la place change │
               * │ par `order` : un composant qui lirait la direction       │
               * │ visuelle serait le premier du produit à la connaître.    │
               * │                                                          │
               * │ Le nom accessible ne vient d'aucun des deux : il est sur │
               * │ le bouton, et les deux dessins sont décoratifs.          │
               * └──────────────────────────────────────────────────────────┘
               */}
              <button
                type="button"
                className={styles.fermer}
                onClick={fermer}
                aria-label={traduire(langue, 'v2.tiroirFermer')}
              >
                <span aria-hidden="true" className={styles.fermerFleche}>
                  →
                </span>
                <svg
                  className={styles.fermerCroix}
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>

              <h2 className={styles.titre}>{traduire(langue, 'v2.tiroirTitre')}</h2>

              {etat.sorte === 'pret' ? (
                <span className={styles.compte} aria-hidden="true">
                  {etat.apercu.lignes.length}
                </span>
              ) : null}
            </div>

            <div className={styles.corps}>
              {etat.sorte === 'chargement' ? (
                <p className={styles.etat} aria-live="polite">
                  {traduire(langue, 'v2.tiroirChargement')}
                </p>
              ) : null}

              {etat.sorte === 'vide' ? (
                <div className={styles.etat}>
                  {/*
                   * Le rond de 74 px du prototype, avec le panier en terre
                   * cuite. Décoratif : les deux phrases qui suivent disent
                   * tout, et un panier annoncé « image » avant « Rien pour
                   * l'instant » n'apprend rien à qui écoute.
                   */}
                  <span className={styles.etatRond} aria-hidden="true">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.75"
                      strokeLinecap="round"
                      focusable="false"
                    >
                      <path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8Z" />
                      <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
                    </svg>
                  </span>
                  <p className={styles.etatTitre}>{traduire(langue, 'v2.tiroirVideTitre')}</p>
                  <p className={styles.etatCorps}>{traduire(langue, 'v2.tiroirVideCorps')}</p>
                  <a className={styles.etatAction} href={`/${langue}/catalogue`}>
                    {traduire(langue, 'v2.tiroirVideAction')}
                  </a>
                </div>
              ) : null}

              {etat.sorte === 'erreur' ? (
                <div className={styles.etat} role="alert">
                  <p className={styles.etatTitre}>{traduire(langue, 'v2.tiroirErreurTitre')}</p>
                  <p className={styles.etatCorps}>{traduire(langue, 'v2.tiroirErreurCorps')}</p>
                  <button type="button" className={styles.etatAction} onClick={ouvrir}>
                    {traduire(langue, 'v2.tiroirReessayer')}
                  </button>
                </div>
              ) : null}

              {etat.sorte === 'pret' ? (
                <>
                  <ul className={styles.lignes}>
                    {etat.apercu.lignes.map((ligne) => (
                      <li key={`${ligne.livre_id}:${ligne.langue}`}>
                        <div className={styles.ligne}>
                          {/*
                           * ┌────────────────────────────────────────────┐
                           * │ LA COUVERTURE VIENT DU SERVEUR, AVEC LA    │
                           * │ LIGNE.                                      │
                           * │                                            │
                           * │ Elle n'a pas toujours été là : une ligne de │
                           * │ panier ne portait que son titre et son      │
                           * │ prix, et le tiroir alignait trois noms nus. │
                           * │ `GET`/`PUT /api/orders` les rend            │
                           * │ désormais — voir l'encadré de               │
                           * │ `ApercuCommande`.                          │
                           * │                                            │
                           * │ `null` est un cas normal, pas une panne :  │
                           * │ un titre en cours d'ingestion n'a pas       │
                           * │ encore de jeu de couvertures. On ne rend    │
                           * │ alors rien plutôt qu'une image cassée.      │
                           * │                                            │
                           * │ `alt=""` : le titre est écrit juste à côté,│
                           * │ et le redire ferait entendre deux fois la   │
                           * │ même phrase.                                │
                           * └────────────────────────────────────────────┘
                           */}
                          {ligne.couverture ? (
                            <img
                              className={styles.vignette}
                              src={ligne.couverture}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              width={62}
                              height={93}
                            />
                          ) : null}

                          <div className={styles.ligneTexte}>
                            <span className={styles.ligneTitre}>{ligne.titre}</span>

                            {/*
                             * « 5–10 ans · 20 pages ». `metaLivre` est
                             * l'unique implémentation de cette ligne : elle
                             * sert aussi les cartes du catalogue.
                             */}
                            {metaLivre(langue, ligne) ? (
                              <span className={styles.ligneMeta}>{metaLivre(langue, ligne)}</span>
                            ) : null}
                            {/*
                             * `prix_affichage`, formaté par le serveur. Le
                             * `prix_unitaire` voisin est un entier de
                             * sous-unités, et le diviser ici serait faux d'un
                             * facteur cent en franc CFA.
                             */}
                            <span className={styles.lignePrix}>{ligne.prix_affichage}</span>

                          </div>

                          <button
                            type="button"
                            className={styles.retirer}
                            onClick={() => {
                              void retirer(ligne.livre_id);
                            }}
                            disabled={enCours !== null}
                          >
                            <span className={styles.retirerTexte}>
                              {traduire(langue, 'panier.retirer')}
                            </span>
                            <svg
                              className={styles.retirerCroix}
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.75"
                              strokeLinecap="round"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path d="M6 6l12 12M18 6 6 18" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/*
                    LES LIGNES ÉCARTÉES, NOMMÉES UNE PAR UNE.

                    Quatre motifs, quatre messages. Un titre retiré en silence
                    est perçu comme une commande perdue.
                  */}
                  {etat.apercu.refusees.length > 0 ? (
                    <div className={styles.refus}>
                      <p className={styles.refusTitre}>
                        {traduire(langue, 'panier.refuseesTitre')}
                      </p>
                      <ul className={styles.refusListe}>
                        {etat.apercu.refusees.map((refus) => (
                          <li key={refus.livre_id}>
                            <strong>{refus.titre}</strong> —{' '}
                            {traduire(langue, `panier.refus_${refus.raison}` as CleTraduction)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            {etat.sorte === 'pret' ? (
              <div className={styles.pied}>
                {/*
                 * ┌──────────────────────────────────────────────────────────┐
                 * │ UNE SEULE LIGNE QUAND IL N'Y A RIEN À DÉDUIRE.          │
                 * │                                                          │
                 * │ Le prototype n'écrit qu'un chiffre : « Sous-total » à     │
                 * │ gauche, le montant à droite. Il n'a pas de codes promo,  │
                 * │ donc jamais deux montants à réconcilier.                 │
                 * │                                                          │
                 * │ Ici il peut y en avoir. Empiler « Sous-total 3 000 » et  │
                 * │ « Total 3 000 » quand aucune remise ne s'applique fait   │
                 * │ chercher la différence entre deux nombres identiques —   │
                 * │ c'est le genre de doute qu'on ne veut pas au moment de   │
                 * │ payer. Sans remise, la ligne unique du prototype dit     │
                 * │ tout. Avec remise, les trois lignes reviennent, parce    │
                 * │ qu'alors elles disent chacune quelque chose.             │
                 * │                                                          │
                 * │ Les deux montants restent formatés par le SERVEUR : ce   │
                 * │ choix ne porte que sur ce qu'on montre, jamais sur ce    │
                 * │ qu'on calcule.                                           │
                 * └──────────────────────────────────────────────────────────┘
                 */}
                {etat.apercu.remise > 0 ? (
                  <>
                    <p className={styles.totalLigne}>
                      <span>{traduire(langue, 'panier.sousTotal')}</span>
                      <span>{etat.apercu.sous_total_affichage}</span>
                    </p>

                    <p className={styles.totalLigne}>
                      <span>{traduire(langue, 'panier.remise')}</span>
                      <span>−{etat.apercu.remise_affichage}</span>
                    </p>
                  </>
                ) : null}

                <p className={styles.totalFinal}>
                  <span className={styles.totalFinalIntitule}>
                    {traduire(langue, etat.apercu.remise > 0 ? 'panier.total' : 'panier.sousTotal')}
                  </span>
                  <span className={styles.totalFinalMontant}>{etat.apercu.total_affichage}</span>
                </p>

                {/*
                 * Le paiement passe par l'ÉCRAN du panier, jamais par une
                 * commande créée depuis ce tiroir : la création de commande
                 * peut demander une confirmation de total quand la zone
                 * d'encaissement diverge, et un tiroir n'est pas l'endroit
                 * pour poser cette question.
                 */}
                <p className={styles.mention}>{traduire(langue, 'v2.tiroirMention')}</p>

                <a className={styles.payer} href={`/${langue}/panier`}>
                  {traduire(langue, 'v2.tiroirPayer')}
                  <span className={styles.payerFleche} aria-hidden="true">
                    →
                  </span>
                </a>
              </div>
            ) : null}
          </div>
          </>,
          document.body,
        )
      ) : null}
    </>
  );
}
