import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appliquerEvenement, abonnementCourant } from '@/lib/subscriptions/handlers';
import { getAccess } from '@/lib/access/engine';
import { FixedClock } from '@/lib/clock';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * L'ÉTANCHÉITÉ DES DEUX ABONNEMENTS — §3.6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER EXISTE PARCE QUE LA CONFUSION SERAIT SILENCIEUSE.             │
 * │                                                                          │
 * │ Deux abonnements, un seul compte, une seule table. Le jour où le          │
 * │ `and s.domaine = p_domaine` disparaîtrait de `abonnement_ouvre_droit`,    │
 * │ RIEN ne casserait : les écrans continueraient de s'afficher, les tunnels  │
 * │ de fonctionner, les webhooks d'accorder. Simplement, un adhérent de       │
 * │ l'association lirait le catalogue entier sans l'avoir payé — et           │
 * │ réciproquement.                                                          │
 * │                                                                          │
 * │ C'est le pendant exact du bug que CLAUDE.md nomme déjà pour l'abonnement  │
 * │ expiré : une frontière entre deux modèles économiques ne se vérifie pas   │
 * │ à l'œil, elle se vérifie par un test dédié.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CHAQUE SENS EST ÉPROUVÉ SÉPARÉMENT.                                      │
 * │                                                                          │
 * │ « Lecture n'ouvre pas l'association » et « association n'ouvre pas la     │
 * │ lecture » sont deux affirmations, pas une. Une implémentation qui         │
 * │ filtrerait sur un domaine écrit en dur passerait l'une et raterait        │
 * │ l'autre, et un test qui n'en jouerait qu'un seul la déclarerait saine.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Comme partout ailleurs, le temps est un PARAMÈTRE : `FixedClock` pour les
 * transitions, `p_at` pour les deux moteurs de droits. Rien n'attend.
 */
let lecteur: TestUser; // abonné LECTURE seulement
let adherent: TestUser; // abonné ASSOCIATION seulement
let cumul: TestUser; // les deux à la fois

/** Un titre du jeu de démonstration inclus dans l'abonnement de lecture. */
let livreAbonnement: string;

/** Un contenu associatif RÉSERVÉ, fabriqué puis défait par ce fichier. */
const SLUG_RESERVE = 'test-etancheite-reserve';

const DEPART = new Date('2026-07-29T12:00:00Z');

/** Avance d'un nombre de jours depuis le départ. */
function jours(n: number): Date {
  return new Date(DEPART.getTime() + n * 86_400_000);
}

async function souscrire(utilisateur: TestUser, domaine: 'lecture' | 'association'): Promise<void> {
  const resultat = await appliquerEvenement(
    {
      userId: utilisateur.id,
      domaine,
      evenement: 'souscrit',
      offre: 'mensuel',
      zone: 'international',
      devise: 'EUR',
      montant: domaine === 'lecture' ? 799 : 400,
    },
    { clock: new FixedClock(DEPART) },
  );
  expect(resultat.ok).toBe(true);
}

/** Le verdict de la base sur le contenu réservé, à l'instant demandé. */
async function verdictAssociation(
  userId: string,
  at: Date,
): Promise<{ can_read: boolean; reason: string } | undefined> {
  return await queryOne<{ can_read: boolean; reason: string }>(
    'select can_read, reason from public.access_for_association($1, $2, $3)',
    [userId, [SLUG_RESERVE], at.toISOString()],
  );
}

beforeAll(async () => {
  [lecteur, adherent, cumul] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);

  const livre = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'le-lion-et-la-souris'`,
  );
  if (!livre) throw new Error('Jeu de démonstration absent : lancez `npm run db:seed`.');
  livreAbonnement = livre.id;

  /*
   * Un contenu RÉSERVÉ, que le jeu de démonstration ne porte pas : les cinq
   * contenus semés sont les anciens articles du blog, repris en accès libre.
   * Un test qui se contenterait d'eux ne verrouillerait jamais rien, et
   * passerait donc même si `access_for_association` répondait toujours `true`.
   */
  await query(
    `insert into public.association_contents (slug, categorie, acces, statut, publie_le)
     values ($1, 'vie-associative', 'abonnes', 'publie', public.app_now())
     on conflict (slug) do update set acces = 'abonnes', statut = 'publie'`,
    [SLUG_RESERVE],
  );
  await query(
    `insert into public.association_content_translations (content_id, langue, titre, chapeau, corps)
     select id, 'fr', 'Contenu réservé de test', 'Chapeau public.',
            '[{"titre": "Section", "paragraphes": ["Texte réservé."]}]'::jsonb
     from public.association_contents where slug = $1
     on conflict (content_id, langue) do nothing`,
    [SLUG_RESERVE],
  );

  await souscrire(lecteur, 'lecture');
  await souscrire(adherent, 'association');
  await souscrire(cumul, 'lecture');
  await souscrire(cumul, 'association');
});

afterAll(async () => {
  // Le jeu de démonstration est PARTAGÉ : ce fichier le rend comme il l'a
  // trouvé, faute de quoi il ferait tomber des fichiers qui ne parlent pas de
  // lui. Les traductions suivent en cascade.
  await query('delete from public.association_contents where slug = $1', [SLUG_RESERVE]);
  await deleteTestUser(lecteur);
  await deleteTestUser(adherent);
  await deleteTestUser(cumul);
  await closePool();
});

describe('un abonnement de LECTURE n’ouvre pas l’association', () => {
  it('ouvre bien le catalogue', async () => {
    const acces = await getAccess(lecteur.id, livreAbonnement, { at: jours(1) });
    expect(acces.canRead).toBe(true);
    expect(acces.reason).toBe('subscription');
  });

  it('laisse le contenu réservé de l’association verrouillé', async () => {
    const verdict = await verdictAssociation(lecteur.id, jours(1));
    expect(verdict?.can_read).toBe(false);
    // `preview` et non `none` : le contenu EXISTE, son titre et son chapeau se
    // lisent ; c'est le corps qui manque. Un `none` annoncerait un brouillon,
    // et enverrait l'éditeur chercher un défaut de publication inexistant.
    expect(verdict?.reason).toBe('preview');
  });

  it('n’a aucun abonnement dans le domaine associatif', async () => {
    expect(await abonnementCourant(lecteur.id, 'association')).toBeNull();
    expect(await abonnementCourant(lecteur.id, 'lecture')).not.toBeNull();
  });
});

describe('un abonnement ASSOCIATION n’ouvre pas le catalogue', () => {
  it('ouvre bien le contenu réservé', async () => {
    const verdict = await verdictAssociation(adherent.id, jours(1));
    expect(verdict?.can_read).toBe(true);
    expect(verdict?.reason).toBe('subscription');
  });

  it('laisse le titre du catalogue fermé', async () => {
    const acces = await getAccess(adherent.id, livreAbonnement, { at: jours(1) });
    expect(acces.canRead).toBe(false);
    expect(acces.reason).not.toBe('subscription');
  });

  it('n’accorde évidemment aucun téléchargement', async () => {
    // §3.2 : le téléchargement n'est accordé que par un achat. Le second
    // abonnement n'ouvre pas une exception à cette règle, il ouvre un autre
    // contenu.
    const acces = await getAccess(adherent.id, livreAbonnement, { at: jours(1) });
    expect(acces.canDownload).toBe(false);
  });
});

describe('les deux abonnements se cumulent sur un même compte', () => {
  it('ouvre le catalogue ET l’association', async () => {
    const acces = await getAccess(cumul.id, livreAbonnement, { at: jours(1) });
    expect(acces.canRead).toBe(true);

    const verdict = await verdictAssociation(cumul.id, jours(1));
    expect(verdict?.can_read).toBe(true);
  });

  it('tient deux lignes vivantes, une par domaine', async () => {
    const lignes = await query<{ domaine: string }>(
      `select domaine from public.subscriptions
        where user_id = $1 and statut in ('essai', 'actif', 'impaye')`,
      [cumul.id],
    );
    // Le tri est fait ici, et non en SQL : `order by domaine` classerait selon
    // l'ordre de DÉCLARATION du type énuméré, qui n'a rien d'alphabétique et
    // que rien n'oblige à rester stable.
    expect(lignes.map((ligne) => ligne.domaine).sort()).toEqual(['association', 'lecture']);
  });

  it('n’en laisse jamais deux vivantes dans le MÊME domaine', async () => {
    /*
     * L'index unique partiel `(user_id, domaine)` est ce qui l'empêche, et non
     * la bonne volonté des appelants. Le vérifier ici, plutôt que de faire
     * confiance à la migration, est le seul moyen de voir le jour où
     * quelqu'un le rétrécirait à `user_id` — ou l'élargirait à rien du tout.
     */
    await expect(
      query(
        `insert into public.subscriptions
           (user_id, domaine, statut, offre, zone, devise, montant, debut_periode, fin_periode)
         values ($1, 'lecture', 'actif', 'mensuel', 'international', 'EUR', 799,
                 public.app_now(), public.app_now() + interval '1 month')`,
        [cumul.id],
      ),
    ).rejects.toThrow();
  });
});

describe('un abonnement associatif échu referme l’association', () => {
  it('rend le contenu réservé à l’état d’aperçu', async () => {
    /*
     * Deux mois après la souscription, la période mensuelle est close et aucun
     * renouvellement n'est venu. Le scénario se joue en déplaçant l'instant
     * passé à la fonction, jamais en attendant — comme pour le catalogue.
     */
    const verdict = await verdictAssociation(adherent.id, jours(62));
    expect(verdict?.can_read).toBe(false);
    expect(verdict?.reason).toBe('preview');
  });

  it('referme chaque domaine pour son propre compte', async () => {
    // L'échéance d'un domaine ne touche pas l'autre : le compte cumulé porte
    // deux périodes, et chacune s'achève pour elle-même.
    const verdict = await verdictAssociation(cumul.id, jours(62));
    expect(verdict?.can_read).toBe(false);

    const acces = await getAccess(cumul.id, livreAbonnement, { at: jours(62) });
    expect(acces.canRead).toBe(false);
  });
});
