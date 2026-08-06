import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import {
  MOYENS_PAIEMENT,
  exigeTelephone,
  paysDeLOperateur,
  type MoyenPaiement,
} from '@/domain/payments/moyens';
import styles from './tunnel.module.css';

/**
 * PIÈCES COMMUNES AUX DEUX TUNNELS — achat et abonnement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ÉCRITES UNE FOIS PARCE QUE LES DEUX TUNNELS DOIVENT SE RESSEMBLER.      │
 * │                                                                          │
 * │ Un acheteur qui s'abonne ensuite retrouve le même fil d'étapes, les      │
 * │ mêmes cartes de moyen de paiement, le même bandeau de simulation. Deux   │
 * │ implémentations auraient divergé au premier ajustement — et c'est        │
 * │ l'écran du paiement, celui où l'on est le plus inquiet, qui aurait porté │
 * │ la différence.                                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN MONTANT N'EST CALCULÉ ICI, ET AUCUN N'EST FORMATÉ ICI.            │
 * │                                                                          │
 * │ Ces composants reçoivent des chaînes déjà mises en forme par le serveur. │
 * │ Le franc CFA n'a pas de sous-unité : une division par cent écrite dans   │
 * │ un composant multiplierait l'erreur par cent sur une zone entière, et un │
 * │ test d'architecture échoue sur le motif.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════════════════════════
// FIL D'ÉTAPES
// ═══════════════════════════════════════════════════════════════════════════

export type ParcoursTunnel = 'achat' | 'abonnement';

const ETAPES: Record<ParcoursTunnel, readonly CleTraduction[]> = {
  achat: [
    'tunnel.etapePanier',
    'tunnel.etapeRecapitulatif',
    'tunnel.etapePaiement',
    'tunnel.etapeConfirmation',
  ],
  abonnement: ['tunnel.etapeFormule', 'tunnel.etapePaiement', 'tunnel.etapeConfirmation'],
};

/**
 * Le fil d'étapes — un REPÈRE, jamais une navigation.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE ÉTAPE N'EST UN LIEN, PAS MÊME CELLES DÉJÀ FRANCHIES.            │
 * │                                                                          │
 * │ Revenir en arrière depuis « Paiement » vers « Récapitulatif » supposerait │
 * │ de dé-créer une commande, ce qui n'existe pas : elle est écrite, elle a  │
 * │ un identifiant, et un webhook peut arriver dessus à tout instant. Chaque │
 * │ écran offre le retour qui a du sens pour LUI — « Modifier mon panier »,  │
 * │ « Changer de moyen de paiement » — et ce fil ne fait que situer.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'état de chaque étape est annoncé en toutes lettres aux lecteurs d'écran :
 * une pastille verte et un trait gris ne disent rien à qui ne voit pas l'écran,
 * et `aria-current` seul ne distingue pas le franchi de l'à-venir.
 */
export function FilEtapes({
  langue,
  parcours,
  etape,
}: {
  langue: LangueInterface;
  parcours: ParcoursTunnel;
  /** Rang de l'étape en cours, à partir de 1. */
  etape: number;
}): ReactNode {
  const etapes = ETAPES[parcours];

  return (
    <nav
      className={styles.fil}
      aria-label={traduire(
        langue,
        parcours === 'achat' ? 'tunnel.progressionAchat' : 'tunnel.progressionAbonnement',
      )}
    >
      <p className={styles.filCompte}>
        {traduire(langue, 'tunnel.etapeNumero')
          .replace('{n}', String(etape))
          .replace('{total}', String(etapes.length))}
      </p>

      <ol className={styles.filListe}>
        {etapes.map((cle, index) => {
          const rang = index + 1;
          const franchie = rang < etape;
          const courante = rang === etape;

          const etat = franchie
            ? 'tunnel.etapeFranchie'
            : courante
              ? 'tunnel.etapeCourante'
              : 'tunnel.etapeAVenir';

          return (
            <li
              key={cle}
              className={`${styles.filEtape} ${
                franchie ? styles.filFranchie : courante ? styles.filCourante : styles.filAVenir
              }`}
              aria-current={courante ? 'step' : undefined}
            >
              <span className={styles.filPastille} aria-hidden="true">
                {franchie ? '✓' : rang}
              </span>
              <span className={styles.filNom}>{traduire(langue, cle)}</span>
              <span className="sr-only"> — {traduire(langue, etat)}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BANDEAU DE SIMULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La mention de simulation, en tête et sans ambiguïté.
 *
 * Ce n'est pas une note de bas de page : c'est la première chose que lit
 * quelqu'un qui croit être en train de payer. En crème plutôt qu'en rouge —
 * rien n'a échoué, il s'agit de dire ce qui se passe réellement.
 */
export function BandeauSimulation({ langue }: { langue: LangueInterface }): ReactNode {
  return (
    <section className={styles.bandeau}>
      <h2 className={styles.bandeauTitre}>{traduire(langue, 'simulation.banniereTitre')}</h2>
      <p className={styles.bandeauCorps}>{traduire(langue, 'simulation.banniereCorps')}</p>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHOIX DU MOYEN DE PAIEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Les trois moyens, en cartes-liens.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DES LIENS, ET NON DES BOUTONS RADIO RÉVÉLANT DES CHAMPS EN CSS.        │
 * │                                                                          │
 * │ Les champs à remplir diffèrent d'un moyen à l'autre : le Mobile Money    │
 * │ demande un pays et un numéro, la carte ni l'un ni l'autre. Les révéler   │
 * │ par `:checked ~` obligerait à poser les trois groupes de champs dans le  │
 * │ document, donc à envoyer au serveur les champs des moyens NON choisis —  │
 * │ et à les ignorer, ce que la validation devrait savoir faire.             │
 * │                                                                          │
 * │ Un lien qui recharge l'écran avec `?moyen=` ne rend que les champs       │
 * │ concernés, marche sans JavaScript, et coûte une requête — sur la         │
 * │ connexion lente de §5.1, une requête vaut mieux qu'un formulaire trois   │
 * │ fois trop gros.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ChoixMoyens({
  langue,
  lienDuMoyen,
}: {
  langue: LangueInterface;
  /** Adresse de l'écran, pour un moyen donné. */
  lienDuMoyen: (moyen: MoyenPaiement) => string;
}): ReactNode {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitre}>{traduire(langue, 'moyens.titre')}</h2>
      <p className={styles.sectionIntro}>{traduire(langue, 'moyens.intro')}</p>

      <ul className={styles.moyens}>
        {MOYENS_PAIEMENT.map((moyen) => (
          <li key={moyen} className={styles.moyen}>
            <a className={styles.moyenLien} href={lienDuMoyen(moyen)}>
              <span className={styles.moyenNom}>
                {traduire(langue, `moyens.${moyen}` as CleTraduction)}
              </span>
              <span className={styles.moyenNote}>
                {traduire(langue, `moyens.${moyen}Note` as CleTraduction)}
              </span>
              <span className={styles.moyenChoisir} aria-hidden="true">
                {traduire(langue, 'moyens.choisir')}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COORDONNÉES
// ═══════════════════════════════════════════════════════════════════════════

/** Champs en défaut, par nom, tels que l'action serveur les rapporte. */
export type ErreursCoordonnees = readonly string[];

/**
 * Les champs qu'exige le moyen choisi, et rien de plus.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST SAISI ICI N'EST ENREGISTRÉ NULLE PART.                      │
 * │                                                                          │
 * │ Aucune table du projet ne porte de numéro de téléphone, et c'est voulu :  │
 * │ chez un opérateur de Mobile Money, le numéro part vers son API et n'a     │
 * │ aucune raison de rester chez le marchand. L'écran le DIT plutôt que de    │
 * │ le laisser supposer — c'est la contrepartie honnête d'un formulaire qui   │
 * │ demande un numéro personnel.                                             │
 * │                                                                          │
 * │ La règle 7 de CLAUDE.md est rappelée au même endroit : aucune donnée      │
 * │ d'enfant n'est collectée, et le compte appartient au parent adulte.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ChampsCoordonnees({
  langue,
  moyen,
  emailDefaut,
  enDefaut = [],
}: {
  langue: LangueInterface;
  moyen: MoyenPaiement;
  /** L'adresse du compte, préremplie : elle est déjà connue du serveur. */
  emailDefaut: string;
  enDefaut?: ErreursCoordonnees;
}): ReactNode {
  const pays = paysDeLOperateur(moyen);
  const faute = (champ: string): boolean => enDefaut.includes(champ);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitre}>{traduire(langue, 'coordonnees.titre')}</h2>

      {/*
        LA CARTE NE SE SAISIT PAS ICI, ET L'ÉCRAN EXPLIQUE POURQUOI.

        « Vous serez redirigé » sans raison se lit comme une gêne. Dire que
        c'est ce qui empêche le numéro de fuir d'ici en fait un argument — et
        c'est exactement ce que fera l'intégration réelle, dont les champs sont
        hébergés chez le prestataire.
      */}
      {exigeTelephone(moyen) ? null : (
        <div className={styles.encart}>
          <p className={styles.encartTitre}>
            {traduire(langue, 'coordonnees.carteHebergeeTitre')}
          </p>
          <p className={styles.encartCorps}>
            {traduire(langue, 'coordonnees.carteHebergeeCorps')}
          </p>
        </div>
      )}

      <div className={styles.champ}>
        <label className={styles.libelle} htmlFor="coordonnees-nom">
          {traduire(langue, 'coordonnees.nom')}
        </label>
        <input
          className={faute('nom') ? `${styles.saisie} ${styles.saisieInvalide}` : styles.saisie}
          id="coordonnees-nom"
          name="nom"
          autoComplete="name"
          required
          maxLength={120}
          aria-describedby="coordonnees-nom-aide"
          aria-invalid={faute('nom') ? true : undefined}
        />
        <p className={styles.aide} id="coordonnees-nom-aide">
          {traduire(langue, 'coordonnees.nomAide')}
        </p>
        {faute('nom') ? (
          <p className={styles.erreur} role="alert">
            {traduire(langue, 'coordonnees.erreur_nom')}
          </p>
        ) : null}
      </div>

      <div className={styles.champ}>
        <label className={styles.libelle} htmlFor="coordonnees-email">
          {traduire(langue, 'coordonnees.email')}
        </label>
        <input
          className={faute('email') ? `${styles.saisie} ${styles.saisieInvalide}` : styles.saisie}
          id="coordonnees-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={200}
          defaultValue={emailDefaut}
          aria-describedby="coordonnees-email-aide"
          aria-invalid={faute('email') ? true : undefined}
        />
        <p className={styles.aide} id="coordonnees-email-aide">
          {traduire(langue, 'coordonnees.emailAide')}
        </p>
        {faute('email') ? (
          <p className={styles.erreur} role="alert">
            {traduire(langue, 'coordonnees.erreur_email')}
          </p>
        ) : null}
      </div>

      {/*
        Pays et numéro ne paraissent QUE pour le Mobile Money, et le prédicat
        qui le décide vit dans le domaine : un troisième opérateur s'ajoutera
        sans qu'aucune ligne de cet écran ne bouge.
      */}
      {exigeTelephone(moyen) ? (
        <>
          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="coordonnees-pays">
              {traduire(langue, 'coordonnees.pays')}
            </label>
            <select
              className={
                faute('pays') ? `${styles.saisie} ${styles.saisieInvalide}` : styles.saisie
              }
              id="coordonnees-pays"
              name="pays"
              required
              defaultValue=""
              aria-invalid={faute('pays') ? true : undefined}
            >
              <option value="" disabled>
                {traduire(langue, 'coordonnees.paysChoisir')}
              </option>
              {pays.map((code) => (
                <option key={code} value={code}>
                  {traduire(langue, `pays.${code}` as CleTraduction)}
                </option>
              ))}
            </select>
            {faute('pays') ? (
              <p className={styles.erreur} role="alert">
                {traduire(langue, 'coordonnees.erreur_pays')}
              </p>
            ) : null}
          </div>

          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="coordonnees-telephone">
              {traduire(langue, 'coordonnees.telephone')}
            </label>
            <input
              className={
                faute('telephone') ? `${styles.saisie} ${styles.saisieInvalide}` : styles.saisie
              }
              id="coordonnees-telephone"
              name="telephone"
              type="tel"
              autoComplete="tel"
              required
              maxLength={30}
              aria-describedby="coordonnees-telephone-aide"
              aria-invalid={faute('telephone') ? true : undefined}
            />
            <p className={styles.aide} id="coordonnees-telephone-aide">
              {traduire(langue, 'coordonnees.telephoneAide')}
            </p>
            {faute('telephone') ? (
              <p className={styles.erreur} role="alert">
                {traduire(langue, 'coordonnees.erreur_telephone')}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      <p className={styles.mention}>{traduire(langue, 'coordonnees.rienConserve')}</p>
      <p className={styles.mention}>{traduire(langue, 'coordonnees.aucuneDonneeEnfant')}</p>
    </section>
  );
}

export { styles as stylesTunnel };
