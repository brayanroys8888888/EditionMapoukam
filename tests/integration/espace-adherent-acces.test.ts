import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * LA RÈGLE D'ENTRÉE DE L'ESPACE ADHÉRENT — A1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CINQ SITUATIONS, ET TROIS D'ENTRE ELLES SE RESSEMBLENT.                 │
 * │                                                                          │
 * │ « Adhésion en cours », « résiliation programmée » et « impayé de trois   │
 * │ jours » ouvrent toutes l'espace. Les confondre serait pourtant une       │
 * │ faute : le troisième doit voir un bandeau, sans quoi il découvrira que   │
 * │ son paiement a échoué le jour où l'accès se fermera.                     │
 * │                                                                          │
 * │ À l'inverse, « impayé de dix jours » et « expiré » se ressemblent moins  │
 * │ qu'il n'y paraît — le premier PEUT encore payer, et c'est ce que la page │
 * │ des offres doit lui proposer.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La fenêtre n'est pas écrite ici : elle vient de
 * `business_settings.periode_grace_jours`, que `fin_grace_impaye` lit. Ces
 * tests la LISENT eux aussi, pour ne pas figer un 7 qui deviendrait faux.
 */

const comptes: TestUser[] = [];

afterEach(async () => {
  while (comptes.length > 0) {
    const compte = comptes.pop();
    if (compte) await deleteTestUser(compte);
  }
});

afterAll(async () => {
  await closePool();
});

/** La tolérance configurée, en jours. Lue, jamais supposée. */
async function graceJours(): Promise<number> {
  const ligne = await queryOne<{ jours: number }>(
    `select periode_grace_jours as jours from public.business_settings where id = 1`,
  );
  return Number(ligne?.jours ?? 0);
}

/**
 * Un compte, et son adhésion.
 *
 * `finDansJours` négatif place l'échéance dans le passé ; `impayeDepuisJours`
 * pose le début de l'impayé, d'où court la grâce.
 */
async function adherent(options: {
  statut?: string;
  finDansJours?: number;
  impayeDepuisJours?: number | null;
  domaine?: 'lecture' | 'association';
}): Promise<TestUser> {
  const compte = await createTestUser();
  comptes.push(compte);

  await query(
    `insert into public.subscriptions
       (user_id, domaine, statut, offre, zone, devise, montant,
        debut_periode, fin_periode, impaye_depuis)
     values ($1, $2::public.subscription_domain, $3::public.subscription_status, 'annuel',
             'international', 'EUR', 1500,
             public.app_now() - interval '400 days',
             public.app_now() + make_interval(days => $4),
             case when $5::int is null then null
                  else public.app_now() - make_interval(days => $5::int) end)`,
    [
      compte.id,
      options.domaine ?? 'association',
      options.statut ?? 'actif',
      options.finDansJours ?? 200,
      options.impayeDepuisJours ?? null,
    ],
  );

  return compte;
}

async function verdict(compte: TestUser): Promise<string> {
  const ligne = await queryOne<{ verdict: string }>(
    `select verdict from public.association_acces_espace($1)`,
    [compte.id],
  );
  return ligne?.verdict ?? '(aucune ligne)';
}

describe('le verdict d’entrée', () => {
  it('rend UNE LIGNE même sans adhésion, plutôt que rien', async () => {
    /*
     * Une fonction qui ne rendrait aucune ligne ferait lire « pas de
     * réponse » là où la réponse est « cette personne n'a pas adhéré ». Le
     * front-end distinguerait alors mal un visiteur d'une panne.
     */
    const compte = await createTestUser();
    comptes.push(compte);

    const lignes = await query(`select * from public.association_acces_espace($1)`, [compte.id]);
    expect(lignes).toHaveLength(1);
    expect(await verdict(compte)).toBe('sans_adhesion');
  });

  it('OUVRE pour une adhésion en cours', async () => {
    expect(await verdict(await adherent({}))).toBe('ouvert');
  });

  it('OUVRE pour une résiliation programmée — l’accès court jusqu’au terme', async () => {
    // « Fin programmée » n'est pas « fini » : l'adhérent a payé son année.
    expect(await verdict(await adherent({ statut: 'annule' }))).toBe('ouvert');
  });

  it('OUVRE AVEC AVERTISSEMENT pendant la grâce d’un impayé', async () => {
    const jours = await graceJours();
    const compte = await adherent({
      statut: 'impaye',
      finDansJours: -1,
      impayeDepuisJours: Math.max(1, jours - 1),
    });

    expect(await verdict(compte)).toBe('impaye_tolere');
  });

  it('FERME dès que la grâce est écoulée', async () => {
    /*
     * La bascule n'est pas écrite dans cette fonction : `statut_effectif`
     * rend `expire` au-delà de la tolérance, et le verdict suit. Le test
     * prend la tolérance configurée et ajoute un jour — il resterait juste
     * si l'éditeur portait la grâce à trente jours.
     */
    const jours = await graceJours();
    const compte = await adherent({
      statut: 'impaye',
      finDansJours: -1,
      impayeDepuisJours: jours + 1,
    });

    expect(await verdict(compte)).toBe('ferme');
  });

  it('FERME pour une adhésion expirée', async () => {
    expect(await verdict(await adherent({ statut: 'expire', finDansJours: -30 }))).toBe('ferme');
  });

  it('rend la date de FIN DE GRÂCE, pour que le bandeau la dise', async () => {
    // Un bandeau « votre paiement n'a pas abouti » sans date ne dit pas
    // combien de temps il reste, et ne fait donc rien arriver.
    const jours = await graceJours();
    const compte = await adherent({
      statut: 'impaye',
      finDansJours: -1,
      impayeDepuisJours: Math.max(1, jours - 2),
    });

    const ligne = await queryOne<{ fin_grace: Date | null }>(
      `select fin_grace from public.association_acces_espace($1)`,
      [compte.id],
    );
    expect(ligne?.fin_grace).not.toBeNull();
  });
});

describe('l’étanchéité des deux abonnements', () => {
  it('NE LAISSE PAS ENTRER un abonné de LECTURE', async () => {
    /*
     * C'est la règle de §3.6, et elle se perd en oubliant un seul mot dans le
     * prédicat. Rien ne casserait : l'écran s'afficherait, et un abonné du
     * catalogue lirait l'espace associatif sans l'avoir payé.
     */
    const compte = await adherent({ domaine: 'lecture' });
    expect(await verdict(compte)).toBe('sans_adhesion');
  });

  it('laisse entrer un compte qui porte LES DEUX', async () => {
    const compte = await adherent({ domaine: 'association' });
    await query(
      `insert into public.subscriptions
         (user_id, domaine, statut, offre, zone, devise, montant, debut_periode, fin_periode)
       values ($1, 'lecture', 'actif', 'mensuel', 'international', 'EUR', 500,
               public.app_now() - interval '30 days', public.app_now() + interval '30 days')`,
      [compte.id],
    );

    expect(await verdict(compte)).toBe('ouvert');
  });
});
