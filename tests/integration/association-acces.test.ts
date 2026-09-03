import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appliquerEvenement } from '@/lib/subscriptions/handlers';
import { lireContenuAssociatif, lireContenusAssociatifs } from '@/lib/association/service';
import { FixedClock } from '@/lib/clock';

import { closePool, query } from '../helpers/db';
import { anonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * L'ACCÈS AU CONTENU ASSOCIATIF — §3.6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CORPS N'EST PAS CACHÉ PAR UNE POLITIQUE : IL N'EST PAS ACCORDÉ.       │
 * │                                                                          │
 * │ La colonne `corps` est simplement absente du `grant select (...)` fait à  │
 * │ `anon` et `authenticated`. Ce n'est pas un détail d'implémentation, c'est │
 * │ LA protection : une politique RLS mal écrite laisse filtrer une ligne,    │
 * │ un privilège absent fait échouer la requête entière, avec un code         │
 * │ d'erreur, avant même qu'une ligne soit lue.                              │
 * │                                                                          │
 * │ D'où le test le plus important de ce fichier : on demande `corps` avec la │
 * │ clé publique, et on exige que la base REFUSE — pas qu'elle rende vide.    │
 * │ Une réponse vide se confondrait avec un contenu sans texte.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS CONTENUS FABRIQUÉS, PARCE QUE LE JEU DE DÉMONSTRATION N'EN PORTE   │
 * │ QU'UNE SORTE.                                                            │
 * │                                                                          │
 * │ Les cinq contenus semés sont les anciens articles du blog, repris en      │
 * │ accès LIBRE. Un test qui s'en contenterait ne verrouillerait jamais rien  │
 * │ et passerait même si le verrou avait disparu.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const LIBRE = 'test-acces-libre';
const RESERVE = 'test-acces-reserve';
const BROUILLON = 'test-acces-brouillon';
const FABRIQUES = [LIBRE, RESERVE, BROUILLON];

let visiteur: TestUser; // connecté, aucun abonnement
let adherent: TestUser; // abonnement ASSOCIATION
let administrateur: TestUser;

const DEPART = new Date('2026-07-29T12:00:00Z');
const LENDEMAIN = new Date('2026-07-30T12:00:00Z');

async function fabriquerContenu(
  slug: string,
  acces: 'libre' | 'abonnes',
  statut: 'publie' | 'brouillon',
): Promise<void> {
  await query(
    `insert into public.association_contents (slug, categorie, acces, statut, publie_le)
     values ($1, 'vie-associative', $2::public.association_access,
             $3::public.translation_status,
             case when $3::text = 'publie' then public.app_now() end)
     on conflict (slug) do update set acces = excluded.acces, statut = excluded.statut`,
    [slug, acces, statut],
  );
  await query(
    `insert into public.association_content_translations (content_id, langue, titre, chapeau, corps)
     select id, 'fr', $2, 'Ce que tout le monde peut lire.',
            '[{"titre": "Section", "paragraphes": ["Le texte réservé."]}]'::jsonb
     from public.association_contents where slug = $1
     on conflict (content_id, langue) do update set corps = excluded.corps`,
    [slug, `Contenu ${slug}`],
  );
}

beforeAll(async () => {
  [visiteur, adherent, administrateur] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser({ admin: true }),
  ]);

  await fabriquerContenu(LIBRE, 'libre', 'publie');
  await fabriquerContenu(RESERVE, 'abonnes', 'publie');
  await fabriquerContenu(BROUILLON, 'libre', 'brouillon');

  const souscription = await appliquerEvenement(
    {
      userId: adherent.id,
      domaine: 'association',
      evenement: 'souscrit',
      offre: 'mensuel',
      zone: 'international',
      devise: 'EUR',
      montant: 400,
    },
    { clock: new FixedClock(DEPART) },
  );
  expect(souscription.ok).toBe(true);
});

afterAll(async () => {
  await query('delete from public.association_contents where slug = any($1)', [FABRIQUES]);
  await deleteTestUser(visiteur);
  await deleteTestUser(adherent);
  await deleteTestUser(administrateur);
  await closePool();
});

describe('un visiteur non connecté', () => {
  it('lit les contenus libres, et voit les réservés annoncés', async () => {
    const liste = await lireContenusAssociatifs(null, { at: LENDEMAIN });
    const parSlug = new Map(liste.map((contenu) => [contenu.slug, contenu]));

    expect(parSlug.get(LIBRE)?.peutLire).toBe(true);
    expect(parSlug.get(LIBRE)?.motif).toBe('free');

    // Le réservé FIGURE dans la liste : c'est ainsi qu'on annonce ce que
    // l'adhésion contient. Il est annoncé, pas ouvert.
    expect(parSlug.get(RESERVE)?.peutLire).toBe(false);
    expect(parSlug.get(RESERVE)?.motif).toBe('preview');
    expect(parSlug.get(RESERVE)?.titre).toBeTruthy();
  });

  it('ne voit pas un brouillon', async () => {
    const liste = await lireContenusAssociatifs(null, { at: LENDEMAIN });
    expect(liste.map((contenu) => contenu.slug)).not.toContain(BROUILLON);

    expect(await lireContenuAssociatif(null, BROUILLON, { at: LENDEMAIN })).toBeNull();
  });

  it('reçoit le texte d’un contenu libre', async () => {
    const contenu = await lireContenuAssociatif(null, LIBRE, { at: LENDEMAIN });
    expect(contenu?.peutLire).toBe(true);
    expect(contenu?.sections?.length).toBeGreaterThan(0);
  });

  it('reçoit la fiche d’un contenu réservé, MAIS PAS SON TEXTE', async () => {
    const contenu = await lireContenuAssociatif(null, RESERVE, { at: LENDEMAIN });
    expect(contenu).not.toBeNull();
    expect(contenu?.peutLire).toBe(false);
    // `null`, et non `[]` : « verrouillé » ne se confond pas avec « publié
    // sans texte », et l'écran n'affiche le mur d'adhésion que pour le premier.
    expect(contenu?.sections).toBeNull();
    expect(contenu?.chapeau).not.toBe('');
  });
});

describe('un compte connecté SANS abonnement associatif', () => {
  it('ne lit pas davantage qu’un visiteur', async () => {
    const contenu = await lireContenuAssociatif(visiteur.id, RESERVE, { at: LENDEMAIN });
    expect(contenu?.peutLire).toBe(false);
    expect(contenu?.motif).toBe('preview');
    expect(contenu?.sections).toBeNull();
  });
});

describe('un adhérent de l’association', () => {
  it('lit le contenu réservé', async () => {
    const contenu = await lireContenuAssociatif(adherent.id, RESERVE, { at: LENDEMAIN });
    expect(contenu?.peutLire).toBe(true);
    expect(contenu?.motif).toBe('subscription');
    expect(contenu?.sections?.length).toBeGreaterThan(0);
  });

  it('ne voit toujours pas les brouillons', async () => {
    expect(await lireContenuAssociatif(adherent.id, BROUILLON, { at: LENDEMAIN })).toBeNull();
  });
});

describe('un administrateur', () => {
  it('relit un brouillon, et c’est le seul à le pouvoir', async () => {
    // Le motif dit `granted` et non `free` : la lecture est un pouvoir du rôle,
    // pas une propriété du contenu. La nuance compte le jour où l'on cherche
    // pourquoi un texte non publié s'est retrouvé lu.
    const contenu = await lireContenuAssociatif(administrateur.id, BROUILLON, { at: LENDEMAIN });
    expect(contenu?.peutLire).toBe(true);
    expect(contenu?.motif).toBe('granted');
  });
});

describe('la colonne `corps` n’est accordée à personne', () => {
  it('refuse la requête faite avec la clé publique', async () => {
    const { error } = await anonClient()
      .from('association_content_translations')
      .select('corps')
      .limit(1);

    // Un REFUS, pas un résultat vide. La distinction est tout l'intérêt du
    // privilège : une politique qui filtre laisse la requête réussir, et une
    // requête qui réussit finit un jour par être crue.
    expect(error).not.toBeNull();
  });

  it('la refuse aussi à un compte connecté et abonné', async () => {
    const { error } = await adherent.client
      .from('association_content_translations')
      .select('corps')
      .limit(1);

    // Même l'adhérent passe par `association_contenu` : le droit qu'il a
    // s'exerce à travers la fonction, jamais sur la table.
    expect(error).not.toBeNull();
  });

  it('accorde en revanche le titre et le chapeau des contenus publiés', async () => {
    const { data, error } = await anonClient()
      .from('association_content_translations')
      .select('titre, chapeau')
      .limit(5);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('ne laisse pas voir la fiche d’un brouillon', async () => {
    const { data, error } = await anonClient()
      .from('association_contents')
      .select('slug')
      .eq('slug', BROUILLON);

    // Ici, c'est bien la politique RLS qui travaille — et un brouillon n'est
    // pas « verrouillé » : il n'existe pas.
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });
});
