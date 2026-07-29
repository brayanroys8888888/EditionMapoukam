/**
 * Manipulation des montants monétaires.
 *
 * docs/PLAN.md D4 point 3 : toutes les devises n'ont pas deux décimales. Le
 * franc CFA (XAF, XOF) n'a pas de sous-unité. Écrire `montant / 100` afficherait
 * « 15,00 FCFA » là où il faut lire « 1 500 FCFA ».
 *
 * Une règle ESLint interdit `/ 100` et `* 100` dans tout le dépôt. Ce module
 * est le seul endroit autorisé à convertir, et il le fait à partir du nombre de
 * décimales déclaré par la table `currencies`, jamais d'une constante.
 *
 * Il vit dans `src/domain` et non `src/lib` : le nombre de décimales d'une
 * devise est une RÈGLE MÉTIER, pas un utilitaire technique. C'est elle qui
 * décide si 1500 XAF vaut mille cinq cents francs ou quinze.
 *
 * Les montants circulent partout ailleurs dans la PLUS PETITE UNITÉ de leur
 * devise, en entier. Aucun flottant ne traverse la base ni la logique métier.
 */

export interface Currency {
  /** Code ISO 4217 : EUR, XAF, XOF. */
  readonly code: string;
  /** Nombre de décimales de la sous-unité. EUR = 2, XAF et XOF = 0. */
  readonly decimals: number;
  /** Symbole d'affichage : « € », « FCFA ». */
  readonly symbole: string;
}

/** Erreur levée quand un montant ou une devise est inexploitable. */
export class MoneyError extends Error {}

function assertValidCurrency(currency: Currency): void {
  if (!Number.isInteger(currency.decimals) || currency.decimals < 0 || currency.decimals > 4) {
    throw new MoneyError(
      `Devise ${currency.code} : nombre de décimales invalide (${String(currency.decimals)}).`,
    );
  }
}

function assertValidMinor(minor: number): void {
  if (!Number.isInteger(minor)) {
    throw new MoneyError(
      `Montant non entier (${String(minor)}) : les montants circulent dans la plus petite unité de leur devise.`,
    );
  }
}

/** Facteur de conversion entre l'unité principale et la sous-unité. */
function factor(currency: Currency): number {
  return 10 ** currency.decimals;
}

/**
 * Convertit un montant de la plus petite unité vers l'unité principale.
 *
 * `toMajorUnits(499, EUR)` vaut 4.99 ; `toMajorUnits(1500, XAF)` vaut 1500.
 */
export function toMajorUnits(minor: number, currency: Currency): number {
  assertValidCurrency(currency);
  assertValidMinor(minor);
  return minor / factor(currency);
}

/**
 * Convertit un montant de l'unité principale vers la plus petite unité.
 *
 * Sert à la saisie administrative d'un prix. L'arrondi est explicite : saisir
 * 4,999 € donne 500 centimes, pas 499,9.
 */
export function toMinorUnits(major: number, currency: Currency): number {
  assertValidCurrency(currency);
  if (!Number.isFinite(major)) {
    throw new MoneyError(`Montant non fini (${String(major)}).`);
  }
  return Math.round(major * factor(currency));
}

/**
 * Formate un montant pour l'affichage.
 *
 * Le symbole vient de la table `currencies` plutôt que du formatage monétaire
 * d'`Intl` : celui-ci varie selon la version d'ICU et rendrait l'affichage
 * dépendant de la machine. Ici, `499 EUR` donne toujours « 4,99 € » et
 * `1500 XAF` toujours « 1 500 FCFA ».
 */
export function formatAmount(minor: number, currency: Currency, locale = 'fr-FR'): string {
  const major = toMajorUnits(minor, currency);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(major);
  return `${formatted} ${currency.symbole}`;
}

/**
 * Somme de montants de même devise.
 *
 * Additionner des devises différentes n'a aucun sens sans taux de change, et
 * aucune conversion n'est faite à l'exécution (D4 point 4). La fonction refuse
 * donc explicitement plutôt que de produire un total silencieusement faux.
 */
export function sumAmounts(amounts: readonly { montant: number; devise: string }[]): {
  montant: number;
  devise: string;
} {
  const first = amounts[0];
  if (first === undefined) {
    throw new MoneyError('Somme de zéro montant : la devise du résultat serait indéterminée.');
  }

  let total = 0;
  for (const amount of amounts) {
    if (amount.devise !== first.devise) {
      throw new MoneyError(
        `Devises hétérogènes (${first.devise} et ${amount.devise}) : aucune conversion n'est faite à l'exécution.`,
      );
    }
    assertValidMinor(amount.montant);
    total += amount.montant;
  }

  return { montant: total, devise: first.devise };
}

/**
 * Applique une remise en pourcentage, arrondie à l'unité la plus petite.
 *
 * L'arrondi se fait sur la remise et non sur le total, pour qu'une remise de
 * 0 % laisse toujours le montant strictement inchangé.
 */
export function applyPercentage(minor: number, percentage: number): number {
  assertValidMinor(minor);
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
    throw new MoneyError(`Pourcentage hors bornes (${String(percentage)}).`);
  }
  // Ce 100 est le diviseur d'un pourcentage, pas une conversion entre unité
  // principale et sous-unité. Il ne dépend d'aucune devise : appliquer 20 % à
  // 1500 XAF donne 1200 XAF comme appliquer 20 % à 499 centimes donne 399
  // centimes. C'est le seul endroit du dépôt où la règle est levée.
  // eslint-disable-next-line no-restricted-syntax -- diviseur de pourcentage, voir ci-dessus
  const discount = Math.round((minor * percentage) / 100);
  return minor - discount;
}
