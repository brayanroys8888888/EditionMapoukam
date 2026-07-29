/**
 * Progression de lecture — §4.2 F7.
 *
 * Module PUR : les règles de reprise et de regroupement des écritures, sans
 * base ni horloge lue ici.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QU'ON N'ENREGISTRE PAS, ET POURQUOI C'EST LE POINT PRINCIPAL.        │
 * │                                                                          │
 * │ La progression est une donnée COMPORTEMENTALE sur la lecture d'un        │
 * │ enfant. On conserve donc le strict minimum : la dernière page et         │
 * │ l'horodatage. Rien d'autre.                                              │
 * │                                                                          │
 * │ Pas d'historique de sessions, pas de durée de lecture, pas de parcours   │
 * │ page par page, pas d'heure de coucher déduite. Ce n'est utile ni au      │
 * │ produit ni à l'utilisateur, et ce serait un passif au regard de §11.2 —  │
 * │ d'autant que CLAUDE.md interdit déjà toute donnée d'enfant.             │
 * │                                                                          │
 * │ La tentation viendra : « on pourrait savoir quels titres sont finis »,   │
 * │ « on pourrait mesurer l'engagement ». Chacune de ces mesures demande de  │
 * │ conserver un parcours, et ce parcours décrit un enfant.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export interface ProgressionEnregistree {
  langue: 'fr' | 'en';
  dernierePage: number;
  majLe: Date;
}

export interface Reprise {
  page: number;
  /** Langue d'où vient la progression retenue. `null` si aucune n'existait. */
  langueOrigine: 'fr' | 'en' | null;
  /** Vrai si la page a dû être ramenée à la longueur de la version ouverte. */
  borneAppliquee: boolean;
}

/**
 * Page à laquelle reprendre la lecture.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RÉVISION DE docs/PLAN.md D2 POINT 6.                                    │
 * │                                                                          │
 * │ La règle disait : progression par LIVRE, pas par langue, pour que        │
 * │ basculer de version ne perde pas la page atteinte. L'intention était     │
 * │ juste ; la mise en œuvre ne pouvait pas tenir.                          │
 * │                                                                          │
 * │ Les versions française et anglaise sont deux PDF distincts, produits par │
 * │ deux passages séparés de la chaîne d'ingestion. Un texte traduit se      │
 * │ recompose : « page 19 » en français peut simplement NE PAS EXISTER en    │
 * │ anglais. Le jeu de démonstration porte ce cas — 20 pages contre 16.     │
 * │                                                                          │
 * │ La progression est donc stockée par langue, et la reprise RETOMBE sur la │
 * │ progression d'une autre langue quand la langue ouverte n'en a pas        │
 * │ encore. La promesse d'origine est tenue ; on ne prétend plus qu'une page │
 * │ d'une version existe dans une autre.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * @param nbPages nombre de pages de la version RÉELLEMENT ouverte.
 */
export function calculerReprise(
  progressions: readonly ProgressionEnregistree[],
  langue: 'fr' | 'en',
  nbPages: number,
): Reprise {
  const borneHaute = Math.max(nbPages, 1);

  const propre = progressions.find((p) => p.langue === langue);
  if (propre) {
    return {
      // Bornée même pour sa propre langue : le titre a pu être réingéré plus
      // court depuis la dernière lecture.
      page: Math.min(propre.dernierePage, borneHaute),
      langueOrigine: langue,
      borneAppliquee: propre.dernierePage > borneHaute,
    };
  }

  // La plus RÉCENTE des autres langues : c'est celle où le lecteur en est le
  // plus probablement, et non la plus avancée — être allé loin dans une version
  // abandonnée il y a six mois ne dit rien de la lecture en cours.
  const autres = [...progressions]
    .filter((p) => p.langue !== langue)
    .sort((a, b) => b.majLe.getTime() - a.majLe.getTime());

  const repli = autres[0];
  if (!repli) {
    return { page: 1, langueOrigine: null, borneAppliquee: false };
  }

  return {
    page: Math.min(repli.dernierePage, borneHaute),
    langueOrigine: repli.langue,
    borneAppliquee: repli.dernierePage > borneHaute,
  };
}

/**
 * Intervalle minimal entre deux écritures pour un même livre, en millisecondes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST LA SEULE TABLE OÙ UN UTILISATEUR ÉCRIT SOUVENT.                   │
 * │                                                                          │
 * │ Un enfant qui feuillette un album de 48 pages produirait 48 écritures en │
 * │ quelques minutes. Multiplié par le nombre de lecteurs simultanés, c'est  │
 * │ la seule charge d'écriture soutenue de la plateforme — et elle porte sur │
 * │ une donnée dont personne ne remarquerait la perte de quelques secondes.  │
 * │                                                                          │
 * │ Dix secondes : assez pour absorber un feuilletage rapide, assez court    │
 * │ pour qu'une fermeture d'application ne perde presque rien.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const INTERVALLE_ECRITURE_MS = 10_000;

/**
 * Faut-il écrire cette progression, ou l'absorber ?
 *
 * Le regroupement est décidé côté SERVEUR et non confié au client : une
 * application qui écrirait à chaque tourne-page, par erreur ou par version
 * ancienne, ne doit pas pouvoir imposer sa cadence.
 *
 * @param derniereEcriture instant de la dernière écriture retenue, ou `null`.
 * @param maintenant heure RÉELLE du serveur.
 */
export function doitEcrire(
  derniereEcriture: Date | null,
  maintenant: Date,
  pageActuelle: number | null,
  pageDemandee: number,
): boolean {
  // Une page identique ne mérite jamais d'écriture, quel que soit le délai :
  // c'est le cas d'un lecteur qui laisse l'album ouvert.
  if (pageActuelle === pageDemandee) return false;

  // Première écriture : toujours retenue, sans quoi la toute première page lue
  // serait perdue.
  if (!derniereEcriture) return true;

  return maintenant.getTime() - derniereEcriture.getTime() >= INTERVALLE_ECRITURE_MS;
}
