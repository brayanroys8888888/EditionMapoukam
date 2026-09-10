import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { MOYENS_PAIEMENT, type MoyenPaiement } from '@/domain/payments/moyens';
import { metaLivre } from '@/components/catalogue/meta';
import {
  BandeauSimulation,
  ChampsCoordonnees,
  SceauIssue,
  monogramme,
  type ErreursCoordonnees,
} from '@/components/tunnel';
import type { LigneCommandeLue } from '@/lib/orders/lecture';

import styles from './paiement-v3.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE RÈGLEMENT — L'ÉCRAN ORGANIC.                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Prototype, lignes 1339 à 1478 : le règlement et son issue. Les mesures sont
 * dans la feuille voisine ; ce fichier ne porte que la structure et les
 * données.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN MONTANT N'EST CALCULÉ ICI, ET AUCUN N'EST FORMATÉ ICI.            │
 * │                                                                          │
 * │ Les chaînes arrivent déjà mises en forme par le serveur, avec leur       │
 * │ monnaie. Le franc CFA n'a pas de sous-unité : une division par cent      │
 * │ écrite dans un écran multiplierait l'erreur par cent sur une zone        │
 * │ entière, et un test d'architecture échoue sur le motif.                  │
 * │                                                                          │
 * │ Corollaire visible : le récapitulatif ne porte PAS de « sous-total ». Le │
 * │ prototype en affiche un ; l'obtenir demanderait d'additionner les lignes │
 * │ ou d'ajouter la remise au total — deux additions, dans un écran, sur des │
 * │ montants. Le total vient de la commande, la remise aussi, et la          │
 * │ soustraction qui les relie a déjà eu lieu en base.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS ÉCARTS AU PROTOTYPE, ÉCRITS ICI PARCE QU'ILS SE VOIENT.           │
 * │                                                                          │
 * │ 1. **Pas de champ « numéro de carte ».** Le dossier en dessine quatre —  │
 * │    numéro, titulaire, expiration, code de sécurité. Ils ne seront jamais │
 * │    écrits : un prestataire réel impose des champs hébergés CHEZ LUI,     │
 * │    précisément pour que le numéro ne touche pas le serveur du marchand.  │
 * │    Les dessiner aujourd'hui serait dessiner un écran qu'il faudrait      │
 * │    défaire le jour de l'intégration — et apprendre entre-temps aux       │
 * │    clients à taper leur carte sur ce domaine.                            │
 * │                                                                          │
 * │ 2. **Pas de champ « code promo ».** Il existe, et il vit une étape plus  │
 * │    tôt, sur `/panier` : ici la commande est ÉCRITE, son total est arrêté │
 * │    et un webhook peut arriver dessus. Un champ qui ne pourrait rien      │
 * │    changer est pire qu'un champ absent.                                  │
 * │                                                                          │
 * │ 3. **Un seul aplat pour les trois monogrammes.** Le prototype peint      │
 * │    chacun de la couleur de son opérateur, en blanc dessus. Deux des      │
 * │    trois échouent au seuil AA du §5.3 — le jaune MTN très largement —    │
 * │    et `design-tokens.test.ts` refuse déjà le blanc sur la terre cuite    │
 * │    pour cette raison. Le nom complet est écrit à côté ; il distingue les │
 * │    moyens mieux qu'une teinte.                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Ce dont l'écran a besoin pour dessiner une commande. Rien de plus. */
export interface CommandeAffichee {
  id: string;
  /** Déjà mis en forme par le serveur — « 16,97 € ». */
  montantAffiche: string;
  /** `null` quand aucun code promotionnel n'a été retenu. */
  remiseAffichee: string | null;
  lignes: readonly LigneCommandeLue[];
  /** Le prix de chaque ligne, mis en forme, dans l'ordre des lignes. */
  prixAffiches: readonly string[];
}

interface ProprietesPaiement {
  langue: LangueInterface;
  commande: CommandeAffichee;
  /** Le moyen retenu, ou `null` tant qu'aucun ne l'est. */
  moyen: MoyenPaiement | null;
  /** L'adresse de l'écran, sans paramètre — pour construire les liens. */
  base: string;
  emailDefaut: string;
  enDefaut: ErreursCoordonnees;
  /**
   * Le prestataire branché est-il un simulacre local ?
   *
   * Lu du CONTRAT `PaymentProvider`, jamais deviné d'une variable
   * d'environnement recopiée ici. Il commande deux choses, et deux seulement :
   * le bandeau « paiement simulé », et la carte des issues à éprouver. Face à
   * Notch Pay, ni l'un ni l'autre n'a de sens — l'issue se joue chez le
   * prestataire, et le débit est réel même en mode test.
   */
  simule: boolean;
  /**
   * Actions serveur DÉJÀ LIÉES à la commande, par l'écran qui la possède.
   *
   * Le composant ne connaît donc pas l'identifiant qu'il règle : il ne peut
   * pas en régler un autre, et aucune valeur du corps de requête n'entre dans
   * la décision — c'est la session vérifiée qui a désigné cette commande.
   */
  reglerReussi: (donnees: FormData) => Promise<void>;
  reglerEchoue: (donnees: FormData) => Promise<void>;
  reglerAbandonne: (donnees: FormData) => Promise<void>;
}

/** L'identifiant du formulaire de règlement, cité par le bouton de la colonne. */
const FORMULAIRE = 'reglement';

/** Le cadenas de la bande de réassurance — 22 px, trait de 2,75, sauge. */
function Cadenas(): ReactNode {
  return (
    <svg
      className={styles.cadenas}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 11V8.5a5 5 0 0 1 10 0V11" />
      <path d="M5.5 11h13v9h-13z" />
    </svg>
  );
}

/** Le fil d'Ariane du prototype : « Boutique / Paiement ». */
function FilAriane({ langue }: { langue: LangueInterface }): ReactNode {
  return (
    <nav className={styles.ariane} aria-label={traduire(langue, 'navigation.principal')}>
      <a className={styles.arianeLien} href={`/${langue}/contes`}>
        {traduire(langue, 'navigation.catalogue')}
      </a>
      <span aria-hidden="true">/</span>
      <span className={styles.arianeCourant}>{traduire(langue, 'paiement.titre')}</span>
    </nav>
  );
}

/**
 * Le récapitulatif, colonne de droite.
 *
 * Il est rendu par les DEUX sous-écrans du règlement — celui qui demande le
 * moyen et celui qui demande les coordonnées — parce que le prototype le
 * laisse en place d'un bout à l'autre : on doit pouvoir relire ce qu'on paie
 * au moment où l'on tape, sans remonter.
 */
function Recapitulatif({
  langue,
  commande,
  moyenChoisi,
}: {
  langue: LangueInterface;
  commande: CommandeAffichee;
  moyenChoisi: boolean;
}): ReactNode {
  return (
    <aside className={styles.recap}>
      <h2 className={styles.recapTitre}>{traduire(langue, 'paiement.recapTitre')}</h2>

      <ul className={styles.lignes}>
        {commande.lignes.map((ligne, rang) => {
          const meta = metaLivre(langue, ligne);

          return (
            <li className={styles.ligne} key={`${ligne.livre_id}:${ligne.langue}`}>
              {ligne.couverture ? (
                <img
                  className={styles.vignette}
                  src={ligne.couverture}
                  alt=""
                  width={48}
                  height={68}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className={styles.vignetteVide} aria-hidden="true" />
              )}

              <span className={styles.ligneTexte}>
                {/*
                  Le titre peut manquer : la traduction achetée a pu disparaître
                  du catalogue depuis. On écrit alors l'identifiant plutôt
                  qu'une ligne vide — un récapitulatif à trous inquiète plus
                  qu'une référence technique.
                */}
                <span className={styles.ligneTitre}>{ligne.titre ?? ligne.livre_id}</span>
                {meta ? <span className={styles.ligneMeta}>{meta}</span> : null}
              </span>

              <span className={styles.lignePrix}>{commande.prixAffiches[rang]}</span>
            </li>
          );
        })}
      </ul>

      <dl className={styles.totaux}>
        {commande.remiseAffichee ? (
          <div className={styles.totalLigne}>
            <dt>{traduire(langue, 'panier.remise')}</dt>
            <dd>−{commande.remiseAffichee}</dd>
          </div>
        ) : null}

        {/*
          « Livraison numérique — Offerte », mot pour mot du prototype. Ce n'est
          pas un ornement : le public visé achète surtout du livre papier, et
          voir qu'aucun frais de port ne s'ajoutera est ce que cette ligne dit.
        */}
        <div className={styles.totalLigne}>
          <dt>{traduire(langue, 'paiement.livraison')}</dt>
          <dd>{traduire(langue, 'paiement.livraisonOfferte')}</dd>
        </div>

        <div className={styles.totalFinal}>
          <dt>{traduire(langue, 'panier.total')}</dt>
          <dd className={styles.totalMontant}>{commande.montantAffiche}</dd>
        </div>
      </dl>

      {/*
        ┌────────────────────────────────────────────────────────────────────┐
        │ LE BOUTON EST HORS DU FORMULAIRE, ET IL LE SOUMET QUAND MÊME.     │
        │                                                                    │
        │ Le prototype pose le bouton de paiement dans la colonne de droite  │
        │ et les champs dans celle de gauche. L'attribut `form` d'HTML relie  │
        │ les deux sans une ligne de JavaScript : l'écran garde donc sa mise  │
        │ en page, et le règlement continue de marcher sans script — ce qui   │
        │ compte sur les connexions du §5.1.                                 │
        │                                                                    │
        │ LE MONTANT EST ÉCRIT SUR LE BOUTON. « Payer » seul oblige à         │
        │ remonter des yeux pour vérifier ce qu'on s'apprête à débiter, au    │
        │ moment précis où l'on hésite.                                       │
        └────────────────────────────────────────────────────────────────────┘
      */}
      {moyenChoisi ? (
        <button type="submit" form={FORMULAIRE} className={styles.payer}>
          {traduire(langue, 'paiement.payerMontant').replace(
            '{montant}',
            commande.montantAffiche,
          )}
        </button>
      ) : (
        <p className={styles.recapAttente}>{traduire(langue, 'paiement.choisirDabord')}</p>
      )}

      <p className={styles.recapMention}>{traduire(langue, 'paiement.livraisonImmediate')}</p>
    </aside>
  );
}

export function PaiementV3({
  langue,
  commande,
  moyen,
  base,
  emailDefaut,
  enDefaut,
  simule,
  reglerReussi,
  reglerEchoue,
  reglerAbandonne,
}: ProprietesPaiement): ReactNode {
  return (
    <main className={styles.page}>
      <FilAriane langue={langue} />

      {/*
        LE FIL D'ÉTAPES EST UN REPÈRE, JAMAIS UNE NAVIGATION.

        Aucune étape n'est un lien, pas même celles déjà franchies : revenir de
        « Paiement » vers « Récapitulatif » supposerait de dé-créer une commande
        écrite, qui a un identifiant et sur laquelle un webhook peut arriver.
      */}
      <ol className={styles.etapes}>
        {(
          [
            'tunnel.etapeRecapitulatif',
            'tunnel.etapePaiement',
            'tunnel.etapeConfirmation',
          ] as const
        ).map((cle, index) => {
          const rang = index + 1;
          const courante = rang === 2;
          const franchie = rang < 2;

          return (
            <li
              key={cle}
              className={courante ? `${styles.etape} ${styles.etapeCourante}` : styles.etape}
              aria-current={courante ? 'step' : undefined}
            >
              <span className={styles.etapeNumero} aria-hidden="true">
                {franchie ? '✓' : rang}
              </span>
              {traduire(langue, cle)}
              <span className="sr-only">
                {' — '}
                {traduire(
                  langue,
                  franchie
                    ? 'tunnel.etapeFranchie'
                    : courante
                      ? 'tunnel.etapeCourante'
                      : 'tunnel.etapeAVenir',
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <h1 className={styles.titre}>{traduire(langue, 'paiement.titreRegler')}</h1>

      {/*
        Le bandeau de simulation est en TÊTE, avant les deux colonnes : c'est la
        première chose que doit lire quelqu'un qui croit être en train de payer.
      */}
      {simule ? (
        <div className={styles.bandeau}>
          <BandeauSimulation langue={langue} />
        </div>
      ) : null}

      <div className={styles.colonnes}>
        <div className={styles.gauche}>
          {/* ── Le moyen de paiement ──────────────────────────────────────── */}
          <section className={styles.carte}>
            <h2 className={styles.carteTitre}>{traduire(langue, 'moyens.titre')}</h2>

            <ul className={styles.moyens}>
              {MOYENS_PAIEMENT.map((valeur) => {
                const nom = traduire(langue, `moyens.${valeur}` as CleTraduction);
                const retenu = valeur === moyen;

                return (
                  <li key={valeur}>
                    {/*
                      DES LIENS, ET NON DES BOUTONS RADIO RÉVÉLANT DES CHAMPS.

                      Les champs à remplir diffèrent d'un moyen à l'autre. Les
                      révéler par `:checked ~` obligerait à poser les trois
                      groupes dans le document, donc à envoyer au serveur les
                      champs des moyens NON choisis. Un lien qui recharge avec
                      `?moyen=` ne rend que les champs concernés et marche sans
                      JavaScript.
                    */}
                    <a
                      className={retenu ? `${styles.moyen} ${styles.moyenRetenu}` : styles.moyen}
                      href={`${base}?moyen=${valeur}`}
                      aria-current={retenu ? 'true' : undefined}
                    >
                      {/*
                        Le monogramme est tiré du LIBELLÉ, pas d'une table :
                        « Orange Money » donne OM, « Bank card » donne BC. Une
                        table écrite à la main aurait affiché « CB » sur le site
                        anglais, où ces deux lettres ne veulent rien dire. Il est
                        décoratif — le nom complet est juste à côté.
                      */}
                      <span className={styles.moyenSigle} aria-hidden="true">
                        {monogramme(nom)}
                      </span>

                      <span className={styles.moyenTexte}>
                        <span className={styles.moyenNom}>{nom}</span>
                        <span className={styles.moyenNote}>
                          {traduire(langue, `moyens.${valeur}Note` as CleTraduction)}
                        </span>
                      </span>

                      <span
                        className={retenu ? `${styles.pastille} ${styles.pastillePleine}` : styles.pastille}
                        aria-hidden="true"
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ── Les coordonnées ───────────────────────────────────────────── */}
          {moyen === null ? null : (
            <section className={styles.carte}>
              <form id={FORMULAIRE} action={reglerReussi}>
                {/* Le moyen voyage AVEC le formulaire : l'action doit savoir
                    quels champs exiger, et l'URL seule ne lui parvient pas. */}
                <input type="hidden" name="moyen" value={moyen} />

                <ChampsCoordonnees
                  langue={langue}
                  moyen={moyen}
                  emailDefaut={emailDefaut}
                  enDefaut={enDefaut}
                />
              </form>
            </section>
          )}

          {/* ── La bande de réassurance ───────────────────────────────────── */}
          <div className={styles.reassurance}>
            <Cadenas />
            <p className={styles.reassuranceTexte}>{traduire(langue, 'paiement.rassurance')}</p>
          </div>

          {/*
            ┌────────────────────────────────────────────────────────────────┐
            │ L'ÉCHEC ET L'ABANDON RESTENT ATTEIGNABLES, ET À L'ÉCART.      │
            │                                                                │
            │ Ne simuler que le succès laisserait sans écran les deux cas où │
            │ le client a le plus besoin d'être rassuré. Mêlés au bouton de  │
            │ paiement, ils se ressembleraient assez pour être pressés l'un  │
            │ pour l'autre : d'où la carte séparée, en bas de colonne.       │
            │                                                                │
            │ Ils n'exigent AUCUNE coordonnée — un abandon n'a pas à passer  │
            │ la validation d'un formulaire qu'on abandonne justement.       │
            └────────────────────────────────────────────────────────────────┘
          */}
          {simule && moyen !== null ? (
            <section className={`${styles.carte} ${styles.simulation}`}>
              <h2 className={styles.carteTitre}>{traduire(langue, 'simulation.titre')}</h2>
              <p className={styles.simulationCorps}>{traduire(langue, 'simulation.corps')}</p>

              <div className={styles.simulationBoutons}>
                <form action={reglerEchoue}>
                  <button type="submit" className={styles.boutonSecondaire}>
                    {traduire(langue, 'simulation.echouer')}
                  </button>
                </form>

                <form action={reglerAbandonne}>
                  <button type="submit" className={styles.boutonDiscret}>
                    {traduire(langue, 'simulation.abandonner')}
                  </button>
                </form>
              </div>
            </section>
          ) : null}
        </div>

        <Recapitulatif langue={langue} commande={commande} moyenChoisi={moyen !== null} />
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// L'ISSUE
// ═══════════════════════════════════════════════════════════════════════════

interface ProprietesIssue {
  langue: LangueInterface;
  commande: CommandeAffichee;
  /** Les trois statuts qui ne sont plus payables. `en_attente` n'arrive pas ici. */
  statut: 'paye' | 'echoue' | 'rembourse';
}

/**
 * L'écran d'issue — prototype, lignes 1456 à 1478.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE STATUT AFFICHÉ EST RELU EN BASE, JAMAIS DÉDUIT DE L'ACTION.          │
 * │                                                                          │
 * │ CLAUDE.md règle 5 : les webhooks sont la seule source de vérité sur      │
 * │ l'état d'un paiement, et une redirection de navigateur ne déclenche      │
 * │ jamais l'octroi d'un droit. Arriver ici après avoir cliqué « payer »     │
 * │ n'affiche donc pas « payé » : l'écran interroge la commande.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « VOS FICHIERS » NE PORTE PAS DE BOUTON DE TÉLÉCHARGEMENT.              │
 * │                                                                          │
 * │ Le prototype non plus : ses lignes portent « Lire ». Ce n'est pas une    │
 * │ coïncidence heureuse, c'est la règle métier centrale — la lecture et le  │
 * │ téléchargement sont deux droits, et le second se sert depuis la          │
 * │ bibliothèque, par le service qui vérifie les droits et signe l'URL.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function IssuePaiementV3({ langue, commande, statut }: ProprietesIssue): ReactNode {
  const payee = statut === 'paye';

  /*
   * Un titre par issue, et non « Paiement » pour les trois.
   *
   * Les quatre statuts de `order_status` sont couverts : `en_attente` est
   * traité avant d'arriver ici, restent `paye`, `echoue` et `rembourse`. Un
   * abandon laisse la commande en échec — le prestataire ne distingue pas les
   * deux, et l'interface non plus.
   */
  const titre = payee
    ? 'paiement.confirmationTitre'
    : statut === 'rembourse'
      ? 'paiement.rembourseeTitre'
      : 'paiement.echoueeTitre';

  const corps = payee
    ? 'paiement.payee'
    : statut === 'rembourse'
      ? 'paiement.remboursee'
      : 'paiement.echouee';

  return (
    <main className={styles.issue}>
      {/*
        Le sceau dit l'issue AVANT la phrase : c'est le seul élément de la page
        qui réponde, de l'autre bout de la pièce, à la question qu'on se pose
        en arrivant dessus. Un remboursement n'est pas un échec, mais ce n'est
        pas non plus une réussite : il prend le second dessin, faute d'un
        troisième qui voudrait dire quelque chose de plus.
      */}
      <SceauIssue issue={payee ? 'reussie' : 'echouee'} />

      <h1 className={styles.issueTitre}>{traduire(langue, titre)}</h1>

      <p className={styles.issueTexte}>{traduire(langue, corps)}</p>

      {payee && commande.lignes.length > 0 ? (
        <section className={styles.fichiers}>
          <h2 className={styles.fichiersTitre}>{traduire(langue, 'paiement.fichiersTitre')}</h2>

          <ul className={styles.lignes}>
            {commande.lignes.map((ligne) => (
              <li className={styles.fichier} key={`${ligne.livre_id}:${ligne.langue}`}>
                {ligne.couverture ? (
                  <img
                    className={styles.fichierVignette}
                    src={ligne.couverture}
                    alt=""
                    width={44}
                    height={62}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className={styles.fichierVignetteVide} aria-hidden="true" />
                )}

                <span className={styles.fichierTitre}>{ligne.titre ?? ligne.livre_id}</span>

                {/*
                  Un titre dont le slug manque n'a plus de fiche : le lien
                  mènerait à un 404. On garde la ligne — elle est payée — et on
                  retire le bouton, plutôt que de promettre une page absente.
                */}
                {ligne.slug ? (
                  <a className={styles.fichierLire} href={`/${langue}/lire/${ligne.slug}`}>
                    {traduire(langue, 'paiement.lire')}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <dl className={styles.issueRecap}>
        <div className={styles.totalLigne}>
          <dt>{traduire(langue, 'paiement.commande')}</dt>
          <dd className={styles.issueReference}>{commande.id}</dd>
        </div>
        <div className={styles.totalLigne}>
          <dt>{traduire(langue, 'paiement.montant')}</dt>
          <dd>{commande.montantAffiche}</dd>
        </div>
      </dl>

      <div className={styles.issueActions}>
        {payee ? (
          <>
            <a className={styles.boutonPrimaire} href={`/${langue}/compte/bibliotheque`}>
              {traduire(langue, 'paiement.versBibliotheque')}
            </a>
            <a className={styles.boutonContour} href={`/${langue}/contes`}>
              {traduire(langue, 'paiement.continuer')}
            </a>
          </>
        ) : (
          <>
            <a className={styles.boutonPrimaire} href={`/${langue}/panier`}>
              {traduire(langue, 'paiement.versPanier')}
            </a>
            <a className={styles.boutonContour} href={`/${langue}`}>
              {traduire(langue, 'paiement.retourAccueil')}
            </a>
          </>
        )}
      </div>
    </main>
  );
}
