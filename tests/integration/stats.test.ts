import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { reinitialiserQuotaAdmin } from '@/lib/admin/route-helpers';
import * as stats from '@/lib/admin/stats';
import { GET as statsRoute } from '@/app/api/admin/stats/route';
import { FixedClock } from '@/lib/clock';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, get } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * Statistiques agrégées — §4.3 F13.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX EXIGENCES QUI TIRENT EN SENS OPPOSÉ.                               │
 * │                                                                          │
 * │ Les chiffres doivent être JUSTES — un chiffre d'affaires faux est pire   │
 * │ qu'aucun chiffre — et ils ne doivent RIEN dire des personnes. Un agrégat │
 * │ trop fin redevient une donnée nominative : « ce titre a 1 lecteur »,     │
 * │ croisé avec la liste des acheteurs, nomme quelqu'un.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const T0 = new Date('2026-08-15T12:00:00.000Z');
/** Les faits precedent toujours la requete qui les agrege. Voir la convention
 *  d'intervalle semi-ouvert, eprouvee plus bas. */
const AVANT = new Date(T0.getTime() - 3_600_000);
const horloge = new FixedClock(T0.toISOString());

let editeur: TestUser;
let acheteurEur: TestUser;
let acheteurXof: TestUser;
let livreId: string;

/** Somme d'un agrégat de chiffre d'affaires, pour une devise et un flux donnés. */
function montantDe(
  lignes: { flux: string; devise: string; montant: number }[],
  flux: string,
  devise: string,
): number {
  return lignes
    .filter((l) => l.flux === flux && l.devise === devise)
    .reduce((total, l) => total + Number(l.montant), 0);
}

/** Crée une commande payée, avec sa ligne et sa facture. */
async function commanderPaye(
  user: TestUser,
  montant: number,
  devise: string,
  zone: string,
): Promise<string> {
  const commande = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
     values ($1, $2, $3, $4, 'paye', $5) returning id`,
    [user.id, montant, devise, zone, AVANT.toISOString()],
  );
  await query(
    `insert into public.order_items (order_id, book_id, langue, prix_unitaire, devise, zone)
     values ($1, $2, 'fr', $3, $4, $5)`,
    [commande!.id, livreId, montant, devise, zone],
  );
  await query(
    `insert into public.invoices
       (numero, user_id, order_id, facture_nom, facture_email, facture_pays,
        lignes, montant_ht, montant_tva, montant_ttc, taux_tva, devise, zone,
        conservation_jusqu_au)
     values (public.prochain_numero_facture(2026), $1, $2, 'Parent Test', $3, 'FR',
             '[]'::jsonb, $4, 0, $4, 0, $5, $6, $7)`,
    [
      user.id,
      commande!.id,
      user.email,
      montant,
      devise,
      zone,
      new Date(T0.getTime() + 10 * 365 * 86_400_000).toISOString(),
    ],
  );
  return commande!.id;
}

beforeAll(async () => {
  editeur = await createTestUser({ admin: true });
  acheteurEur = await createTestUser();
  acheteurXof = await createTestUser();

  livreId =
    (await queryOne<{ id: string }>(`select id from public.books where slug = 'le-lion-et-la-souris'`))
      ?.id ?? '';

  // Un achat dans CHAQUE devise : c'est ce qui rend le test de ventilation
  // significatif. Avec une seule devise, un total consolidé passerait.
  await commanderPaye(acheteurEur, 499, 'EUR', 'international');
  await commanderPaye(acheteurXof, 3000, 'XOF', 'afrique');
});

beforeEach(() => {
  reinitialiserQuotaAdmin();
});

afterAll(async () => {
  await deleteTestUser(editeur);
  await deleteTestUser(acheteurEur);
  await deleteTestUser(acheteurXof);
  await closePool();
});

describe('LES STATISTIQUES NE LISENT JAMAIS `users` (point 1)', () => {
  it('ne joint pas `users`, vérifié sur le TEXTE des fonctions', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ VÉRIFIÉ SUR LE TEXTE, ET PAS SEULEMENT SUR LE RÉSULTAT.              │
    // │                                                                      │
    // │ Le test comportemental ci-dessous prouve que les chiffres survivent à │
    // │ une anonymisation. Celui-ci prouve qu'ils ne PEUVENT PAS en dépendre  │
    // │ — une jointure ajoutée demain serait vue, même si elle ne changeait   │
    // │ aucun chiffre le jour où elle est écrite.                            │
    // └──────────────────────────────────────────────────────────────────────┘
    const fonctions = await query<{ nom: string; corps: string }>(
      `select p.proname as nom, pg_get_functiondef(p.oid) as corps
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'stats\\_%'`,
    );

    expect(fonctions.length).toBeGreaterThanOrEqual(6);

    const coupables = fonctions
      .filter((f) => /\b(join|from)\s+public\.users\b/i.test(f.corps))
      .map((f) => f.nom);

    expect(coupables).toEqual([]);
  });

  it('rend un chiffre d’affaires IDENTIQUE avant et après anonymisation', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE CHIFFRE D'AFFAIRES D'UN MOIS CLOS NE CHANGE PAS PARCE QU'UN       │
    // │ CLIENT A DEMANDÉ L'EFFACEMENT DE SON COMPTE.                         │
    // │                                                                      │
    // │ Ce serait un faux comptable — et, plus discrètement, un moyen de     │
    // │ déduire qu'un effacement a eu lieu en comparant deux relevés du même │
    // │ mois.                                                                │
    // └──────────────────────────────────────────────────────────────────────┘
    const partant = await createTestUser();
    await commanderPaye(partant, 1299, 'EUR', 'international');

    const periode = {
      debut: new Date(T0.getTime() - 86_400_000).toISOString(),
      fin: new Date(T0.getTime() + 86_400_000).toISOString(),
    };

    const avant = await stats.chiffreAffaires(periode, { clock: horloge });
    expect(avant.ok).toBe(true);
    const montantAvant = montantDe(
      (avant.ok ? avant.donnees : []) as never,
      'achat_unitaire',
      'EUR',
    );
    expect(montantAvant).toBeGreaterThanOrEqual(1299);

    // L'anonymisation RÉELLE, pas une simulation.
    await query(`select public.anonymize_user($1)`, [partant.id]);

    const compte = await queryOne<{ statut: string }>(
      `select statut from public.users where id = $1`,
      [partant.id],
    );
    expect(compte?.statut).toBe('anonymise');

    const apres = await stats.chiffreAffaires(periode, { clock: horloge });
    const montantApres = montantDe(
      (apres.ok ? apres.donnees : []) as never,
      'achat_unitaire',
      'EUR',
    );

    expect(montantApres).toBe(montantAvant);

    await deleteTestUser(partant);
  });
});

describe('ABONNÉS — statut EFFECTIF, jamais statut stocké (point 2)', () => {
  it('ne compte PAS une anomalie parmi les abonnés actifs', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UNE ANOMALIE EST UN ABONNEMENT DONT ON NE SAIT PAS S'IL EST PAYÉ.    │
    // │                                                                      │
    // │ Sa période est échue et aucun événement n'est arrivé — ni            │
    // │ renouvellement, ni échec. Le compter parmi les actifs gonflerait le   │
    // │ nombre d'abonnés payants, qui est le chiffre sur lequel se prennent   │
    // │ les décisions commerciales.                                          │
    // │                                                                      │
    // │ Le point qui compte : son `statut` STOCKÉ vaut « actif ». Un          │
    // │ comptage sur cette colonne le rangerait donc parmi les payants.       │
    // └──────────────────────────────────────────────────────────────────────┘
    const anomalie = await queryOne<{ id: string; statut: string }>(
      `insert into public.subscriptions
         (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
       values ($1, 'mensuel', 'actif',
               public.app_now() - interval '40 days',
               public.app_now() - interval '10 days',
               'international', 'EUR', 799)
       returning id, statut`,
      [acheteurEur.id],
    );

    // Le statut STOCKÉ vaut bien « actif » : sans cette vérification, le test
    // pourrait passer sur un abonnement déjà marqué expiré, et ne rien prouver.
    expect(anomalie?.statut).toBe('actif');

    const resultat = await stats.abonnes({ clock: horloge });
    expect(resultat.ok).toBe(true);

    const lignes = (resultat.ok ? resultat.donnees : []) as {
      statut_observe: string;
      nombre: string;
    }[];

    const parStatut = (s: string): number =>
      lignes.filter((l) => l.statut_observe === s).reduce((t, l) => t + Number(l.nombre), 0);

    expect(parStatut('anomalie')).toBeGreaterThanOrEqual(1);
    // Ni en actif...
    expect(parStatut('actif')).toBe(0);
    // ...ni en expiré : elle a sa propre ligne.
    expect(parStatut('expire')).toBe(0);

    await query(`delete from public.subscriptions where id = $1`, [anomalie!.id]);
  });

  it('compte un abonnement RÉELLEMENT actif — sinon le test précédent ne prouverait rien', async () => {
    // Un comptage qui rendrait toujours zéro passerait l'assertion ci-dessus.
    const sain = await queryOne<{ id: string }>(
      `insert into public.subscriptions
         (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
       values ($1, 'annuel', 'actif', public.app_now(),
               public.app_now() + interval '1 year', 'international', 'EUR', 6900)
       returning id`,
      [acheteurEur.id],
    );

    const resultat = await stats.abonnes({ clock: horloge });
    const lignes = (resultat.ok ? resultat.donnees : []) as {
      statut_observe: string;
      nombre: string;
    }[];

    expect(
      lignes.filter((l) => l.statut_observe === 'actif').reduce((t, l) => t + Number(l.nombre), 0),
    ).toBe(1);

    await query(`delete from public.subscriptions where id = $1`, [sain!.id]);
  });
});

describe('MULTI-DEVISES — ventilé, jamais consolidé (point 3)', () => {
  it('rend une ligne PAR DEVISE, et n’additionne rien', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ 499 CENTIMES D'EURO ET 3 000 FRANCS CFA NE FONT PAS 3 499 DE QUOI    │
    // │ QUE CE SOIT.                                                          │
    // │                                                                      │
    // │ Ce n'est pas une approximation qu'on s'autoriserait faute de mieux :  │
    // │ c'est un nombre qui ne désigne rien. D4 point 4 a écarté toute       │
    // │ conversion à l'exécution, et la conséquence est assumée ici.          │
    // └──────────────────────────────────────────────────────────────────────┘
    const resultat = await stats.chiffreAffaires(
      {
        debut: new Date(T0.getTime() - 86_400_000).toISOString(),
        fin: new Date(T0.getTime() + 86_400_000).toISOString(),
      },
      { clock: horloge },
    );

    const lignes = (resultat.ok ? resultat.donnees : []) as {
      flux: string;
      devise: string;
      montant: string;
    }[];

    const devises = new Set(lignes.map((l) => l.devise));
    expect(devises.has('EUR')).toBe(true);
    expect(devises.has('XOF')).toBe(true);

    // Chaque ligne porte SA devise : aucune ne vaut pour deux.
    for (const ligne of lignes) {
      expect(ligne.devise).toMatch(/^(EUR|XAF|XOF)$/);
    }

    // Et les montants ne se mélangent pas : l'euro et le franc CFA restent
    // séparés, avec leurs valeurs propres.
    expect(montantDe(lignes as never, 'achat_unitaire', 'EUR')).toBeGreaterThanOrEqual(499);
    expect(montantDe(lignes as never, 'achat_unitaire', 'XOF')).toBe(3000);
  });

  it('SÉPARE le revenu d’abonnement du revenu unitaire', async () => {
    // Mélanger les deux empêcherait de voir lequel porte l'activité — la
    // première question qu'on pose à ces chiffres, et celle qui décide de
    // l'ouverture commerciale de l'abonnement (§3.3).
    const resultat = await stats.chiffreAffaires(
      {
        debut: new Date(T0.getTime() - 86_400_000).toISOString(),
        fin: new Date(T0.getTime() + 86_400_000).toISOString(),
      },
      { clock: horloge },
    );
    const flux = new Set(
      ((resultat.ok ? resultat.donnees : []) as { flux: string }[]).map((l) => l.flux),
    );

    expect(flux.has('achat_unitaire')).toBe(true);
    // Aucun flux fourre-tout : le nom de chaque flux dit d'où vient l'argent.
    expect([...flux].every((f) => ['achat_unitaire', 'abonnement', 'remboursement'].includes(f)))
      .toBe(true);
  });

  it('compte un remboursement EN NÉGATIF, et à part', async () => {
    // Le noyer dans le chiffre d'affaires masquerait un taux de remboursement
    // anormal ; l'omettre gonflerait le revenu d'un montant qui a été rendu.
    const commande = await commanderPaye(acheteurEur, 999, 'EUR', 'international');
    await query(
      `update public.orders set statut = 'rembourse', maj_le = $2 where id = $1`,
      [commande, AVANT.toISOString()],
    );

    const resultat = await stats.chiffreAffaires(
      {
        debut: new Date(T0.getTime() - 86_400_000).toISOString(),
        fin: new Date(T0.getTime() + 86_400_000).toISOString(),
      },
      { clock: horloge },
    );
    const lignes = (resultat.ok ? resultat.donnees : []) as never;

    expect(montantDe(lignes, 'remboursement', 'EUR')).toBe(-999);
  });
});

describe('SURFACE DE LECTURE — bornes et anonymat (point 4)', () => {
  it('REFUSE une période de plus de trois ans', async () => {
    // Une période non bornée invite à tout balayer en une requête.
    const resultat = await stats.chiffreAffaires(
      {
        debut: new Date(T0.getTime() - 5 * 365 * 86_400_000).toISOString(),
        fin: T0.toISOString(),
      },
      { clock: horloge },
    );

    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.raison).toBe('periode_invalide');
  });

  it('REFUSE une période inversée', async () => {
    const resultat = await stats.chiffreAffaires(
      { debut: T0.toISOString(), fin: new Date(T0.getTime() - 86_400_000).toISOString() },
      { clock: horloge },
    );

    expect(resultat.ok).toBe(false);
  });

  it('PLAFONNE la pagination des listes de titres', async () => {
    const resultat = await stats.titresAchetes(
      { page: 1, taille: 100_000 },
      { clock: horloge },
    );
    expect(resultat.ok).toBe(true);

    // Le plafond vient de `taille_page_admin`, la même fonction que les listes
    // d'administration : une seule implémentation pour une seule règle.
    expect((resultat.ok ? resultat.donnees : []).length).toBeLessThanOrEqual(100);
  });

  it('n’expose AUCUN identifiant d’utilisateur, sur aucun agrégat', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ « LES TITRES LES PLUS LUS » EST UNE QUESTION SUR LE CATALOGUE.       │
    // │                                                                      │
    // │ La même table répondrait tout aussi bien à « qu'a lu cet             │
    // │ utilisateur ? », qui est une question sur une PERSONNE — et sur la    │
    // │ lecture d'un enfant (§7.7, règle 7 de CLAUDE.md).                     │
    // └──────────────────────────────────────────────────────────────────────┘
    const periode = { debut: null, fin: null };
    const pagination = { page: 1, taille: 25 };

    const agregats = [
      await stats.chiffreAffaires(periode, { clock: horloge }),
      await stats.abonnes({ clock: horloge }),
      await stats.mouvementsAbonnement(periode, { clock: horloge }),
      await stats.titresAchetes({ ...periode, ...pagination }, { clock: horloge }),
      await stats.titresLus({ ...periode, ...pagination }, { clock: horloge }),
      await stats.langues(periode, { clock: horloge }),
    ];

    for (const agregat of agregats) {
      expect(agregat.ok).toBe(true);
      const serialise = JSON.stringify(agregat.ok ? agregat.donnees : []);

      // Aucun identifiant de compte, sous aucune forme.
      for (const identifiant of [acheteurEur.id, acheteurXof.id, editeur.id]) {
        expect(serialise).not.toContain(identifiant);
      }
      for (const email of [acheteurEur.email, acheteurXof.email]) {
        expect(serialise).not.toContain(email);
      }
      expect(serialise).not.toContain('user_id');
    }
  });

  it('APPLIQUE un seuil d’agrégation aux titres lus', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ « CE TITRE A 1 LECTEUR » EST UNE DONNÉE NOMINATIVE DÉGUISÉE.         │
    // │                                                                      │
    // │ Croisée avec la liste des acheteurs du titre — que l'administration   │
    // │ a le droit de consulter — elle nomme cette personne. Le seuil coûte   │
    // │ une part de finesse sur la longue traîne ; c'est le prix de la règle  │
    // │ 7 de CLAUDE.md, et il est modeste.                                    │
    // └──────────────────────────────────────────────────────────────────────┘
    const lecteur = await createTestUser();
    try {
      await query(
        `insert into public.reading_progress (user_id, book_id, langue, derniere_page)
         values ($1, $2, 'fr', 3)`,
        [lecteur.id, livreId],
      );

      const resultat = await stats.titresLus(
        { debut: null, fin: null, page: 1, taille: 25 },
        { clock: horloge },
      );
      const lignes = (resultat.ok ? resultat.donnees : []) as {
        book_id: string;
        nb_lecteurs: string;
      }[];

      // Un seul lecteur : le titre ne doit PAS apparaître.
      expect(lignes.find((l) => l.book_id === livreId)).toBeUndefined();

      // Et aucune ligne rendue ne descend sous le seuil.
      for (const ligne of lignes) {
        expect(Number(ligne.nb_lecteurs)).toBeGreaterThanOrEqual(5);
      }
    } finally {
      await query(`delete from public.reading_progress where user_id = $1`, [lecteur.id]);
      await deleteTestUser(lecteur);
    }
  });

  it('rend un titre franchissant le seuil — sinon le test précédent ne prouverait rien', async () => {
    // Un agrégat qui ne rendrait JAMAIS rien passerait l'assertion ci-dessus.
    const lecteurs: TestUser[] = [];
    try {
      for (let i = 0; i < 5; i += 1) {
        const lecteur = await createTestUser();
        lecteurs.push(lecteur);
        await query(
          `insert into public.reading_progress (user_id, book_id, langue, derniere_page)
           values ($1, $2, 'fr', $3)`,
          [lecteur.id, livreId, i + 2],
        );
      }

      const resultat = await stats.titresLus(
        { debut: null, fin: null, page: 1, taille: 25 },
        { clock: horloge },
      );
      const lignes = (resultat.ok ? resultat.donnees : []) as {
        book_id: string;
        nb_lecteurs: string;
      }[];

      const notre = lignes.find((l) => l.book_id === livreId);
      expect(notre).toBeDefined();
      expect(Number(notre?.nb_lecteurs)).toBe(5);
    } finally {
      for (const lecteur of lecteurs) {
        await query(`delete from public.reading_progress where user_id = $1`, [lecteur.id]);
        await deleteTestUser(lecteur);
      }
    }
  });
});

describe('BORNES DE PÉRIODE VIA L’HORLOGE INJECTABLE (point 5)', () => {
  it('suit un déplacement du temps', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ APRÈS UN DÉPLACEMENT DU TEMPS, « LES TRENTE DERNIERS JOURS » DOIVENT │
    // │ SUIVRE.                                                              │
    // │                                                                      │
    // │ Des bornes calculées sur `now()` produiraient des séries incohérentes │
    // │ avec les faits que la console de simulation vient de créer : on       │
    // │ avancerait l'horloge de six mois, on souscrirait un abonnement, et il │
    // │ n'apparaîtrait dans aucune période interrogeable.                     │
    // └──────────────────────────────────────────────────────────────────────┘
    const periodeParDefaut = { debut: null, fin: null };

    // Horloge au moment des achats : ils sont dans les trente derniers jours.
    const present = await stats.chiffreAffaires(periodeParDefaut, { clock: horloge });
    expect(
      montantDe((present.ok ? present.donnees : []) as never, 'achat_unitaire', 'EUR'),
    ).toBeGreaterThanOrEqual(499);

    // Horloge avancée d'un an : les mêmes achats sortent de la fenêtre.
    const futur = new FixedClock(new Date(T0.getTime() + 365 * 86_400_000).toISOString());
    const plusTard = await stats.chiffreAffaires(periodeParDefaut, { clock: futur });
    expect(
      montantDe((plusTard.ok ? plusTard.donnees : []) as never, 'achat_unitaire', 'EUR'),
    ).toBe(0);
  });

  it('applique un intervalle SEMI-OUVERT, pour ne jamais compter deux fois', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ [début, fin[ EST LA SEULE CONVENTION QUI PERMETTE D'INTERROGER DES    │
    // │ PÉRIODES SUCCESSIVES SANS DOUBLE COMPTAGE.                           │
    // │                                                                      │
    // │ Avec des bornes inclusives des deux côtés, une commande payée le 31   │
    // │ janvier à minuit pile figurerait dans le relevé de janvier ET dans    │
    // │ celui de février, et la somme des mois dépasserait l'année.           │
    // │                                                                      │
    // │ On éprouve les deux côtés sur le MÊME fait : la borne basse l'inclut, │
    // │ la borne haute l'exclut.                                             │
    // └──────────────────────────────────────────────────────────────────────┘
    const exact = { debut: AVANT.toISOString(), fin: T0.toISOString() };
    const inclus = await stats.chiffreAffaires(exact, { clock: horloge });
    expect(
      montantDe((inclus.ok ? inclus.donnees : []) as never, 'achat_unitaire', 'EUR'),
    ).toBeGreaterThanOrEqual(499);

    // La même seconde, prise comme borne HAUTE : le fait en sort.
    const exclu = await stats.chiffreAffaires(
      { debut: new Date(AVANT.getTime() - 86_400_000).toISOString(), fin: AVANT.toISOString() },
      { clock: horloge },
    );
    expect(montantDe((exclu.ok ? exclu.donnees : []) as never, 'achat_unitaire', 'EUR')).toBe(0);
  });

  it('ne lit JAMAIS l’heure directement dans le module de statistiques', () => {
    // Doublon volontaire de la règle générale du projet, appliqué au module qui
    // manipule le plus de dates.
    const source = readFileSync(
      join(process.cwd(), 'src', 'lib', 'admin', 'stats.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/new Date\(\s*\)|Date\.now\(\s*\)/);
    expect(source).toContain('clock.now()');
  });
});

describe('la route', () => {
  it('exige un administrateur et rend l’agrégat demandé', async () => {
    const reponse = await statsRoute(
      get('/api/admin/stats?agregat=abonnes', { jeton: editeur.accessToken }),
    );

    expect(reponse.status).toBe(200);
    expect((await corpsJson<{ agregat: string }>(reponse)).agregat).toBe('abonnes');
  });

  it('refuse une période invalide avec 400, et non 500', async () => {
    // Une erreur d'APPEL n'est pas une panne : la distinction compte pour qui
    // débogue une intégration.
    const reponse = await statsRoute(
      get(
        `/api/admin/stats?debut=${new Date(T0.getTime() - 5 * 365 * 86_400_000).toISOString()}&fin=${T0.toISOString()}`,
        { jeton: editeur.accessToken },
      ),
    );

    expect(reponse.status).toBe(400);
  });
});
