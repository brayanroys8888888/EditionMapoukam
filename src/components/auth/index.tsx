import type { ReactNode } from 'react';

import { messageErreur, traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { Bouton, Champ } from '@/components/base';
import styles from './auth.module.css';

export { FormulaireInscription, ForceMotDePasse } from './inscription';

/**
 * FORMULAIRES D'AUTHENTIFICATION — §4.2 F5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES COMPOSANTS NE DÉCIDENT RIEN. ILS AFFICHENT.                         │
 * │                                                                          │
 * │ Aucun d'eux n'appelle l'API : ils reçoivent leur état — code d'erreur,   │
 * │ délai d'attente, message — et rendent. C'est ce qui permet aux tests de  │
 * │ comparer OCTET PAR OCTET le rendu de deux situations que le backend      │
 * │ rend délibérément indistinguables, ce qu'une relecture ne prouverait     │
 * │ jamais.                                                                  │
 * │                                                                          │
 * │ La soumission passe par `action`, une Server Action. Le formulaire       │
 * │ fonctionne donc SANS JAVASCRIPT — condition posée par l'arbitrage Q3, et │
 * │ non un détail : §5.1 décrit une partie du public sur connexion lente.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Ce qu'un formulaire accepte comme cible de soumission. */
export type ActionFormulaire = string | ((donnees: FormData) => void | Promise<void>);

/**
 * `noValidate` sur chaque formulaire — un choix, pas un oubli.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VALIDATION NATIVE DU NAVIGATEUR SERAIT UNE SECONDE AUTORITÉ.         │
 * │                                                                          │
 * │ `type="email"` fait appliquer au navigateur SA définition d'une adresse  │
 * │ valide, qui n'est pas celle de nos schémas Zod. Les cas où les deux      │
 * │ divergent sont exactement ceux qu'on ne voit jamais en développant :     │
 * │ une adresse acceptée par le serveur et refusée par le navigateur ne      │
 * │ produit aucune requête, donc aucune trace, et l'utilisateur reste        │
 * │ bloqué devant un message que nous n'avons pas écrit.                     │
 * │                                                                          │
 * │ Les schémas de `src/lib/auth/schemas.ts` restent donc la seule autorité, │
 * │ et leurs messages sont traduits. Le coût est un aller-retour sur un      │
 * │ champ vide ; le prix de l'autre choix serait une divergence invisible.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface EtatFormulaire {
  langue: LangueInterface;
  action: ActionFormulaire;
  /** Code d'erreur rendu par l'API, jamais son message — voir `messageErreur`. */
  erreur?: string;
  /** Secondes restantes avant une nouvelle tentative, sur un refus 429. */
  attente?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCS PARTAGÉS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Erreur d'un formulaire, et le cas échéant le délai avant nouvelle tentative.
 *
 * `attente` prend le pas sur `erreur` : sur un 429, le code seul dirait
 * « trop de tentatives » sans dire combien de temps, ce qui pousse à
 * réessayer aussitôt et à prolonger le blocage.
 */
function ErreurFormulaire({
  langue,
  erreur,
  attente,
}: {
  langue: LangueInterface;
  erreur?: string;
  attente?: number;
}): ReactNode {
  if (!erreur) return null;

  const texte =
    attente !== undefined && attente > 0
      ? traduire(langue, 'auth.attendre').replace('{secondes}', String(attente))
      : messageErreur(langue, erreur);

  return (
    <p className={styles.erreurFormulaire} role="alert">
      {texte}
    </p>
  );
}

/**
 * Message d'issue — inscription enregistrée, code envoyé, adresse confirmée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TEXTE VIENT DU DICTIONNAIRE, JAMAIS DU `message` DE L'API.           │
 * │                                                                          │
 * │ L'API rédige ses messages en français uniquement. Les afficher tels      │
 * │ quels rendrait l'anglais impossible — et surtout, ferait dépendre d'une  │
 * │ chaîne serveur trois messages dont l'INDIFFÉRENCIATION est le critère    │
 * │ principal de cette étape.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function MessageAuth({
  langue,
  cle,
  suite,
}: {
  langue: LangueInterface;
  cle: CleTraduction;
  suite?: ReactNode;
}): ReactNode {
  return (
    <div className={styles.message}>
      <p className={styles.messageTexte}>{traduire(langue, cle)}</p>
      {suite}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNEXION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Connexion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCHEC NE DIT JAMAIS LEQUEL DES DEUX CHAMPS EST FAUX.                  │
 * │                                                                          │
 * │ Le backend rend un seul code — `identifiants_invalides` — pour une       │
 * │ adresse inconnue comme pour un mot de passe faux. L'interface ne doit    │
 * │ pas défaire cela en marquant l'un des deux champs : « mot de passe       │
 * │ incorrect » signifierait « cette adresse a un compte », et la plateforme │
 * │ deviendrait énumérable une adresse à la fois.                            │
 * │                                                                          │
 * │ L'erreur est donc au niveau du FORMULAIRE, jamais du champ. Un test      │
 * │ compare les deux rendus.                                                 │
 * │                                                                          │
 * │ `email_non_verifie` est la SEULE exception, et elle ne révèle rien que   │
 * │ l'utilisateur ne sache déjà : il vient de créer ce compte.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function FormulaireConnexion({
  langue,
  action,
  erreur,
  attente,
  motif,
  actionRenvoi,
}: EtatFormulaire & {
  /** Motif porté par le middleware — `session_revoquee` après un vol de jeton. */
  motif?: string;
  /** Cible du renvoi d'un code de vérification, sur `email_non_verifie`. */
  actionRenvoi?: ActionFormulaire;
}): ReactNode {
  const bloque = attente !== undefined && attente > 0;

  return (
    <div className={styles.panneau}>
      <h1 className={styles.titre}>{traduire(langue, 'auth.connexionTitre')}</h1>

      {/* Le motif de révocation est distinct d'une erreur de saisie : il
          n'appelle pas à corriger un champ, mais à changer son mot de passe. */}
      {motif ? (
        <p className={styles.avertissement} role="alert">
          {messageErreur(langue, motif)}
        </p>
      ) : null}

      <ErreurFormulaire langue={langue} erreur={erreur} attente={attente} />

      <form action={action} className={styles.formulaire} noValidate>
        <Champ
          id="connexion-email"
          name="email"
          type="email"
          libelle={traduire(langue, 'auth.email')}
          autoComplete="email"
          required
        />
        <Champ
          id="connexion-motdepasse"
          name="password"
          type="password"
          libelle={traduire(langue, 'auth.motDePasse')}
          autoComplete="current-password"
          required
        />

        <Bouton type="submit" disabled={bloque}>
          {traduire(langue, 'auth.connexionSoumettre')}
        </Bouton>
      </form>

      {/* Proposé UNIQUEMENT sur `email_non_verifie` : ailleurs, ce bouton
          confirmerait l'existence du compte à qui essaie une adresse au hasard. */}
      {erreur === 'email_non_verifie' && actionRenvoi ? (
        <form action={actionRenvoi} className={styles.formulaireSecondaire}>
          <Bouton type="submit" variante="secondaire">
            {traduire(langue, 'auth.emailNonVerifieAction')}
          </Bouton>
        </form>
      ) : null}

      <nav className={styles.liens} aria-label={traduire(langue, 'auth.connexionTitre')}>
        <a href={`/${langue}/mot-de-passe-oublie`}>{traduire(langue, 'auth.motDePasseOublie')}</a>
        <span className={styles.lienSecondaire}>
          {traduire(langue, 'auth.pasDeCompte')}{' '}
          <a href={`/${langue}/inscription`}>{traduire(langue, 'auth.creerUnCompte')}</a>
        </span>
      </nav>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DEMANDE DE RÉINITIALISATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mot de passe oublié.
 *
 * Ce formulaire n'a pas d'état d'échec « adresse inconnue », et n'en aura
 * jamais : le backend répond 204 dans tous les cas, et l'écran affiche
 * `auth.oubliEnvoye` sans condition.
 */
export function FormulaireOubli({ langue, action, erreur, attente }: EtatFormulaire): ReactNode {
  const bloque = attente !== undefined && attente > 0;

  return (
    <div className={styles.panneau}>
      <h1 className={styles.titre}>{traduire(langue, 'auth.oubliTitre')}</h1>
      <p className={styles.intro}>{traduire(langue, 'auth.oubliIntro')}</p>

      <ErreurFormulaire langue={langue} erreur={erreur} attente={attente} />

      <form action={action} className={styles.formulaire} noValidate>
        <Champ
          id="oubli-email"
          name="email"
          type="email"
          libelle={traduire(langue, 'auth.email')}
          autoComplete="email"
          required
        />
        <Bouton type="submit" disabled={bloque}>
          {traduire(langue, 'auth.oubliSoumettre')}
        </Bouton>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SAISIE DU CODE À USAGE UNIQUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Saisie du code reçu par email.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UN CODE SAISI PLUTÔT QU'UN LIEN CLIQUÉ.                        │
 * │                                                                          │
 * │ Les jetons d'un lien Supabase vivent dans le FRAGMENT de l'URL, qui      │
 * │ n'est jamais transmis au serveur : les exploiter exigerait du JavaScript │
 * │ de page pour les lire et les renvoyer. Un code saisi tient dans un       │
 * │ formulaire rendu côté serveur — rien à exécuter, rien dans l'historique. │
 * │ Arbitrage Q3 de docs/API-CONTRAT.md, tranché le 3 août 2026.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `autoComplete="one-time-code"` : sur mobile, le système propose le code
 * directement depuis la notification, sans passer par l'application de
 * messagerie. C'est ce qui rend la saisie acceptable.
 */
export function FormulaireCode({
  langue,
  action,
  erreur,
  attente,
  titre,
  intro,
  soumettre,
  email,
  avecMotDePasse = false,
}: EtatFormulaire & {
  titre: CleTraduction;
  intro: CleTraduction;
  soumettre: CleTraduction;
  /** Adresse déjà connue : reportée en lecture seule plutôt que redemandée. */
  email?: string;
  /** Ajoute le choix du nouveau mot de passe — écran de réinitialisation. */
  avecMotDePasse?: boolean;
}): ReactNode {
  const bloque = attente !== undefined && attente > 0;

  return (
    <div className={styles.panneau}>
      <h1 className={styles.titre}>{traduire(langue, titre)}</h1>
      <p className={styles.intro}>{traduire(langue, intro)}</p>

      <ErreurFormulaire langue={langue} erreur={erreur} attente={attente} />

      <form action={action} className={styles.formulaire} noValidate>
        <Champ
          id="code-email"
          name="email"
          type="email"
          libelle={traduire(langue, 'auth.email')}
          autoComplete="email"
          defaultValue={email}
          required
        />
        <Champ
          id="code-valeur"
          name="code"
          // `text` et non `number` : un `number` retire les zéros de tête et
          // affiche des flèches d'incrément qui n'ont aucun sens sur un code.
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          libelle={traduire(langue, 'auth.code')}
          aide={traduire(langue, 'auth.codeAide')}
          autoComplete="one-time-code"
          required
        />

        {avecMotDePasse ? (
          <Champ
            id="code-motdepasse"
            name="password"
            type="password"
            libelle={traduire(langue, 'auth.nouveauMotDePasse')}
            autoComplete="new-password"
            required
          />
        ) : null}

        <Bouton type="submit" disabled={bloque}>
          {traduire(langue, soumettre)}
        </Bouton>
      </form>
    </div>
  );
}
