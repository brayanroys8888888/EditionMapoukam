'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import type { ApercuCommande } from '@/domain/api/contract';
import { IconePanier } from '@/components/icones';
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
   * │ TROIS OBLIGATIONS D'UNE BOÎTE MODALE, ET ELLES SONT TOUTES ICI.       │
   * │                                                                        │
   * │   1. `Escape` ferme — c'est le geste qu'on essaie en premier ;         │
   * │   2. le focus ENTRE dans le panneau à l'ouverture, sans quoi la        │
   * │      tabulation continue derrière le voile, sur des liens invisibles ; │
   * │   3. la page de fond ne défile plus — sinon on perd sa place en        │
   * │      faisant défiler le tiroir sur un téléphone.                       │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  useEffect(() => {
    if (!ouvert) return;

    function surTouche(evenement: KeyboardEvent): void {
      if (evenement.key === 'Escape') fermer();
    }

    const defilementInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', surTouche);

    // Au prochain rendu : le panneau existe alors dans le document.
    const minuterie = window.setTimeout(() => {
      panneau.current?.querySelector<HTMLElement>('button, a')?.focus();
    }, 0);

    return () => {
      window.clearTimeout(minuterie);
      window.removeEventListener('keydown', surTouche);
      document.body.style.overflow = defilementInitial;
    };
  }, [ouvert, fermer]);

  /** Retire une ligne, puis relit le panier — le total change avec elle. */
  const retirer = useCallback(
    async (livreId: string) => {
      setEnCours(livreId);
      await fetch(`/api/cart/items/${livreId}`, { method: 'DELETE' }).catch(() => null);
      setEnCours(null);
      await charger();
      // La page derrière le tiroir porte le même panier — en-tête compris.
      // Sans ce rafraîchissement, son montant contredirait le tiroir.
      window.location.reload();
    },
    [charger],
  );

  const nombre = etat.sorte === 'pret' ? etat.apercu.lignes.length : nombreInitial;

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
              <button
                type="button"
                className={styles.fermer}
                onClick={fermer}
                aria-label={traduire(langue, 'v2.tiroirFermer')}
              >
                <span aria-hidden="true">→</span>
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
                          <div className={styles.ligneTexte}>
                            <span className={styles.ligneTitre}>{ligne.titre}</span>
                            {/*
                             * `prix_affichage`, formaté par le serveur. Le
                             * `prix_unitaire` voisin est un entier de
                             * sous-unités, et le diviser ici serait faux d'un
                             * facteur cent en franc CFA.
                             */}
                            <span className={styles.lignePrix}>{ligne.prix_affichage}</span>

                            <button
                              type="button"
                              className={styles.retirer}
                              onClick={() => {
                                void retirer(ligne.livre_id);
                              }}
                              disabled={enCours !== null}
                            >
                              {traduire(langue, 'panier.retirer')}
                            </button>
                          </div>
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
                <p className={styles.totalLigne}>
                  <span>{traduire(langue, 'panier.sousTotal')}</span>
                  <span>{etat.apercu.sous_total_affichage}</span>
                </p>

                {etat.apercu.remise > 0 ? (
                  <p className={styles.totalLigne}>
                    <span>{traduire(langue, 'panier.remise')}</span>
                    <span>−{etat.apercu.remise_affichage}</span>
                  </p>
                ) : null}

                <p className={styles.totalFinal}>
                  <span className={styles.totalFinalIntitule}>
                    {traduire(langue, 'panier.total')}
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
                <a className={styles.payer} href={`/${langue}/panier`}>
                  {traduire(langue, 'v2.tiroirPayer')}
                  <span aria-hidden="true">→</span>
                </a>

                <p className={styles.mention}>{traduire(langue, 'v2.tiroirMention')}</p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
