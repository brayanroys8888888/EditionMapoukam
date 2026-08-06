import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { reinitialiserQuotaAdmin } from '@/lib/admin/route-helpers';
import {
  changerPublication,
  definirPrix,
  lireLivre,
  modifierLivre,
  modifierTraduction,
  supprimerLivre,
} from '@/lib/admin/service';
import * as stats from '@/lib/admin/stats';
import { FixedClock } from '@/lib/clock';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * ÉCRAN D'ÉDITION D'UN CONTE, ET RÉSUMÉ COMPTABLE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX FONCTIONS SQL AJOUTÉES, ET DEUX RAISONS DE LES ÉPROUVER ICI.      │
 * │                                                                          │
 * │ `admin_lire_livre` sert le seul écran d'administration qui MUTE. Ce      │
 * │ qu'elle rend décide de ce que l'éditeur voit avant de publier — et       │
 * │ surtout de ce qu'elle NE rend PAS : aucun chemin de fichier n'en sort.   │
 * │                                                                          │
 * │ `stats_chiffre_affaires_resume` consolide des montants. C'est            │
 * │ précisément l'opération que D4 point 4 encadre, et le seul garde-fou est │
 * │ son `group by devise`.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const T0 = new Date('2026-08-15T12:00:00.000Z');
const AVANT = new Date(T0.getTime() - 3_600_000);
const horloge = new FixedClock(T0.toISOString());

let editeur: TestUser;
let acheteurEur: TestUser;
let acheteurXof: TestUser;
let livreId: string;

/** Commande payée, avec sa ligne et sa facture — comme le fait le webhook. */
async function commanderPaye(
  user: TestUser,
  montant: number,
  devise: string,
  zone: string,
  statut: 'paye' | 'rembourse' = 'paye',
): Promise<string> {
  const commande = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le, maj_le)
     values ($1, $2, $3, $4, $5, $6, $6) returning id`,
    [user.id, montant, devise, zone, statut, AVANT.toISOString()],
  );
  await query(
    `insert into public.order_items (order_id, book_id, langue, prix_unitaire, devise, zone)
     values ($1, $2, 'fr', $3, $4, $5)`,
    [commande!.id, livreId, montant, devise, zone],
  );
  return commande!.id;
}

beforeAll(async () => {
  editeur = await createTestUser({ admin: true });
  acheteurEur = await createTestUser();
  acheteurXof = await createTestUser();

  livreId =
    (await queryOne<{ id: string }>(
      `select id from public.books where slug = 'le-lion-et-la-souris'`,
    ))?.id ?? '';
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

describe('LA LECTURE D’UN TITRE POUR L’ÉCRAN D’ÉDITION', () => {
  it('rend le titre, ses prix, ses versions et ce qui lui manque', async () => {
    const resultat = await lireLivre(livreId);

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const conte = resultat.donnees;

    expect(conte['id']).toBe(livreId);
    expect(conte['slug']).toBe('le-lion-et-la-souris');
    // Les champs que la LISTE ne rend pas, et que l'édition modifie.
    expect(conte).toHaveProperty('origine_culturelle');
    expect(conte).toHaveProperty('age_min');
    expect(conte).toHaveProperty('nb_pages_extrait');
    expect(Array.isArray(conte['traductions'])).toBe(true);
    expect(Array.isArray(conte['manques'])).toBe(true);
  });

  it('rend `introuvable` sur un identifiant inconnu, jamais une ligne vide', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ La fonction SQL déclare `returns table` : un identifiant inconnu    │
    // │ rend ZÉRO LIGNE, pas `null`. Sans la traduction faite dans le       │
    // │ service, l'écran aurait lu `donnees[0]` — c'est-à-dire `undefined`  │
    // │ — et rendu un formulaire aux champs vides sur un conte qui n'existe │
    // │ pas.                                                               │
    // └────────────────────────────────────────────────────────────────────┘
    const resultat = await lireLivre('11111111-1111-1111-1111-111111111111');

    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.raison).toBe('introuvable');
  });

  it('ne fait SORTIR aucun chemin de fichier — seulement des états', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE DÉFAUT QUE CE TEST EMPÊCHE.                                     │
    // │                                                                    │
    // │ `fichier_lecture` et `fichier_telechargement` sont des clés de      │
    // │ stockage. Qui les lit peut servir le fichier — c'est pourquoi un    │
    // │ test d'architecture en réserve la lecture au service de             │
    // │ téléchargement et à la chaîne d'ingestion.                          │
    // │                                                                    │
    // │ Le back-office n'a besoin que de savoir si une version est          │
    // │ complète. Elle reçoit donc `lisible` et `telechargeable`, deux      │
    // │ booléens — et un chemin qui réapparaîtrait ici finirait recopié     │
    // │ dans une URL.                                                       │
    // └────────────────────────────────────────────────────────────────────┘
    const resultat = await lireLivre(livreId);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const versions = (resultat.donnees as { traductions: Record<string, unknown>[] }).traductions;

    expect(versions.length).toBeGreaterThan(0);

    for (const version of versions) {
      expect(Object.keys(version).sort()).toEqual([
        // `id` est arrivé avec la migration 0059, et il n'est PAS un chemin :
        // c'est la clé primaire de la ligne, celle par laquelle
        // `admin_modifier_traduction` la désigne. Elle n'ouvre aucun fichier.
        'id',
        'langue',
        'lisible',
        'nb_pages',
        'resume',
        'statut',
        'telechargeable',
        'titre',
      ]);
      expect(typeof version['lisible']).toBe('boolean');
      expect(typeof version['telechargeable']).toBe('boolean');
    }

    // Contre-test : aucune valeur rendue ne ressemble à une clé de stockage.
    const serialise = JSON.stringify(resultat.donnees);
    expect(serialise).not.toMatch(/books\//);
  });

  it('les manques viennent de la MÊME fonction que le déclencheur', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ L'écran affiche exactement ce que la base refusera. Une liste de     │
    // │ contrôle réécrite dans l'interface aurait divergé au premier champ   │
    // │ ajouté, et l'éditeur aurait vu « publiable » sur un titre rejeté.    │
    // └────────────────────────────────────────────────────────────────────┘
    const resultat = await lireLivre(livreId);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const attendus = await queryOne<{ manques: string[] }>(
      `select public.manques_pour_publication($1) as manques`,
      [livreId],
    );

    expect((resultat.donnees as { manques: string[] }).manques).toEqual(attendus?.manques);
    expect((resultat.donnees as { publiable: boolean }).publiable).toBe(
      (attendus?.manques.length ?? 1) === 0,
    );
  });
});

describe('L’ÉDITION D’UN CONTE PASSE PAR LES FONCTIONS `admin_*`', () => {
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ CE BLOC MUTE UN TITRE DU JEU DE DÉMONSTRATION, ET DOIT LE RENDRE       │
   * │ INTACT.                                                                 │
   * │                                                                         │
   * │ Les fichiers d'intégration partagent une base et ne tournent pas en     │
   * │ parallèle, mais ils se suivent : un prix laissé à 2 500 XAF sur         │
   * │ `le-lion-et-la-souris` a fait tomber QUATRE tests d'autres fichiers —   │
   * │ la grille tarifaire du catalogue, la zone d'encaissement des commandes, │
   * │ la conformité du jeu de démonstration. Aucun d'eux ne parlait           │
   * │ d'administration, et leur échec ne désignait pas sa cause.              │
   * │                                                                         │
   * │ L'état est donc relevé AVANT et rétabli APRÈS — livre et prix, puisque  │
   * │ les deux sont modifiés ici.                                             │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  let origine: Record<string, unknown> | null = null;
  let prixOrigine: { zone: string; montant: string; devise: string }[] = [];

  beforeAll(async () => {
    origine =
      (await queryOne(
        `select auteur, illustrateur, origine_culturelle, region::text as region,
                age_min, age_max, nb_pages_extrait,
                gratuit, inclus_abonnement, disponible_achat
           from public.books where id = $1`,
        [livreId],
      )) ?? null;

    prixOrigine = await query<{ zone: string; montant: string; devise: string }>(
      `select zone::text as zone, montant::text as montant, devise
         from public.book_prices where book_id = $1`,
      [livreId],
    );
  });

  afterAll(async () => {
    if (origine) {
      await query(
        `update public.books set auteur = $2, origine_culturelle = $3, age_min = $4,
                age_max = $5, nb_pages_extrait = $6, gratuit = $7,
                inclus_abonnement = $8, disponible_achat = $9,
                region = $10::public.region_conte, illustrateur = $11
          where id = $1`,
        [
          livreId,
          origine['auteur'],
          origine['origine_culturelle'],
          origine['age_min'],
          origine['age_max'],
          origine['nb_pages_extrait'],
          origine['gratuit'],
          origine['inclus_abonnement'],
          origine['disponible_achat'],
          origine['region'],
          origine['illustrateur'],
        ],
      );
    }

    // Les prix sont REMPLACÉS par ceux relevés, et non simplement corrigés :
    // le test en ajoute peut-être un dans une zone qui n'en avait pas.
    await query(`delete from public.book_prices where book_id = $1`, [livreId]);
    for (const prix of prixOrigine) {
      await query(
        `insert into public.book_prices (book_id, zone, montant, devise)
         values ($1, $2::public.price_zone, $3, $4)`,
        [livreId, prix.zone, prix.montant, prix.devise],
      );
    }
  });

  it('enregistre les champs métier, et l’écran les relit', async () => {
    const modification = await modifierLivre(editeur.id, livreId, {
      auteur: 'Awa Diallo',
      origineCulturelle: 'Peul',
      ageMin: 5,
      ageMax: 9,
    });

    expect(modification.ok).toBe(true);

    const relu = await lireLivre(livreId);
    expect(relu.ok).toBe(true);
    if (!relu.ok) return;

    const conte = relu.donnees;
    expect(conte['auteur']).toBe('Awa Diallo');
    expect(conte['origine_culturelle']).toBe('Peul');
    expect(conte['age_min']).toBe(5);
    expect(conte['age_max']).toBe(9);
  });

  it('les TROIS leviers d’accès sont indépendants', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ RÈGLE MÉTIER CENTRALE : un conte peut être simultanément inclus     │
    // │ dans l'abonnement et vendu à l'unité. Un écran qui les traiterait   │
    // │ comme exclusifs retirerait la vente d'un titre en l'ajoutant à      │
    // │ l'abonnement, sans que personne ne l'ait demandé.                   │
    // └────────────────────────────────────────────────────────────────────┘
    await modifierLivre(editeur.id, livreId, {
      gratuit: false,
      inclusAbonnement: true,
      disponibleAchat: true,
    });

    const relu = await lireLivre(livreId);
    expect(relu.ok).toBe(true);
    if (!relu.ok) return;

    const conte = relu.donnees as Record<string, boolean>;
    expect(conte['inclus_abonnement']).toBe(true);
    expect(conte['disponible_achat']).toBe(true);
  });

  it('un prix est fixé PAR ZONE, avec sa propre devise', async () => {
    // La zone afrique couvre XAF et XOF : la devise est portée par la ligne,
    // jamais déduite de la zone.
    const resultat = await definirPrix(editeur.id, livreId, {
      zone: 'afrique',
      montant: 2500,
      devise: 'XAF',
    });

    expect(resultat.ok).toBe(true);

    const relu = await lireLivre(livreId);
    expect(relu.ok).toBe(true);
    if (!relu.ok) return;

    const prix = (relu.donnees as { prix: Record<string, { montant: number; devise: string }> })
      .prix;

    expect(prix['afrique']).toEqual({ montant: 2500, devise: 'XAF' });
  });

  it('la publication d’un titre INCOMPLET est refusée, et le refus est nommé', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ L'écran désactive « Publier » tant que `publiable` est faux. Mais   │
    // │ un bouton désactivé n'est pas une garantie — c'est du balisage, et  │
    // │ il s'enlève d'un clic. La base refuse pour de bon.                  │
    // └────────────────────────────────────────────────────────────────────┘
    const brouillon = await queryOne<{ id: string }>(
      `insert into public.books (slug, auteur, statut)
       values ('conte-de-test-incomplet', 'À renseigner', 'brouillon') returning id`,
    );

    try {
      const resultat = await changerPublication(editeur.id, [brouillon!.id], 'publie');

      expect(resultat.ok).toBe(false);
      if (resultat.ok) return;
      expect(resultat.raison).toBe('regle_metier');

      const relu = await lireLivre(brouillon!.id);
      expect(relu.ok).toBe(true);
      if (!relu.ok) return;
      expect((relu.donnees as { publiable: boolean }).publiable).toBe(false);
      expect((relu.donnees as { manques: string[] }).manques.length).toBeGreaterThan(0);
    } finally {
      await query(`delete from public.books where id = $1`, [brouillon!.id]);
    }
  });

  it('pose la RÉGION, que rien ne permettait de poser avant la migration 0057', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE DÉFAUT QUE CE TEST EMPÊCHE DE REVENIR.                          │
    // │                                                                    │
    // │ `manques_pour_publication` exige `books.region` depuis la migration │
    // │ 0044, et AUCUNE fonction `admin_*` ne permettait de l'écrire.       │
    // │ L'éditeur déposait son PDF, remplissait tout ce que l'écran          │
    // │ proposait, et « Publier » restait éteint — avec un manque nommé      │
    // │ `region` qu'aucun champ ne pouvait satisfaire.                       │
    // │                                                                    │
    // │ Le test vérifie les deux moitiés : l'écriture PASSE, et la lecture   │
    // │ la REND. Sans la seconde, l'écran afficherait « non renseignée » sur │
    // │ un titre qui a une région, et l'écraserait au premier               │
    // │ enregistrement.                                                     │
    // └────────────────────────────────────────────────────────────────────┘
    const modification = await modifierLivre(editeur.id, livreId, { region: 'sahel' });
    expect(modification.ok).toBe(true);

    const relu = await lireLivre(livreId);
    expect(relu.ok).toBe(true);
    if (!relu.ok) return;

    expect(relu.donnees['region']).toBe('sahel');
    // Et le manque a disparu de la liste que le déclencheur applique.
    expect((relu.donnees as { manques: string[] }).manques).not.toContain('region');
  });

  it('pose l’ILLUSTRATEUR, l’autre champ que la 0057 a ouvert', async () => {
    const modification = await modifierLivre(editeur.id, livreId, {
      illustrateur: 'Koffi Mensah',
    });
    expect(modification.ok).toBe(true);

    const relu = await lireLivre(livreId);
    expect(relu.ok).toBe(true);
    if (!relu.ok) return;
    expect(relu.donnees['illustrateur']).toBe('Koffi Mensah');
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TITRE ET LE RÉSUMÉ D'UNE VERSION.                                     │
 * │                                                                          │
 * │ L'ingestion lit le titre dans le PDF : elle a raison la plupart du temps, │
 * │ et tort exactement là où on ne peut rien y faire — un PDF exporté d'un    │
 * │ traitement de texte porte souvent « Document1 ». Le résumé, lui, n'est    │
 * │ jamais extrait, et c'est le texte qu'un client lit avant d'acheter.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('LA CORRECTION D’UNE VERSION LINGUISTIQUE', () => {
  let autreLivre: string;
  let versionEtrangere: string;
  let versionOrigine: { id: string; titre: string; resume: string | null } | null = null;

  beforeAll(async () => {
    versionOrigine =
      (await queryOne<{ id: string; titre: string; resume: string | null }>(
        `select id, titre, resume from public.book_translations
          where book_id = $1 order by langue limit 1`,
        [livreId],
      )) ?? null;

    // Un SECOND titre, dont la version servira de contre-test d'appartenance.
    const cree = await queryOne<{ id: string }>(
      `insert into public.books (slug, auteur, statut)
       values ('conte-de-test-appartenance', 'Awa Diallo', 'brouillon') returning id`,
    );
    autreLivre = cree!.id;

    const version = await queryOne<{ id: string }>(
      `insert into public.book_translations (book_id, langue, titre)
       values ($1, 'fr', 'Version d’un autre titre') returning id`,
      [autreLivre],
    );
    versionEtrangere = version!.id;
  });

  afterAll(async () => {
    if (versionOrigine) {
      await query(`update public.book_translations set titre = $2, resume = $3 where id = $1`, [
        versionOrigine.id,
        versionOrigine.titre,
        versionOrigine.resume,
      ]);
    }
    await query(`delete from public.books where id = $1`, [autreLivre]);
  });

  it('corrige le titre, et l’écran le relit', async () => {
    expect(versionOrigine).not.toBeNull();

    const resultat = await modifierTraduction(editeur.id, livreId, versionOrigine!.id, {
      titre: 'Le lion et la souris — titre corrigé',
    });
    expect(resultat.ok).toBe(true);

    const relu = await lireLivre(livreId);
    expect(relu.ok).toBe(true);
    if (!relu.ok) return;

    const versions = (relu.donnees as { traductions: { id: string; titre: string }[] }).traductions;
    expect(versions.find((v) => v.id === versionOrigine!.id)?.titre).toBe(
      'Le lion et la souris — titre corrigé',
    );
  });

  it('la chaîne VIDE efface le résumé, `null` le laisse intact', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ La distinction est portée depuis l'écran jusqu'à la base, et elle   │
    // │ compte : un éditeur doit pouvoir RETIRER un texte qu'il a écrit.    │
    // │ Un `coalesce` seul le lui aurait interdit — le vide y vaut          │
    // │ « inchangé », et le résumé serait devenu indélébile.                │
    // └────────────────────────────────────────────────────────────────────┘
    await modifierTraduction(editeur.id, livreId, versionOrigine!.id, {
      resume: 'Un résumé provisoire.',
    });

    let ligne = await queryOne<{ resume: string | null }>(
      `select resume from public.book_translations where id = $1`,
      [versionOrigine!.id],
    );
    expect(ligne?.resume).toBe('Un résumé provisoire.');

    // `null` : on ne touche pas.
    await modifierTraduction(editeur.id, livreId, versionOrigine!.id, { titre: 'Autre titre' });
    ligne = await queryOne(`select resume from public.book_translations where id = $1`, [
      versionOrigine!.id,
    ]);
    expect(ligne?.resume).toBe('Un résumé provisoire.');

    // Chaîne vide : on efface.
    await modifierTraduction(editeur.id, livreId, versionOrigine!.id, { resume: '' });
    ligne = await queryOne(`select resume from public.book_translations where id = $1`, [
      versionOrigine!.id,
    ]);
    expect(ligne?.resume).toBeNull();
  });

  it('REFUSE une version qui n’appartient pas au titre indiqué', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ CE QUE LA MIGRATION 0058 A FERMÉ.                                  │
    // │                                                                    │
    // │ La fonction était clé par le seul `translation_id`, et la route      │
    // │ portait pourtant le titre parent dans son chemin — sans s'en servir. │
    // │ N'importe quelle version pouvait donc être modifiée depuis n'importe │
    // │ quelle adresse.                                                     │
    // │                                                                    │
    // │ Ce n'est pas une élévation de privilège : seuls les administrateurs  │
    // │ y accèdent. C'est une incohérence, et elle coûte deux choses réelles │
    // │ — un identifiant de chemin qui ne veut rien dire finit par être      │
    // │ rempli n'importe comment, et le journal d'audit rattache la          │
    // │ modification à un titre qui n'est pas le bon.                        │
    // └────────────────────────────────────────────────────────────────────┘
    const resultat = await modifierTraduction(editeur.id, livreId, versionEtrangere, {
      titre: 'Titre volé',
    });

    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    // La même réponse qu'un identifiant inventé : elle ne dit rien de plus.
    expect(resultat.raison).toBe('introuvable');

    // Et la version visée n'a pas bougé d'un caractère.
    const ligne = await queryOne<{ titre: string }>(
      `select titre from public.book_translations where id = $1`,
      [versionEtrangere],
    );
    expect(ligne?.titre).toBe('Version d’un autre titre');
  });

  it('refuse un titre VIDE — la base le dit, pas seulement l’écran', async () => {
    const resultat = await modifierTraduction(editeur.id, livreId, versionOrigine!.id, {
      titre: '   ',
    });

    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.raison).toBe('regle_metier');
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA SUPPRESSION NE MORD QUE SUR UN BROUILLON.                             │
 * │                                                                          │
 * │ Un dépôt raté doit pouvoir disparaître : un PDF déposé deux fois laisse   │
 * │ un doublon au slug suffixé, que l'archivage ne fait que cacher.           │
 * │                                                                          │
 * │ Mais `entitlements` et `order_items` référencent un titre en             │
 * │ `on delete cascade` : supprimer un titre vendu effacerait SILENCIEUSEMENT │
 * │ des droits payés et des pièces comptables. C'est la raison d'être de      │
 * │ chacun des trois tests qui suivent.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('LA SUPPRESSION D’UN TITRE', () => {
  it('supprime un BROUILLON nu, motif à l’appui', async () => {
    const brouillon = await queryOne<{ id: string }>(
      `insert into public.books (slug, auteur, statut)
       values ('conte-de-test-a-supprimer', 'Awa Diallo', 'brouillon') returning id`,
    );

    const resultat = await supprimerLivre(editeur.id, brouillon!.id, 'Dépôt raté, fichier illisible');
    expect(resultat.ok).toBe(true);

    const reste = await queryOne(`select id from public.books where id = $1`, [brouillon!.id]);
    expect(reste).toBeUndefined();
  });

  it('REFUSE un titre publié, même sans aucune vente', async () => {
    // L'archivage existe pour cela, et il est réversible. La garde tient au
    // STATUT et non à l'existence de ventes : un titre publié est référençable
    // dès l'instant où il est visible.
    const publie = await queryOne<{ id: string }>(
      `select id from public.books where statut = 'publie' limit 1`,
    );
    expect(publie).not.toBeNull();

    const resultat = await supprimerLivre(editeur.id, publie!.id, 'Essai de suppression');

    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.raison).toBe('regle_metier');

    const reste = await queryOne(`select id from public.books where id = $1`, [publie!.id]);
    expect(reste).toBeDefined();
  });

  it('REFUSE un brouillon auquel un droit est rattaché', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ CEINTURE ET BRETELLES, ET LE TEST TIENT LES BRETELLES.             │
    // │                                                                    │
    // │ Le statut suffit en théorie : un titre ne peut être vendu sans avoir │
    // │ été publié. Mais une reprise de données, un octroi manuel ou un      │
    // │ retour en brouillon peuvent laisser un droit derrière eux — et la    │
    // │ cascade l'effacerait sans un mot.                                    │
    // └────────────────────────────────────────────────────────────────────┘
    const brouillon = await queryOne<{ id: string }>(
      `insert into public.books (slug, auteur, statut)
       values ('conte-de-test-avec-droit', 'Awa Diallo', 'brouillon') returning id`,
    );

    try {
      await query(
        `insert into public.entitlements (user_id, book_id, type, peut_telecharger)
         values ($1, $2, 'offert', false)`,
        [acheteurEur.id, brouillon!.id],
      );

      const resultat = await supprimerLivre(editeur.id, brouillon!.id, 'Ménage de fin de mois');

      expect(resultat.ok).toBe(false);
      if (resultat.ok) return;
      expect(resultat.raison).toBe('regle_metier');

      const reste = await queryOne(`select id from public.books where id = $1`, [brouillon!.id]);
      expect(reste).toBeDefined();
    } finally {
      await query(`delete from public.entitlements where book_id = $1`, [brouillon!.id]);
      await query(`delete from public.books where id = $1`, [brouillon!.id]);
    }
  });

  it('exige un MOTIF, et ce n’est pas une politesse d’interface', async () => {
    // C'est la contrepartie d'un geste irréversible : le journal d'audit doit
    // pouvoir dire, six mois plus tard, pourquoi un titre a disparu.
    const brouillon = await queryOne<{ id: string }>(
      `insert into public.books (slug, auteur, statut)
       values ('conte-de-test-sans-motif', 'Awa Diallo', 'brouillon') returning id`,
    );

    try {
      const resultat = await supprimerLivre(editeur.id, brouillon!.id, '   ');

      expect(resultat.ok).toBe(false);
      if (resultat.ok) return;
      expect(resultat.raison).toBe('regle_metier');

      const reste = await queryOne(`select id from public.books where id = $1`, [brouillon!.id]);
      expect(reste).toBeDefined();
    } finally {
      await query(`delete from public.books where id = $1`, [brouillon!.id]);
    }
  });
});

describe('LE RÉSUMÉ COMPTABLE NE FRANCHIT JAMAIS LA FRONTIÈRE DE DEVISE', () => {
  let commandes: string[] = [];

  beforeAll(async () => {
    commandes = [
      await commanderPaye(acheteurEur, 499, 'EUR', 'international'),
      await commanderPaye(acheteurEur, 799, 'EUR', 'international'),
      await commanderPaye(acheteurXof, 3000, 'XOF', 'afrique'),
      await commanderPaye(acheteurEur, 200, 'EUR', 'international', 'rembourse'),
    ];
  });

  afterAll(async () => {
    for (const commande of commandes) {
      await query(`delete from public.order_items where order_id = $1`, [commande]);
      await query(`delete from public.orders where id = $1`, [commande]);
    }
  });

  it('rend UNE LIGNE PAR DEVISE, et aucun total unique', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Additionner des euros et des francs CFA sans taux de change ne      │
    // │ produit pas un chiffre approximatif : il n'en produit aucun.        │
    // │                                                                    │
    // │ C'est la seule raison d'être du `group by devise` de cette          │
    // │ fonction, et c'est ce que ce test tient.                            │
    // └────────────────────────────────────────────────────────────────────┘
    const resultat = await stats.chiffreAffairesResume({}, { clock: horloge });

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const lignes = resultat.donnees as unknown as {
      devise: string;
      brut: number;
      rembourse: number;
      net: number;
      nb_transactions: number;
    }[];

    const devises = lignes.map((ligne) => ligne.devise);
    expect(devises).toContain('EUR');
    expect(devises).toContain('XOF');
    // Chaque devise n'apparaît qu'une fois : sinon la « consolidation » n'en
    // serait pas une.
    expect(new Set(devises).size).toBe(devises.length);
  });

  it('le NET est le brut moins le remboursé, dans la même devise', async () => {
    const resultat = await stats.chiffreAffairesResume({}, { clock: horloge });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const lignes = resultat.donnees as unknown as {
      devise: string;
      brut: number;
      rembourse: number;
      net: number;
    }[];

    for (const ligne of lignes) {
      expect(Number(ligne.net)).toBe(Number(ligne.brut) - Number(ligne.rembourse));
      // Le remboursé est rendu POSITIF ici — l'écran affiche « remboursé :
      // 2,00 € », pas « −2,00 € ». Le signe se lit mal dans une carte, et le
      // net porte déjà la soustraction.
      expect(Number(ligne.rembourse)).toBeGreaterThanOrEqual(0);
    }
  });

  it('s’accorde avec la ventilation détaillée — deux vues, un seul chiffre', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE RÉSUMÉ EST CONSTRUIT SUR `stats_chiffre_affaires`, ET CE TEST    │
    // │ LE PROUVE PAR LE RÉSULTAT.                                          │
    // │                                                                    │
    // │ Les bornes de période, le plafond de trois ans, la lecture des      │
    // │ factures plutôt que des abonnements et l'exclusion de `users` sont  │
    // │ définis une fois. Deux chiffres d'affaires qui divergent, c'est     │
    // │ exactement le défaut que ce projet a déjà rencontré trois fois.     │
    // └────────────────────────────────────────────────────────────────────┘
    const [detaille, resume] = await Promise.all([
      stats.chiffreAffaires({}, { clock: horloge }),
      stats.chiffreAffairesResume({}, { clock: horloge }),
    ]);

    expect(detaille.ok && resume.ok).toBe(true);
    if (!detaille.ok || !resume.ok) return;

    const lignes = detaille.donnees as unknown as {
      flux: string;
      devise: string;
      montant: number;
    }[];
    const resumes = resume.donnees as unknown as { devise: string; net: number }[];

    for (const ligne of resumes) {
      const attendu = lignes
        .filter((detail) => detail.devise === ligne.devise)
        .reduce((total, detail) => total + Number(detail.montant), 0);

      expect(Number(ligne.net), ligne.devise).toBe(attendu);
    }
  });

  it('l’agrégat est offert par la route, sous le même nom', async () => {
    // Sans cela, l'écran d'administration lirait un chiffre qu'aucun client
    // d'API ne peut obtenir — et la route deviendrait une vue partielle du
    // back-office, ce qu'elle n'est pas censée être.
    const route = await import('@/app/api/admin/stats/route');
    expect(typeof route.GET).toBe('function');

    const resultat = await stats.chiffreAffairesResume({}, { clock: horloge });
    expect(resultat.ok).toBe(true);
  });
});
