import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { POST as webhookPaiements } from '@/app/api/webhooks/payments/route';
import { FakePaymentProvider } from '@/adapters/payment/fake/fake-payment-provider';
import { GET as catalogue } from '@/app/api/catalog/route';
import { GET as lirePanier, POST as ajouterAuPanier } from '@/app/api/cart/route';
import { POST as creerCommande } from '@/app/api/orders/route';
import { GET as telecharger } from '@/app/api/downloads/[bookId]/route';
import { GET as statsRoute } from '@/app/api/admin/stats/route';
import { GET as auditRoute } from '@/app/api/admin/audit/route';
import { reinitialiserQuotaAdmin } from '@/lib/admin/route-helpers';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, get, postJson } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';
import { deposerFichiersDeDemonstration } from '../helpers/storage';

/**
 * PARCOURS D'ACHAT, DE BOUT EN BOUT — étape 16.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN APPEL DIRECT À LA BASE POUR PROVOQUER UN FAIT MÉTIER.             │
 * │                                                                          │
 * │ Le paiement est déclenché par la CONSOLE DE SIMULATION, qui émet un vrai │
 * │ événement signé vers le vrai gestionnaire de webhooks. Les autres étapes │
 * │ passent par les routes de l'application.                                 │
 * │                                                                          │
 * │ La base n'est lue que pour CONSTATER — jamais pour fabriquer un état.    │
 * │ C'est ce qui distingue un parcours de bout en bout d'un test             │
 * │ d'intégration : ici, si la chaîne est rompue quelque part, le parcours   │
 * │ s'arrête. Un test qui poserait l'état à la main sauterait la rupture.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ON VÉRIFIE AUSSI LES EFFETS DE BORD, pas seulement le chemin heureux : ce qui
 * est écrit au journal d'audit, ce qui part en email, ce qui apparaît aux
 * statistiques. Un parcours qui ne regarde que son résultat direct laisse
 * passer précisément ce que personne ne regarde en production.
 */
const DOSSIER_MAILS = join(process.cwd(), '.mails');

let acheteur: TestUser;
let editeur: TestUser;
let livreId: string;
let livreSlug: string;

/**
 * Émet un événement EXACTEMENT comme la console de simulation.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MÊME MÉCANIQUE QUE /api/dev/events, MOINS LE SAUT RÉSEAU.                │
 * │                                                                          │
 * │ La console appelle provider.declencher(), qui fabrique l'événement, │
 * │ SIGNE, et le transmet par HTTP au gestionnaire de webhooks. Dans un test, │
 * │ aucun serveur n'écoute — le transport est donc branché directement sur le │
 * │ gestionnaire.                                                            │
 * │                                                                          │
 * │ Ce qui compte est préservé : la signature est réellement calculée et      │
 * │ réellement vérifiée, le journal d'idempotence est réellement écrit, et    │
 * │ l'octroi passe par le VRAI chemin. Seul le transport est court-circuité,  │
 * │ et c'est la seule partie qu'un serveur de test ajouterait.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const provider = new FakePaymentProvider({
  transport: async (_url, init) =>
    await webhookPaiements(
      new Request('http://localhost:3000/api/webhooks/payments', {
        method: 'POST',
        headers: init.headers as HeadersInit,
        body: init.body as BodyInit,
      }),
    ),
});

async function emettre(type: string, donnees: Record<string, unknown>) {
  const resultat = await provider.declencher(type as never, donnees);
  return { corps: { statut: resultat.statut } };
}

beforeAll(async () => {
  await deposerFichiersDeDemonstration();
  acheteur = await createTestUser();
  editeur = await createTestUser({ admin: true });

  const livre = await queryOne<{ id: string; slug: string }>(
    `select id, slug from public.books where slug = 'la-tortue-et-le-lapin'`,
  );
  livreId = livre!.id;
  livreSlug = livre!.slug;

  if (existsSync(DOSSIER_MAILS)) rmSync(DOSSIER_MAILS, { recursive: true, force: true });
});

afterAll(async () => {
  await query(`delete from public.email_outbox where user_id = $1`, [acheteur.id]);
  await deleteTestUser(acheteur);
  await deleteTestUser(editeur);
  if (existsSync(DOSSIER_MAILS)) rmSync(DOSSIER_MAILS, { recursive: true, force: true });
  await closePool();
});

describe('PARCOURS D’ACHAT — inscription jusqu’à la facture', () => {
  let commandeId: string;

  it('1. le catalogue montre le titre à un visiteur', async () => {
    const reponse = await catalogue(get('/api/catalog?langue=fr&taille=50'));
    expect(reponse.status).toBe(200);

    const corps = await corpsJson<{ entrees: { slug: string }[] }>(reponse);
    expect(corps.entrees.map((l) => l.slug)).toContain(livreSlug);
  });

  it('2. le titre s’ajoute au panier', async () => {
    const reponse = await ajouterAuPanier(
      postJson('/api/cart', { book_id: livreId, langue: 'fr' }, { jeton: acheteur.accessToken }),
    );
    expect([200, 201]).toContain(reponse.status);

    const panier = await corpsJson<{ lignes: unknown[] }>(
      await lirePanier(get('/api/cart', { jeton: acheteur.accessToken })),
    );
    expect(panier.lignes).toHaveLength(1);
  });

  it('3. la commande est créée EN ATTENTE — jamais payée par la route', async () => {
    // CLAUDE.md règle 5 : « une redirection de navigateur ne déclenche jamais
    // l'octroi d'un droit ». La route de commande ne peut donc pas payer.
    const reponse = await creerCommande(
      postJson('/api/orders', { zone_affichee: 'international' }, { jeton: acheteur.accessToken }),
    );
    expect([200, 201]).toContain(reponse.status);

    const corps = await corpsJson<{ commande_id: string; statut: string }>(reponse);
    commandeId = corps.commande_id;
    expect(corps.statut).toBe('en_attente');

    // Aucun droit à ce stade.
    expect(
      await query(`select 1 from public.entitlements where user_id = $1`, [acheteur.id]),
    ).toHaveLength(0);
  });

  it('4. la CONSOLE émet le paiement, et le webhook octroie les droits', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE SEUL CHEMIN QUI OCTROIE UN DROIT.                                 │
    // │                                                                      │
    // │ La console émet un vrai événement signé ; le vrai gestionnaire       │
    // │ vérifie la signature, journalise, puis applique. Rien n'est simulé du │
    // │ côté récepteur.                                                      │
    // └──────────────────────────────────────────────────────────────────────┘
    const { corps } = await emettre('paiement.reussi', { orderId: commandeId });
    expect(corps.statut).toBe(200);

    const commande = await queryOne<{ statut: string }>(
      `select statut from public.orders where id = $1`,
      [commandeId],
    );
    expect(commande?.statut).toBe('paye');

    const droit = await queryOne<{ peut_telecharger: boolean; type: string }>(
      `select peut_telecharger, type from public.entitlements where user_id = $1`,
      [acheteur.id],
    );
    // L'achat — et LUI SEUL — ouvre le téléchargement.
    expect(droit).toMatchObject({ type: 'achat', peut_telecharger: true });
  });

  it('5. le téléchargement sert une copie FILIGRANÉE', async () => {
    const reponse = await telecharger(
      get(`/api/downloads/${livreId}?langue=fr&format=pdf`, { jeton: acheteur.accessToken }),
      { params: Promise.resolve({ bookId: livreId }) },
    );
    expect(reponse.status).toBe(200);

    const corps = await corpsJson<{ url: string; reference: string }>(reponse);
    // La reference rendue au client est TRONQUEE a douze caracteres : elle
    // suffit au support, et l'identifiant complet reste interne.
    expect(corps.reference).toMatch(/^[0-9a-f]{12}$/);

    // La copie est tracée, avec l'acheteur nommé dessus.
    const copie = await queryOne<{ copie_id: string }>(
      `select copie_id from public.download_copies where user_id = $1`,
      [acheteur.id],
    );
    expect(copie?.copie_id.slice(0, 12)).toBe(corps.reference);
  }, 90_000);

  it('6. EFFET DE BORD — un email de confirmation est programmé, et parti', async () => {
    // La demande est écrite dans la transaction du webhook ; l'envoi a lieu
    // après. Au moment où ce test s'exécute, le vidage a eu lieu.
    const ligne = await queryOne<{ modele: string; statut: string; destinataire: string }>(
      `select modele, statut, destinataire from public.email_outbox
        where cle_idempotence = $1`,
      [`commande-payee:${commandeId}`],
    );

    expect(ligne?.modele).toBe('commande_confirmee');
    expect(ligne?.destinataire).toBe(acheteur.email);

    // Le fichier a été écrit par FileMailer.
    const fichiers = existsSync(DOSSIER_MAILS) ? readdirSync(DOSSIER_MAILS) : [];
    const contenus = fichiers.map((f) => readFileSync(join(DOSSIER_MAILS, f), 'utf8'));
    const notre = contenus.find((c) => c.includes(acheteur.email));

    expect(notre, 'aucun email écrit pour l’acheteur').toBeDefined();
    // Et il ne porte AUCUN lien signé.
    expect(notre).not.toMatch(/token=|\/storage\/v1\/object\/sign/);
  });

  it('7. EFFET DE BORD — la commande apparaît aux STATISTIQUES, dans sa devise', async () => {
    reinitialiserQuotaAdmin();
    const reponse = await statsRoute(
      get('/api/admin/stats?agregat=chiffre_affaires', { jeton: editeur.accessToken }),
    );
    expect(reponse.status).toBe(200);

    const corps = await corpsJson<{
      donnees: { flux: string; devise: string; montant: string }[];
    }>(reponse);

    const unitaireEur = corps.donnees.filter(
      (l) => l.flux === 'achat_unitaire' && l.devise === 'EUR',
    );
    expect(unitaireEur.length).toBeGreaterThanOrEqual(1);
    // Chaque ligne porte SA devise : aucun total consolidé.
    expect(corps.donnees.every((l) => typeof l.devise === 'string')).toBe(true);
  });

  it('8. EFFET DE BORD — le remboursement retire le droit ET s’inscrit à l’audit', async () => {
    // Le parcours ne s'arrête pas au chemin heureux : on éprouve la sortie.
    reinitialiserQuotaAdmin();
    const avantAudit = await queryOne<{ n: string }>(
      `select count(*)::text as n from public.admin_audit_log where action = 'remboursement'`,
    );

    const { corps } = await emettre('remboursement.effectue', { orderId: commandeId });
    expect(corps.statut).toBe(200);

    // Le droit d'achat est retiré — par LIGNE de commande (arbitrage Q9.1).
    expect(
      await query(`select 1 from public.entitlements where user_id = $1`, [acheteur.id]),
    ).toHaveLength(0);

    // Et le journal d'audit l'a vu, avec un acteur NUL : c'est le prestataire
    // qui a remboursé, pas un administrateur.
    const apresAudit = await queryOne<{ n: string }>(
      `select count(*)::text as n from public.admin_audit_log where action = 'remboursement'`,
    );
    expect(Number(apresAudit?.n)).toBe(Number(avantAudit?.n) + 1);

    const trace = await queryOne<{ acteur_id: string | null }>(
      `select acteur_id from public.admin_audit_log
        where action = 'remboursement' order by cree_le desc limit 1`,
    );
    expect(trace?.acteur_id).toBeNull();
  });

  it('9. le journal d’audit est CONSULTABLE par l’administration', async () => {
    reinitialiserQuotaAdmin();
    const reponse = await auditRoute(
      get('/api/admin/audit?action=remboursement', { jeton: editeur.accessToken }),
    );

    expect(reponse.status).toBe(200);
    const corps = await corpsJson<{ entrees: unknown[] }>(reponse);
    expect(corps.entrees.length).toBeGreaterThanOrEqual(1);
  });

  it('10. après remboursement, le téléchargement est REFUSÉ', async () => {
    const reponse = await telecharger(
      get(`/api/downloads/${livreId}?langue=fr&format=pdf`, { jeton: acheteur.accessToken }),
      { params: Promise.resolve({ bookId: livreId }) },
    );

    expect(reponse.status).toBe(403);
  });
});
