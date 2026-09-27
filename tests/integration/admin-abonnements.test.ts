import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * L'ÉCRAN DES ABONNEMENTS — ce que la base doit lui rendre (migration 0092).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUATRE RÈGLES, ET AUCUNE NE SE VOIT EN RELISANT L'ÉCRAN.                │
 * │                                                                          │
 * │ 1. « Terminé le » d'un IMPAYÉ est la fin de la GRÂCE, pas la fin de la   │
 * │    période payée — et elle vient de la même fonction que celle qui      │
 * │    décide que l'abonnement est échu. Deux calculs donneraient deux       │
 * │    dates, et l'écran annoncerait une fin que les droits ne respectent    │
 * │    pas.                                                                  │
 * │                                                                          │
 * │ 2. Le RÉCURRENT ne compte que ce qui sera prélevé à nouveau. Une fin     │
 * │    programmée, un essai, un impayé n'y entrent pas — les compter         │
 * │    annoncerait un revenu que la boutique ne recevra pas.                 │
 * │                                                                          │
 * │ 3. Les compteurs de segments disent ce que la liste montre, sur les      │
 * │    deux axes : statut et formule.                                        │
 * │                                                                          │
 * │ 4. Un abonné anonymisé ne reparaît ni par son nom, ni par son adresse,   │
 * │    ni par la recherche — la liste comme le panneau.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const aEffacer: string[] = [];
const comptes: TestUser[] = [];

afterEach(async () => {
  if (aEffacer.length > 0) {
    await query(`delete from public.payment_events where subscription_id = any($1::uuid[])`, [
      aEffacer,
    ]);
    await query(`delete from public.subscriptions where id = any($1::uuid[])`, [aEffacer]);
    aEffacer.length = 0;
  }
  while (comptes.length > 0) {
    const compte = comptes.pop();
    if (compte) await deleteTestUser(compte);
  }
});

afterAll(async () => {
  await closePool();
});

async function abonne(nom: string): Promise<TestUser> {
  const compte = await createTestUser();
  comptes.push(compte);
  await query(`update public.users set nom_complet = $1 where id = $2`, [nom, compte.id]);
  return compte;
}

/**
 * Un abonnement, écrit DIRECTEMENT — ce fichier éprouve des LECTURES.
 *
 * Les dates sont posées relativement à `app_now()`, la même horloge que
 * `statut_effectif` : une date absolue ferait basculer le statut observé le
 * jour où le calendrier la dépasserait, et le test tomberait sans que rien ait
 * changé.
 */
async function abonnement(
  userId: string,
  options: {
    domaine?: 'lecture' | 'association';
    statut?: 'essai' | 'actif' | 'annule' | 'impaye' | 'expire';
    offre?: 'mensuel' | 'annuel';
    devise?: string;
    montant?: number;
    finDansJours?: number;
    impayeDepuisJours?: number;
  } = {},
): Promise<string> {
  const ligne = await queryOne<{ id: string }>(
    `insert into public.subscriptions
       (user_id, domaine, statut, offre, zone, devise, montant, fin_periode, impaye_depuis)
     values ($1, $2::public.subscription_domain, $3::public.subscription_status, $4,
             'international', $5, $6,
             public.app_now() + make_interval(days => $7),
             case when $8::int is null then null
                  else public.app_now() - make_interval(days => $8::int) end)
     returning id`,
    [
      userId,
      options.domaine ?? 'lecture',
      options.statut ?? 'actif',
      options.offre ?? 'mensuel',
      options.devise ?? 'EUR',
      options.montant ?? 799,
      options.finDansJours ?? 20,
      options.impayeDepuisJours ?? null,
    ],
  );
  const id = ligne?.id ?? '';
  aEffacer.push(id);
  return id;
}

interface Ligne {
  id: string;
  nom: string | null;
  email: string | null;
  statut_observe: string;
  fin_acces: string;
  impaye_depuis?: string | null;
}

async function lister(
  filtres: { statut?: string; domaine?: string; recherche?: string } = {},
): Promise<Ligne[]> {
  return await query<Ligne>(
    `select * from public.admin_lister_abonnements($1, 1, 100, $2, $3)`,
    [filtres.statut ?? null, filtres.domaine ?? null, filtres.recherche ?? null],
  );
}

describe('la date où l’accès s’arrête', () => {
  it('est, pour un IMPAYÉ, la fin de la grâce — par la fonction de `statut_effectif`', async () => {
    const compte = await abonne('Hervé Ndongo');
    const id = await abonnement(compte.id, { statut: 'impaye', impayeDepuisJours: 2 });

    const attendu = await queryOne<{ fin: string }>(
      `select public.fin_grace_impaye(impaye_depuis)::text as fin from public.subscriptions where id = $1`,
      [id],
    );
    const ligne = (await lister()).find((l) => l.id === id);

    expect(ligne?.statut_observe).toBe('impaye');
    expect(new Date(ligne?.fin_acces ?? 0).getTime()).toBe(new Date(attendu?.fin ?? 1).getTime());

    /*
     * Et la grâce est bien celle des RÉGLAGES : si quelqu'un réécrivait la
     * fonction avec un « 7 » en dur, elle passerait le test précédent tant
     * que le réglage vaudrait 7. Celui-ci ne passerait plus.
     */
    const grace = await queryOne<{ jours: number }>(
      `select periode_grace_jours as jours from public.business_settings where id = 1`,
    );
    const ecart = await queryOne<{ jours: string }>(
      `select extract(epoch from (public.fin_grace_impaye(impaye_depuis) - impaye_depuis)) / 86400
         as jours
         from public.subscriptions where id = $1`,
      [id],
    );
    expect(Number(ecart?.jours)).toBe(grace?.jours);
  });

  it('tient pour échu un impayé dont la grâce est passée', async () => {
    const compte = await abonne('Paul Tchoumi');
    const grace = await queryOne<{ jours: number }>(
      `select periode_grace_jours as jours from public.business_settings where id = 1`,
    );
    // Premier échec il y a plus longtemps que la grâce : l'accès est fini.
    const id = await abonnement(compte.id, {
      statut: 'impaye',
      impayeDepuisJours: (grace?.jours ?? 7) + 1,
    });

    const ligne = (await lister()).find((l) => l.id === id);
    expect(ligne?.statut_observe).toBe('expire');
  });
});

describe('la bande de chiffres', () => {
  async function chiffres() {
    return await queryOne<{
      abonnes_lecture: string;
      recurrent_par_devise: { devise: string; mensuel: number }[];
    }>(`select * from public.admin_stats_abonnements()`);
  }

  function recurrent(
    lignes: { devise: string; mensuel: number }[] | undefined,
    devise: string,
  ): number {
    return lignes?.find((l) => l.devise === devise)?.mensuel ?? 0;
  }

  it('ne compte au récurrent QUE les abonnements actifs', async () => {
    const avant = await chiffres();

    const actif = await abonne('Awa Diallo');
    const programme = await abonne('Julien Martin');
    const impaye = await abonne('Marc Leroy');
    const essai = await abonne('Claire Dubois');

    await abonnement(actif.id, { statut: 'actif', devise: 'XOF', montant: 4500 });
    await abonnement(programme.id, { statut: 'annule', devise: 'XOF', montant: 4500 });
    await abonnement(impaye.id, { statut: 'impaye', devise: 'XOF', montant: 4500, impayeDepuisJours: 1 });
    await abonnement(essai.id, { statut: 'essai', devise: 'XOF', montant: 4500 });

    const apres = await chiffres();
    /*
     * Une seule des quatre compte. La devise XOF est choisie exprès : aucun
     * abonnement de démonstration ne l'emploie, et l'écart mesuré ne peut donc
     * venir que de ce test.
     */
    expect(recurrent(apres?.recurrent_par_devise, 'XOF') - recurrent(avant?.recurrent_par_devise, 'XOF')).toBe(4500);
  });

  it('ramène un annuel au mois, et ne l’additionne jamais à une autre devise', async () => {
    const avant = await chiffres();
    const compte = await abonne('Fondation Lumière');
    await abonnement(compte.id, {
      domaine: 'association',
      statut: 'actif',
      offre: 'annuel',
      devise: 'XOF',
      montant: 12000,
    });

    const apres = await chiffres();
    // 12 000 par an font 1 000 par mois, dans SA devise et nulle part ailleurs.
    expect(recurrent(apres?.recurrent_par_devise, 'XOF') - recurrent(avant?.recurrent_par_devise, 'XOF')).toBe(1000);
    expect(recurrent(apres?.recurrent_par_devise, 'EUR')).toBe(recurrent(avant?.recurrent_par_devise, 'EUR'));
  });

  it('compte une fin programmée parmi les abonnés — elle lit encore', async () => {
    const avant = await chiffres();
    const compte = await abonne('Estelle Mballa');
    await abonnement(compte.id, { statut: 'annule' });

    const apres = await chiffres();
    expect(Number(apres?.abonnes_lecture) - Number(avant?.abonnes_lecture)).toBe(1);
  });
});

describe('les compteurs de segments', () => {
  it('disent le même nombre que la liste, sur les DEUX axes', async () => {
    const a = await abonne('Aïcha Mbarga');
    const b = await abonne('Aïcha Mbarga');
    await abonnement(a.id, { domaine: 'lecture', statut: 'actif' });
    await abonnement(a.id, { domaine: 'association', statut: 'actif' });
    await abonnement(b.id, { domaine: 'lecture', statut: 'annule' });

    const recherche = 'Aïcha Mbarga';

    const parStatut = new Map(
      (
        await query<{ statut: string; nb: string }>(
          `select * from public.admin_compter_abonnements_par_statut(null, $1)`,
          [recherche],
        )
      ).map((l) => [l.statut, Number(l.nb)]),
    );
    for (const statut of ['actif', 'annule']) {
      expect(parStatut.get(statut), `désaccord sur ${statut}`).toBe(
        (await lister({ statut, recherche })).length,
      );
    }

    const parDomaine = new Map(
      (
        await query<{ domaine: string; nb: string }>(
          `select * from public.admin_compter_abonnements_par_domaine(null, $1)`,
          [recherche],
        )
      ).map((l) => [l.domaine, Number(l.nb)]),
    );
    for (const domaine of ['lecture', 'association']) {
      expect(parDomaine.get(domaine), `désaccord sur ${domaine}`).toBe(
        (await lister({ domaine, recherche })).length,
      );
    }
  });

  it('rendent tous les statuts et tous les domaines, y compris à zéro', async () => {
    const statuts = await query<{ statut: string }>(
      `select statut::text from public.admin_compter_abonnements_par_statut('association', 'personne-de-ce-nom')`,
    );
    expect(statuts.map((l) => l.statut).sort()).toEqual(
      ['actif', 'annule', 'anomalie', 'essai', 'expire', 'impaye'].sort(),
    );

    const domaines = await query<{ domaine: string }>(
      `select domaine::text from public.admin_compter_abonnements_par_domaine('expire', 'personne-de-ce-nom')`,
    );
    expect(domaines.map((l) => l.domaine).sort()).toEqual(['association', 'lecture']);
  });
});

describe('un abonné anonymisé', () => {
  it('ne reparaît ni dans la liste, ni par la recherche, ni dans le panneau', async () => {
    const compte = await abonne('Sophie Ngo Bell');
    const id = await abonnement(compte.id);

    expect((await lister({ recherche: 'Ngo Bell' })).map((l) => l.id)).toContain(id);

    await query(`select public.anonymize_user($1)`, [compte.id]);

    const ligne = (await lister()).find((l) => l.id === id);
    expect(ligne, 'l’abonnement survit : c’est une pièce comptable').toBeDefined();
    expect(ligne?.nom).toBeNull();
    expect(ligne?.email).toBeNull();
    expect((await lister({ recherche: 'Ngo Bell' })).map((l) => l.id)).not.toContain(id);

    const detail = await queryOne<{ nom: string | null; email: string | null }>(
      `select nom, email from public.admin_lire_abonnement($1)`,
      [id],
    );
    expect(detail?.nom).toBeNull();
    expect(detail?.email).toBeNull();
  });
});

describe('l’historique du panneau', () => {
  it('rend les événements ENREGISTRÉS, du plus récent au plus ancien', async () => {
    const compte = await abonne('Nadège Fotso');
    const id = await abonnement(compte.id);

    await query(
      `insert into public.payment_events (type, subscription_id, user_id, montant, devise, survenu_le)
       values ('abonnement.souscrit', $1, $2, 799, 'EUR', public.app_now() - interval '30 days'),
              ('abonnement.renouvele', $1, $2, 799, 'EUR', public.app_now())`,
      [id, compte.id],
    );

    const detail = await queryOne<{ historique: { type: string }[] }>(
      `select historique from public.admin_lire_abonnement($1)`,
      [id],
    );
    expect(detail?.historique.map((e) => e.type)).toEqual([
      'abonnement.renouvele',
      'abonnement.souscrit',
    ]);
  });
});
