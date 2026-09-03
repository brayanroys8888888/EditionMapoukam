import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  creerOffre,
  listerOffres,
  modifierOffre,
  poserPrixOffre,
  supprimerOffre,
} from '@/lib/admin/service';
import { appliquerEvenement } from '@/lib/subscriptions/handlers';
import { FixedClock } from '@/lib/clock';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * LA GESTION DES OFFRES — §4.3 F12 bis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE OFFRE VEND UN DROIT ; ELLE N'EN CRÉE AUCUN.                          │
 * │                                                                          │
 * │ Ce que `lecture` et `association` ouvrent est écrit une seule fois, dans  │
 * │ `abonnement_ouvre_droit`. Ce fichier n'éprouve donc pas des droits : il   │
 * │ éprouve les trois refus qui empêchent une grille tarifaire de devenir     │
 * │ incohérente — activer une offre sans prix, effacer une offre souscrite,   │
 * │ et changer ce qu'un contrat déjà signé voulait dire.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TROISIÈME CONTRÔLE EST ÉPROUVÉ ICI, ET LUI SEUL.                     │
 * │                                                                          │
 * │ Les deux premiers — la garde de la route et celle de l'écran — sont       │
 * │ couverts par `tests/security/admin.test.ts`, qui ÉNUMÈRE les routes       │
 * │ trouvées sur le disque et exige 404 pour un non-administrateur. Reste le  │
 * │ troisième : la fonction SQL revérifie le rôle EN BASE. C'est celui qui    │
 * │ tient encore si un jour une route oublie sa garde.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const PREFIXE = 'test-offre';

let editeur: TestUser;
let intrus: TestUser;
let abonne: TestUser;

/** Les offres fabriquées par ce fichier, effacées à la fin. */
const codes: string[] = [];

let compteur = 0;

async function fabriquerOffre(
  domaine: 'lecture' | 'association',
  periode: 'mensuel' | 'annuel' = 'mensuel',
): Promise<{ id: string; code: string }> {
  const code = `${PREFIXE}-${domaine}-${periode}-${(compteur += 1)}`;
  codes.push(code);

  const resultat = await creerOffre(editeur.id, {
    code,
    domaine,
    periode,
    libelleFr: 'Offre de test',
    libelleEn: 'Test plan',
  });
  expect(resultat.ok).toBe(true);

  const ligne = await queryOne<{ id: string }>(
    'select id from public.subscription_plans where code = $1',
    [code],
  );
  return { id: ligne!.id, code };
}

beforeAll(async () => {
  [editeur, intrus, abonne] = await Promise.all([
    createTestUser({ admin: true }),
    createTestUser(),
    createTestUser(),
  ]);
});

afterAll(async () => {
  // Les comptes d'abord : `subscriptions` référence `subscription_plans`, et
  // une offre encore souscrite ne s'efface pas — c'est même l'objet d'un des
  // tests ci-dessous.
  await deleteTestUser(editeur);
  await deleteTestUser(intrus);
  await deleteTestUser(abonne);
  await query('delete from public.subscription_plans where code like $1', [`${PREFIXE}-%`]);
  await closePool();
});

describe('une offre naît inactive', () => {
  it('n’est pas mise en vente par sa seule création', async () => {
    const { code } = await fabriquerOffre('association');

    const ligne = await queryOne<{ actif: boolean }>(
      'select actif from public.subscription_plans where code = $1',
      [code],
    );
    // La création ne prend même pas de paramètre `actif` : une offre sans prix
    // en vente serait invisible partout, et l'éditeur croirait vendre.
    expect(ligne?.actif).toBe(false);
  });

  it('figure malgré tout dans la liste d’administration, avec ce qui lui manque', async () => {
    const { code } = await fabriquerOffre('association');

    const resultat = await listerOffres();
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const offre = (resultat.donnees as { code: string; manques: string[] }[]).find(
      (ligne) => ligne.code === code,
    );
    expect(offre).toBeDefined();
    // « Ce qui manque » est LU, comme pour la publication d'un titre : l'écran
    // ne recompte pas les zones sans prix.
    expect(offre?.manques.length).toBeGreaterThan(0);
  });
});

describe('une offre sans prix ne s’active pas', () => {
  it('refuse l’activation, et le dit comme une règle métier', async () => {
    const { id } = await fabriquerOffre('association');

    const refus = await modifierOffre(editeur.id, id, { actif: true });

    expect(refus.ok).toBe(false);
    if (refus.ok) return;
    // `regle_metier`, et non `indisponible` : l'éditeur doit comprendre qu'il
    // lui reste un geste à faire, pas qu'une panne l'en empêche.
    expect(refus.raison).toBe('regle_metier');
  });

  it('l’accepte dès qu’un prix existe, et l’offre entre alors au catalogue', async () => {
    const { id, code } = await fabriquerOffre('association', 'annuel');

    expect((await poserPrixOffre(editeur.id, id, {
      zone: 'international',
      montant: 4000,
      devise: 'EUR',
    })).ok).toBe(true);
    expect((await modifierOffre(editeur.id, id, { actif: true })).ok).toBe(true);

    const publiees = await query<{ code: string; montant: string }>(
      `select code, montant from public.offres_publiques('international', 'association')`,
    );
    expect(publiees.map((ligne) => ligne.code)).toContain(code);
  });

  it('reste invisible dans une zone où elle n’a pas de prix', async () => {
    const { id, code } = await fabriquerOffre('lecture');

    await poserPrixOffre(editeur.id, id, { zone: 'international', montant: 799, devise: 'EUR' });
    await modifierOffre(editeur.id, id, { actif: true });

    const afrique = await query<{ code: string }>(
      `select code from public.offres_publiques('afrique', 'lecture')`,
    );
    // Jointure interne sur le prix de la zone : on ne propose jamais une
    // souscription qui ne peut pas aboutir.
    expect(afrique.map((ligne) => ligne.code)).not.toContain(code);
  });
});

describe('les deux domaines ne se mélangent pas dans la vitrine', () => {
  it('une offre d’adhésion ne figure pas parmi les offres de lecture', async () => {
    const { id, code } = await fabriquerOffre('association');
    await poserPrixOffre(editeur.id, id, { zone: 'international', montant: 400, devise: 'EUR' });
    await modifierOffre(editeur.id, id, { actif: true });

    const lecture = await query<{ code: string }>(
      `select code from public.offres_publiques('international', 'lecture')`,
    );
    expect(lecture.map((ligne) => ligne.code)).not.toContain(code);
  });

  it('ni le domaine ni la périodicité ne sont modifiables', async () => {
    /*
     * On vérifie l'ABSENCE des paramètres, et non le refus d'une valeur : la
     * fonction ne peut pas refuser ce qu'elle ne reçoit pas, et c'est la forme
     * la plus solide de l'interdit. Les changer réécrirait le sens des
     * contrats déjà souscrits — un abonné « lecture » deviendrait adhérent
     * sans l'avoir demandé, ni payé.
     */
    const parametres = await queryOne<{ arguments: string }>(
      `select pg_get_function_arguments(p.oid) as arguments
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'admin_modifier_offre'`,
    );

    expect(parametres?.arguments).toBeTruthy();
    expect(parametres?.arguments).not.toContain('p_domaine');
    expect(parametres?.arguments).not.toContain('p_periode');
  });
});

describe('une offre souscrite ne s’efface pas', () => {
  it('refuse la suppression, et laisse la désactivation ouverte', async () => {
    const { id } = await fabriquerOffre('association');
    await poserPrixOffre(editeur.id, id, { zone: 'international', montant: 400, devise: 'EUR' });
    await modifierOffre(editeur.id, id, { actif: true });

    const souscription = await appliquerEvenement(
      {
        userId: abonne.id,
        domaine: 'association',
        evenement: 'souscrit',
        offre: 'mensuel',
        planId: id,
        zone: 'international',
        devise: 'EUR',
        montant: 400,
      },
      { clock: new FixedClock(new Date('2026-07-29T12:00:00Z')) },
    );
    expect(souscription.ok).toBe(true);

    const refus = await supprimerOffre(editeur.id, id);
    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('regle_metier');

    // Le geste qui reste, et qui n'efface l'historique de personne : retirer
    // l'offre de la vente. Les contrats en cours continuent.
    expect((await modifierOffre(editeur.id, id, { actif: false })).ok).toBe(true);
    const restant = await queryOne<{ statut: string }>(
      'select statut from public.subscriptions where user_id = $1',
      [abonne.id],
    );
    expect(restant?.statut).toBe('actif');
  });

  it('s’efface en revanche si personne ne l’a jamais souscrite', async () => {
    const { id, code } = await fabriquerOffre('lecture', 'annuel');

    expect((await supprimerOffre(editeur.id, id)).ok).toBe(true);
    const ligne = await queryOne('select 1 from public.subscription_plans where code = $1', [code]);
    expect(ligne).toBeUndefined();
  });
});

describe('la fonction SQL revérifie le rôle, même bien appelée', () => {
  it('refuse un acteur qui n’est pas administrateur', async () => {
    const { id } = await fabriquerOffre('association');

    // L'appel est fait avec `service_role`, exactement comme le ferait une
    // route à qui l'on aurait retiré sa garde. Le rôle de l'ACTEUR, lui, est
    // relu en base — et c'est ce contrôle-là qui répond.
    const refus = await modifierOffre(intrus.id, id, { libelleFr: 'Détourné' });

    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).toBe('refuse');

    const ligne = await queryOne<{ libelle_fr: string }>(
      'select libelle_fr from public.subscription_plans where id = $1',
      [id],
    );
    expect(ligne?.libelle_fr).toBe('Offre de test');
  });
});
