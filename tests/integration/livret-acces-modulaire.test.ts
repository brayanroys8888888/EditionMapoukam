import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * L'ACCÈS À UN LIVRET PÉDAGOGIQUE EST MODULAIRE, TITRE PAR TITRE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST ÉPROUVÉ ICI, ET QUI NE L'ÉTAIT NULLE PART.                    │
 * │                                                                          │
 * │ Décision de l'éditeur du 2 septembre 2026 : un livret pédagogique peut   │
 * │ être offert, inclus dans l'abonnement, vendu à l'unité — au choix, et    │
 * │ pour chaque titre séparément. C'est l'arbitrage 1 du document            │
 * │ `docs/ajout-livret-pedagogique-2026-09-02.md`, resté ouvert jusque-là.   │
 * │                                                                          │
 * │ La bonne nouvelle est qu'aucun code n'était à écrire : `access_for_books`│
 * │ ne lit JAMAIS `type_document`. Mais « le code ne fait rien de spécial »  │
 * │ est une affirmation, pas une garantie — et c'est exactement le genre     │
 * │ d'affirmation qu'un `if` ajouté six mois plus tard rendrait fausse sans  │
 * │ qu'aucun test ne proteste, puisque tous les autres portent sur des       │
 * │ contes.                                                                  │
 * │                                                                          │
 * │ Ce fichier transforme donc la décision en contrainte : les MÊMES         │
 * │ drapeaux donnent les MÊMES droits, que le titre soit un conte ou un      │
 * │ livret. Rendre l'accès des livrets « spécial » fera échouer ce test.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER MUTE LE CORPUS, ET LE REND INTACT.                            │
 * │                                                                          │
 * │ Les tests d'intégration partagent une base et tournent en série. Un      │
 * │ titre laissé en `livret_pedagogique`, ou laissé `gratuit`, ferait tomber │
 * │ des fichiers qui ne parlent pas de lui — et le message ne dirait pas un  │
 * │ mot de livrets. Les valeurs d'origine sont relues avant toute écriture,  │
 * │ et rétablies dans `afterAll`.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface Cobaye {
  id: string;
  slug: string;
  type_document: string;
  gratuit: boolean;
  inclus_abonnement: boolean;
  disponible_achat: boolean;
}

interface Verdict {
  can_read: boolean;
  can_download: boolean;
  reason: string;
}

/** Le titre emprunté le temps de ce fichier, et son état d'origine. */
let cobaye: Cobaye | undefined;
let abonne: TestUser;

/** Personne. `access_for_books` prend `null` pour un visiteur non connecte. */
const VISITEUR = null;

/** Les huit combinaisons des trois leviers. Aucune n'est interdite. */
const COMBINAISONS = [
  { gratuit: false, inclus_abonnement: false, disponible_achat: false },
  { gratuit: false, inclus_abonnement: false, disponible_achat: true },
  { gratuit: false, inclus_abonnement: true, disponible_achat: false },
  { gratuit: false, inclus_abonnement: true, disponible_achat: true },
  { gratuit: true, inclus_abonnement: false, disponible_achat: false },
  { gratuit: true, inclus_abonnement: false, disponible_achat: true },
  { gratuit: true, inclus_abonnement: true, disponible_achat: false },
  { gratuit: true, inclus_abonnement: true, disponible_achat: true },
] as const;

async function poser(
  type: 'conte' | 'livret_pedagogique',
  leviers: { gratuit: boolean; inclus_abonnement: boolean; disponible_achat: boolean },
): Promise<void> {
  await query(
    `update public.books
        set type_document    = $2::public.document_type,
            gratuit          = $3,
            inclus_abonnement = $4,
            disponible_achat  = $5
      where id = $1`,
    [
      cobaye?.id,
      type,
      leviers.gratuit,
      leviers.inclus_abonnement,
      leviers.disponible_achat,
    ],
  );
}

async function verdict(utilisateur: string | null): Promise<Verdict> {
  const ligne = await queryOne<Verdict>(
    `select a.can_read, a.can_download, a.reason::text as reason
       from public.access_for_books($1, array[$2::uuid]) a`,
    [utilisateur, cobaye?.id],
  );
  if (!ligne) throw new Error('Le moteur de droits n’a rendu aucune ligne.');
  return ligne;
}

beforeAll(async () => {
  cobaye = await queryOne<Cobaye>(
    `select b.id, b.slug, b.type_document::text as type_document,
            b.gratuit, b.inclus_abonnement, b.disponible_achat
       from public.books b
      where b.statut = 'publie'
      order by b.slug
      limit 1`,
  );

  if (!cobaye) throw new Error('Corpus vide : ce fichier ne prouverait rien.');

  abonne = await createTestUser();
  await query(
    `insert into public.subscriptions
       (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
     values ($1, 'mensuel', 'actif',
             public.app_now() - interval '30 days',
             public.app_now() + interval '30 days',
             'international', 'EUR', 799)`,
    [abonne.id],
  );
});

afterAll(async () => {
  if (cobaye) {
    await query(
      `update public.books
          set type_document     = $2::public.document_type,
              gratuit           = $3,
              inclus_abonnement = $4,
              disponible_achat  = $5
        where id = $1`,
      [
        cobaye.id,
        cobaye.type_document,
        cobaye.gratuit,
        cobaye.inclus_abonnement,
        cobaye.disponible_achat,
      ],
    );
  }
  if (abonne) await deleteTestUser(abonne);
  await closePool();
});

describe('LE MOTEUR DE DROITS IGNORE LE SUPPORT', () => {
  it('rend le MÊME verdict sur un livret et sur un conte, pour les huit combinaisons', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ C'EST LE TEST QUI PORTE LA DÉCISION.                               │
    // │                                                                    │
    // │ On ne vérifie pas une table de vérité écrite à la main — elle       │
    // │ recopierait la règle, et une règle recopiée finit par diverger de   │
    // │ celle qu'elle décrit. On vérifie une ÉGALITÉ : quoi que le moteur   │
    // │ décide, il doit le décider pareil des deux côtés.                   │
    // └────────────────────────────────────────────────────────────────────┘
    for (const leviers of COMBINAISONS) {
      await poser('conte', leviers);
      const commeConte = {
        visiteur: await verdict(VISITEUR),
        abonne: await verdict(abonne.id),
      };

      await poser('livret_pedagogique', leviers);
      const commeLivret = {
        visiteur: await verdict(VISITEUR),
        abonne: await verdict(abonne.id),
      };

      expect(commeLivret, `combinaison ${JSON.stringify(leviers)}`).toEqual(commeConte);
    }
  });

  it('donne bien des verdicts DIFFÉRENTS selon les leviers — le contre-test', async () => {
    // Sans celui-ci, le test précédent passerait sur un moteur qui refuserait
    // tout : deux verdicts identiques parce que rien n'ouvre jamais rien.
    await poser('livret_pedagogique', {
      gratuit: false,
      inclus_abonnement: false,
      disponible_achat: true,
    });
    const ferme = await verdict(abonne.id);

    await poser('livret_pedagogique', {
      gratuit: false,
      inclus_abonnement: true,
      disponible_achat: true,
    });
    const ouvert = await verdict(abonne.id);

    expect(ferme.can_read).toBe(false);
    expect(ouvert.can_read).toBe(true);
  });
});

describe('LES TROIS LEVIERS SONT INDÉPENDANTS SUR UN LIVRET', () => {
  it('offert : lisible sans compte, et JAMAIS téléchargeable pour autant', async () => {
    // La confusion que `CLAUDE.md` appelle « le bug classique de ce type de
    // plateforme » : gratuit ouvre la LECTURE, jamais le téléchargement.
    await poser('livret_pedagogique', {
      gratuit: true,
      inclus_abonnement: false,
      disponible_achat: false,
    });

    const anonyme = await verdict(VISITEUR);
    expect(anonyme.can_read).toBe(true);
    expect(anonyme.can_download).toBe(false);
  });

  it('inclus dans l’abonnement : lisible par l’abonné, pas par le visiteur', async () => {
    await poser('livret_pedagogique', {
      gratuit: false,
      inclus_abonnement: true,
      disponible_achat: false,
    });

    expect((await verdict(abonne.id)).can_read).toBe(true);
    expect((await verdict(VISITEUR)).can_read).toBe(false);
  });

  it('inclus dans l’abonnement n’a JAMAIS donné le téléchargement', async () => {
    // Règle métier centrale (§3.1) : seul un achat ouvre le fichier. Elle vaut
    // pour un livret comme pour un conte, et c'est ici qu'on le fixe.
    await poser('livret_pedagogique', {
      gratuit: false,
      inclus_abonnement: true,
      disponible_achat: true,
    });

    expect((await verdict(abonne.id)).can_download).toBe(false);
  });

  it('vendu à l’unité sans être dans l’abonnement : fermé à l’abonné', async () => {
    // C'est tout l'objet de la modularité : l'éditeur peut réserver un livret
    // à la vente, et l'abonnement ne l'ouvre pas pour autant.
    await poser('livret_pedagogique', {
      gratuit: false,
      inclus_abonnement: false,
      disponible_achat: true,
    });

    expect((await verdict(abonne.id)).can_read).toBe(false);
  });
});

describe('L’ÉDITEUR PEUT RETROUVER SES LIVRETS POUR EN RÉGLER L’ACCÈS', () => {
  it('`admin_lister_livres` isole un support, et son total ne compte que lui', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ UNE CAPACITÉ QU'ON NE PEUT PAS ATTEINDRE N'EST PAS UNE CAPACITÉ.   │
    // │                                                                    │
    // │ Les leviers se posent sur la fiche d'édition, et la liste du       │
    // │ back-office est le seul chemin vers cette fiche. Le filtre descend  │
    // │ jusqu'à la fonction SQL : filtrer la page reçue laisserait          │
    // │ `total_lignes` compter tout le catalogue, et la pagination          │
    // │ promettrait des pages de livrets qui n'existent pas.                │
    // └────────────────────────────────────────────────────────────────────┘
    await poser('livret_pedagogique', {
      gratuit: false,
      inclus_abonnement: true,
      disponible_achat: false,
    });

    const livrets = await query<{
      id: string;
      type_document: string;
      inclus_abonnement: boolean;
      total_lignes: string;
    }>(`select * from public.admin_lister_livres(null, 1, 100, 'livret_pedagogique')`);

    expect(livrets.length).toBeGreaterThan(0);
    for (const ligne of livrets) {
      expect(ligne.type_document).toBe('livret_pedagogique');
    }
    expect(livrets.some((ligne) => ligne.id === cobaye?.id)).toBe(true);
    expect(Number(livrets[0]?.total_lignes)).toBe(livrets.length);

    // Et le support est rendu, sans quoi la liste ne saurait pas l'afficher.
    const cible = livrets.find((ligne) => ligne.id === cobaye?.id);
    expect(cible?.inclus_abonnement).toBe(true);
  });

  it('sans filtre, la liste rend TOUT le catalogue — le contre-test', async () => {
    const tout = await query<{ total_lignes: string }>(
      `select * from public.admin_lister_livres(null, 1, 100, null)`,
    );
    const livrets = await query(
      `select * from public.admin_lister_livres(null, 1, 100, 'livret_pedagogique')`,
    );

    expect(tout.length).toBeGreaterThan(livrets.length);
  });

  it('un support inconnu rend une liste vide, il ne fait pas tomber l’écran', async () => {
    // La comparaison passe par `text` : un cast vers l'énumération lèverait une
    // 22P02 sur une URL bricolée, que l'écran traduirait en panne interne.
    const rien = await query(
      `select * from public.admin_lister_livres(null, 1, 100, 'affiche')`,
    );

    expect(rien).toEqual([]);
  });
});
