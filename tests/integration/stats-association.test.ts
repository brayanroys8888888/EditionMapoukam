import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * LES QUATRE CHIFFRES DE L'ÉCRAN ASSOCIATION — migration 0095.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « À RENOUVELER » EST UNE FENÊTRE, ET UNE FENÊTRE A DEUX BORDS.           │
 * │                                                                          │
 * │ Le bord haut est évident : une adhésion qui se termine dans quarante     │
 * │ jours n'est pas à renouveler cette semaine. Le bord BAS l'est moins, et  │
 * │ c'est lui qui compte : une adhésion déjà échue n'est pas non plus à      │
 * │ renouveler — elle est perdue, et la compter gonflerait le chiffre de     │
 * │ tout l'historique du site.                                              │
 * │                                                                          │
 * │ Ces deux bords sont éprouvés séparément : une implémentation qui         │
 * │ n'aurait que la borne haute passerait l'un et raterait l'autre.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Tout se compte contre `app_now()`, jamais contre l'horloge du serveur de
 * rendu : c'est la règle de CLAUDE.md, et c'est pourquoi ces chiffres vivent
 * en base plutôt que dans l'écran.
 */

interface Stats {
  adherents: string | number;
  a_renouveler: string | number;
  brouillons: string | number;
  derniere_publication: string | null;
}

const comptes: TestUser[] = [];

async function lire(): Promise<Stats> {
  const ligne = await queryOne<Stats>(`select * from public.admin_stats_association()`);
  if (!ligne) throw new Error('admin_stats_association n’a rendu aucune ligne.');
  return ligne;
}

/** Une adhésion qui se termine dans `jours` jours — négatif pour le passé. */
async function adherer(
  jours: number,
  options: { domaine?: 'lecture' | 'association'; statut?: string } = {},
): Promise<void> {
  const compte = await createTestUser();
  comptes.push(compte);
  /*
   * Le début recule d'un an : `subscriptions_periode_coherente` exige
   * `fin_periode > debut_periode`, et une adhésion déjà échue a donc besoin
   * d'un début plus ancien encore que sa fin. Sans cela, le cas qui éprouve
   * le bord bas de la fenêtre ne peut même pas être écrit.
   */
  await query(
    `insert into public.subscriptions
       (user_id, domaine, statut, offre, zone, devise, montant, debut_periode, fin_periode)
     values ($1, $2::public.subscription_domain, $3::public.subscription_status, 'mensuel',
             'international', 'EUR', 500,
             public.app_now() - interval '365 days',
             public.app_now() + make_interval(days => $4))`,
    [compte.id, options.domaine ?? 'association', options.statut ?? 'actif', jours],
  );
}

let departAdherents = 0;
let departRenouveler = 0;

beforeAll(async () => {
  // Le jeu de démonstration peut porter ses propres adhésions : on mesure
  // l'ÉCART, jamais la valeur absolue. Un test qui attendrait « 3 » tomberait
  // le jour où un autre fichier laisse une adhésion derrière lui.
  const avant = await lire();
  departAdherents = Number(avant.adherents);
  departRenouveler = Number(avant.a_renouveler);
});

afterEach(async () => {
  while (comptes.length > 0) {
    const compte = comptes.pop();
    if (compte) await deleteTestUser(compte);
  }
});

afterAll(async () => {
  await closePool();
});

describe('admin_stats_association', () => {
  it('compte une adhésion en cours, et pas un abonnement de LECTURE', async () => {
    /*
     * Les deux abonnements sont étanches (§3.6). Un chiffre qui les
     * mélangerait afficherait le public du catalogue sur l'écran de
     * l'association — et personne ne s'en apercevrait, puisque le nombre
     * paraîtrait simplement flatteur.
     */
    await adherer(200);
    await adherer(200, { domaine: 'lecture' });

    const apres = await lire();
    expect(Number(apres.adherents) - departAdherents).toBe(1);
  });

  it('compte une adhésion RÉSILIÉE tant qu’elle court', async () => {
    // Un adhérent qui a résilié reste un adhérent jusqu'au terme payé : il
    // lit encore. C'est la même définition que `admin_stats_abonnements`.
    await adherer(20, { statut: 'annule' });

    const apres = await lire();
    expect(Number(apres.adherents) - departAdherents).toBe(1);
  });

  it('range dans « à renouveler » une adhésion qui se termine sous 30 jours', async () => {
    await adherer(10);

    const apres = await lire();
    expect(Number(apres.a_renouveler) - departRenouveler).toBe(1);
  });

  it('N’Y RANGE PAS une adhésion qui court encore deux mois', async () => {
    await adherer(60);

    const apres = await lire();
    expect(Number(apres.a_renouveler) - departRenouveler).toBe(0);
  });

  it('N’Y RANGE PAS une adhésion DÉJÀ ÉCHUE — le bord bas de la fenêtre', async () => {
    /*
     * Sans la borne basse, toutes les adhésions expirées du site tomberaient
     * dans « à renouveler » : le chiffre grandirait sans fin, et l'éditeur
     * chercherait des relances à faire pour des gens partis depuis des mois.
     */
    await adherer(-5);

    const apres = await lire();
    expect(Number(apres.a_renouveler) - departRenouveler).toBe(0);
  });

  it('compte les contenus en brouillon, et rend la dernière parution', async () => {
    const avant = await lire();

    const cree = await queryOne<{ id: string }>(
      `insert into public.association_contents (slug, categorie, acces, statut)
       values ('essai-stats-association', 'actions', 'libre', 'brouillon')
       returning id`,
    );

    try {
      const apres = await lire();
      expect(Number(apres.brouillons) - Number(avant.brouillons)).toBe(1);

      /*
       * `toEqual`, et non `toBe` : le pilote rend un objet `Date`, et deux
       * `Date` de même instant restent deux objets distincts. `toBe` comparait
       * l'identité et échouait sur « aucune différence visible » — un message
       * qui décrit exactement le piège.
       */
      // La date de parution ne bouge pas : un brouillon n'est pas paru.
      expect(apres.derniere_publication).toEqual(avant.derniere_publication);
      expect(apres.derniere_publication).not.toBeNull();
    } finally {
      await query(`delete from public.association_contents where id = $1`, [cree?.id]);
    }
  });
});
