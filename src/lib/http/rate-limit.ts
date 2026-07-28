import type { Clock } from '@/lib/clock/clock';
import { getClock } from '@/lib/clock';

/**
 * Limitation de débit à fenêtre glissante.
 *
 * §5.2 exige une limitation du nombre de tentatives de connexion. Le même
 * mécanisme servira à la lecture anonyme des contes gratuits (étape 6) puis à
 * la limitation globale (étape 16).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LIMITE CONNUE : le compteur vit en mémoire, dans un seul processus.      │
 * │ Il freine une attaque naïve, pas une attaque distribuée, et il ne tient  │
 * │ pas sur plusieurs instances. Le remplacer par un magasin partagé         │
 * │ (Postgres ou Redis) est une tâche identifiée de l'étape 16.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'horloge est injectée : les tests font expirer une fenêtre en la déplaçant,
 * jamais en attendant.
 */
export interface RateLimitDecision {
  autorise: boolean;
  /** Tentatives encore disponibles dans la fenêtre courante. */
  restant: number;
  /** Secondes à attendre avant la prochaine tentative, si refusé. */
  retryAfter: number;
}

export interface RateLimitOptions {
  /** Nombre de tentatives autorisées par fenêtre. */
  limite: number;
  /** Durée de la fenêtre, en millisecondes. */
  fenetreMs: number;
}

export class RateLimiter {
  readonly #tentatives = new Map<string, number[]>();
  readonly #clock: Clock;

  constructor(clock: Clock = getClock()) {
    this.#clock = clock;
  }

  /**
   * Enregistre une tentative et indique si elle est autorisée.
   *
   * La tentative refusée n'est PAS comptée : sinon un attaquant qui insiste
   * prolongerait indéfiniment son propre blocage, et un utilisateur légitime
   * derrière la même adresse serait puni pour lui.
   */
  consommer(cle: string, options: RateLimitOptions): RateLimitDecision {
    const maintenant = this.#clock.now().getTime();
    const debutFenetre = maintenant - options.fenetreMs;

    const horodatages = (this.#tentatives.get(cle) ?? []).filter((t) => t > debutFenetre);

    if (horodatages.length >= options.limite) {
      const plusAncien = horodatages[0] ?? maintenant;
      const attente = Math.ceil((plusAncien + options.fenetreMs - maintenant) / 1000);
      this.#tentatives.set(cle, horodatages);
      return { autorise: false, restant: 0, retryAfter: Math.max(attente, 1) };
    }

    horodatages.push(maintenant);
    this.#tentatives.set(cle, horodatages);
    return {
      autorise: true,
      restant: options.limite - horodatages.length,
      retryAfter: 0,
    };
  }

  /** Efface le compteur d'une clé — après une connexion réussie, par exemple. */
  reinitialiser(cle: string): void {
    this.#tentatives.delete(cle);
  }

  /** Réservé aux tests. */
  vider(): void {
    this.#tentatives.clear();
  }
}

/**
 * Limiteur des tentatives de connexion (§5.2).
 *
 * Cinq essais par quart d'heure et par couple adresse IP / adresse email.
 * Clé combinée délibérément : par IP seule, un réseau partagé bloquerait des
 * innocents ; par email seul, n'importe qui pourrait verrouiller le compte
 * d'autrui à volonté.
 */
export const loginRateLimiter = new RateLimiter();

export const LOGIN_RATE_LIMIT: RateLimitOptions = {
  limite: 5,
  fenetreMs: 15 * 60 * 1000,
};

/**
 * Adresse IP de l'appelant.
 *
 * Derrière un proxy, `x-forwarded-for` porte la chaîne des relais ; la
 * première entrée est le client d'origine. En l'absence d'en-tête, on retombe
 * sur une valeur constante : la limitation s'appliquera alors globalement, ce
 * qui est le comportement prudent.
 */
export function adresseAppelant(request: Request): string {
  const transmise = request.headers.get('x-forwarded-for');
  if (transmise) {
    const premiere = transmise.split(',')[0]?.trim();
    if (premiere) return premiere;
  }
  return request.headers.get('x-real-ip') ?? 'inconnue';
}
