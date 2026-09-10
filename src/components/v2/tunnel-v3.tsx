import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';

import styles from './paiement-v3.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LA COQUILLE DU TUNNEL, SOUS ORGANIC.                                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI ELLE EXISTE : LE TUNNEL CHANGEAIT DE PEAU EN COURS DE ROUTE.   │
 * │                                                                          │
 * │ Seul l'écran de règlement avait été redessiné. Le panier et le           │
 * │ récapitulatif — les deux étapes qui le précèdent — rendaient encore la   │
 * │ mise en page d'origine, et la souscription d'abonnement aussi. On        │
 * │ partait donc d'une boutique Organic, on traversait deux écrans d'une     │
 * │ autre direction, puis on retombait dans Organic au moment de payer.      │
 * │                                                                          │
 * │ C'est le pire endroit où faire ça. Un tunnel d'achat se juge à sa        │
 * │ continuité : un changement d'apparence entre le panier et le paiement    │
 * │ ressemble à une redirection vers un autre site, et c'est exactement      │
 * │ l'inquiétude qu'on ne veut pas provoquer au moment de saisir une carte.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE NE DESSINE RIEN DE NEUF, ET C'EST VOULU.                           │
 * │                                                                          │
 * │ Tout vient de `paiement-v3.module.css`, la feuille de l'écran de         │
 * │ règlement. Écrire une seconde feuille pour le panier aurait donné deux   │
 * │ chartes qui se ressemblent le premier jour — le défaut même qu'on est    │
 * │ en train de corriger.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FIL D'ÉTAPES EST UN REPÈRE, JAMAIS UNE NAVIGATION.                   │
 * │                                                                          │
 * │ Aucune étape n'est un lien, pas même celles déjà franchies : revenir de  │
 * │ « Paiement » vers « Récapitulatif » supposerait de dé-créer une commande │
 * │ écrite, qui a un identifiant et sur laquelle un webhook peut arriver.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export type ParcoursTunnel = 'achat' | 'abonnement';

/** Les mêmes clés que `FilEtapes`, pour que les deux directions comptent pareil. */
const ETAPES: Record<ParcoursTunnel, readonly CleTraduction[]> = {
  achat: ['tunnel.etapeRecapitulatif', 'tunnel.etapePaiement', 'tunnel.etapeConfirmation'],
  abonnement: ['tunnel.etapeFormule', 'tunnel.etapePaiement', 'tunnel.etapeConfirmation'],
};

/**
 * Le fil d'Ariane du prototype.
 *
 * Il remonte au RAYON, jamais au catalogue complet : on entre dans un tunnel
 * depuis une boutique, et c'est là qu'on veut pouvoir revenir.
 */
function FilAriane({
  langue,
  courant,
}: {
  langue: LangueInterface;
  courant: string;
}): ReactNode {
  return (
    <nav className={styles.ariane} aria-label={traduire(langue, 'navigation.principal')}>
      <a className={styles.arianeLien} href={`/${langue}/contes`}>
        {traduire(langue, 'navigation.catalogue')}
      </a>
      <span aria-hidden="true">/</span>
      <span className={styles.arianeCourant}>{courant}</span>
    </nav>
  );
}

export function FilEtapesV3({
  langue,
  parcours,
  etape,
}: {
  langue: LangueInterface;
  parcours: ParcoursTunnel;
  etape: number;
}): ReactNode {
  const etapes = ETAPES[parcours];

  return (
    <ol className={styles.etapes}>
      {etapes.map((cle, index) => {
        const rang = index + 1;
        const courante = rang === etape;
        const franchie = rang < etape;

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
            {/*
              L'état de chaque étape est ÉCRIT pour un lecteur d'écran : la
              coche et la pastille colorée ne disent rien à qui ne voit pas.
            */}
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
  );
}

export function CoquilleTunnelV3({
  langue,
  parcours,
  etape,
  titre,
  ariane,
  alerte,
  enfants,
  colonne,
}: {
  langue: LangueInterface;
  parcours: ParcoursTunnel;
  etape: number;
  titre: string;
  /** Le libellé courant du fil d'Ariane. Le titre de l'écran, le plus souvent. */
  ariane?: string;
  /** Message d'erreur, au-dessus du contenu — il doit se lire avant le reste. */
  alerte?: string | null;
  enfants: ReactNode;
  /** La colonne de droite. Absente, le contenu occupe toute la largeur. */
  colonne?: ReactNode;
}): ReactNode {
  return (
    <main className={styles.page}>
      <FilAriane langue={langue} courant={ariane ?? titre} />

      <FilEtapesV3 langue={langue} parcours={parcours} etape={etape} />

      <h1 className={styles.titre}>{titre}</h1>

      {alerte ? (
        <div className={styles.bandeau} role="alert">
          {alerte}
        </div>
      ) : null}

      {colonne ? (
        <div className={styles.colonnes}>
          <div className={styles.gauche}>{enfants}</div>
          {colonne}
        </div>
      ) : (
        <div className={styles.gauche}>{enfants}</div>
      )}
    </main>
  );
}

/** Un panneau du tunnel : le cadre crème à coins arrondis du prototype. */
export function CarteTunnelV3({
  titre,
  enfants,
}: {
  titre?: string;
  enfants: ReactNode;
}): ReactNode {
  return (
    <section className={styles.carte}>
      {titre ? <h2 className={styles.carteTitre}>{titre}</h2> : null}
      {enfants}
    </section>
  );
}

export { styles as stylesTunnelV3 };
