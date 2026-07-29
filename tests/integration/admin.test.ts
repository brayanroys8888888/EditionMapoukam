import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { reinitialiserQuotaAdmin } from '@/lib/admin/route-helpers';
import * as admin from '@/lib/admin/service';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, serviceClient, type TestUser } from '../helpers/users';

/**
 * API d'administration — §4.3 F10 à F12.
 *
 * Le contrôle du rôle, route par route, vit dans `tests/security/admin.test.ts`.
 * Ce fichier porte sur ce que les routes FONT : la trace qu'elles laissent, ce
 * qu'elles refusent, et ce qu'elles ne divulguent pas.
 */
let editeur: TestUser;
let client: TestUser;
let livre: { id: string; slug: string };

interface EntreeAudit {
  acteur_id: string | null;
  motif: string | null;
  ancienne_valeur: Record<string, unknown> | null;
  nouvelle_valeur: Record<string, unknown> | null;
}

async function dernierAudit(action: string): Promise<EntreeAudit | undefined> {
  return await queryOne(
    `select acteur_id, motif, ancienne_valeur, nouvelle_valeur
       from public.admin_audit_log
      where action = $1 order by cree_le desc, id desc limit 1`,
    [action],
  );
}

beforeAll(async () => {
  editeur = await createTestUser({ admin: true });
  client = await createTestUser();

  const trouve = await queryOne<{ id: string; slug: string }>(
    `select id, slug from public.books where slug = 'le-lion-et-la-souris'`,
  );
  livre = trouve!;
});

beforeEach(() => {
  reinitialiserQuotaAdmin();
});

afterAll(async () => {
  await deleteTestUser(editeur);
  await deleteTestUser(client);
  await closePool();
});

describe('JOURNAL D’AUDIT — qui, quoi, quand, avant, après', () => {
  it('trace un changement de prix avec l’ancienne ET la nouvelle valeur', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ L'ANCIENNE VALEUR EST LA MOITIÉ QUI MANQUE D'ORDINAIRE.              │
    // │                                                                      │
    // │ « Le prix a été mis à 6,99 € » ne permet pas de dire si c'est une     │
    // │ hausse, une baisse ou une correction de faute de frappe. Sans l'état  │
    // │ précédent, le journal raconte une suite d'événements sans histoire.   │
    // └──────────────────────────────────────────────────────────────────────┘
    const avant = await queryOne<{ montant: string }>(
      `select montant::text from public.book_prices
        where book_id = $1 and zone = 'international'`,
      [livre.id],
    );

    const resultat = await admin.definirPrix(editeur.id, livre.id, {
      zone: 'international',
      montant: 777,
      devise: 'EUR',
    });
    expect(resultat.ok).toBe(true);

    const trace = await dernierAudit('prix_modifie');
    expect(trace?.acteur_id).toBe(editeur.id);
    expect(trace?.nouvelle_valeur).toMatchObject({ montant: 777, devise: 'EUR' });
    expect(trace?.ancienne_valeur).toMatchObject({ montant: Number(avant?.montant) });

    // Remis dans son état d'origine : le même jeu de données sert aux autres
    // fichiers d'intégration.
    await admin.definirPrix(editeur.id, livre.id, {
      zone: 'international',
      montant: Number(avant?.montant),
      devise: 'EUR',
    });
  });

  it('trace CHAQUE levier séparément, jamais en une ligne fourre-tout', async () => {
    // Une modification qui touche deux leviers doit produire deux lignes : sinon
    // on ne saurait pas dire lequel a bougé, ni revenir sur un seul.
    const etat = await queryOne<{ gratuit: boolean; disponible_achat: boolean }>(
      `select gratuit, disponible_achat from public.books where id = $1`,
      [livre.id],
    );

    const compter = async (action: string): Promise<number> => {
      const r = await queryOne<{ n: string }>(
        `select count(*)::text as n from public.admin_audit_log
          where action = $1 and cible_id = $2`,
        [action, livre.id],
      );
      return Number(r?.n);
    };

    const gratuitAvant = await compter('gratuit_modifie');
    const achatAvant = await compter('disponible_achat_modifie');

    await admin.modifierLivre(editeur.id, livre.id, {
      gratuit: !etat!.gratuit,
      disponibleAchat: !etat!.disponible_achat,
    });

    expect(await compter('gratuit_modifie')).toBe(gratuitAvant + 1);
    expect(await compter('disponible_achat_modifie')).toBe(achatAvant + 1);

    await admin.modifierLivre(editeur.id, livre.id, {
      gratuit: etat!.gratuit,
      disponibleAchat: etat!.disponible_achat,
    });
  });

  it('trace les paramètres métier avec la ligne entière', async () => {
    const resultat = await admin.modifierParametres(editeur.id, { periodeGraceJours: 9 });
    expect(resultat.ok).toBe(true);

    const trace = await dernierAudit('parametres_modifies');
    expect(trace?.nouvelle_valeur).toMatchObject({ periode_grace_jours: 9 });
    // La ligne complète, et non le seul champ modifié : ces paramètres
    // interagissent, et relire un état vaut mieux que recomposer des deltas.
    expect(trace?.nouvelle_valeur).toHaveProperty('fenetre_nouveaute_jours');

    await admin.modifierParametres(editeur.id, {
      periodeGraceJours: Number((trace?.ancienne_valeur as { periode_grace_jours: number })
        .periode_grace_jours),
    });
  });

  it('NE PEUT PAS être modifié ni effacé, même par service_role', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UN JOURNAL DONT ON PEUT RETIRER UNE LIGNE NE PROUVE RIEN.            │
    // │                                                                      │
    // │ `service_role` contourne RLS partout ailleurs dans ce projet. Ici, ce │
    // │ ne sont pas des politiques qui l'arrêtent mais l'absence de           │
    // │ privilège : `revoke update, delete, truncate`.                        │
    // └──────────────────────────────────────────────────────────────────────┘
    const entree = await queryOne<{ id: string }>(
      `select id from public.admin_audit_log limit 1`,
    );
    expect(entree).not.toBeNull();

    const modification = await serviceClient()
      .from('admin_audit_log')
      .update({ motif: 'réécrit' })
      .eq('id', entree!.id);
    expect(modification.error).not.toBeNull();

    const suppression = await serviceClient()
      .from('admin_audit_log')
      .delete()
      .eq('id', entree!.id);
    expect(suppression.error).not.toBeNull();
  });
});

describe('OCTROI MANUEL — le levier qui donne du contenu gratuitement', () => {
  it('exige un motif, et le conserve', async () => {
    const resultat = await admin.octroyerDroit(editeur.id, {
      userId: client.id,
      bookId: livre.id,
      motif: 'Geste commercial après un incident de téléchargement.',
    });
    expect(resultat.ok).toBe(true);

    const trace = await dernierAudit('droit_octroye');
    expect(trace?.acteur_id).toBe(editeur.id);
    expect(trace?.motif).toContain('Geste commercial');

    await query(`delete from public.entitlements where user_id = $1`, [client.id]);
  });

  it('REFUSE un octroi sans motif', async () => {
    const resultat = await admin.octroyerDroit(editeur.id, {
      userId: client.id,
      bookId: livre.id,
      motif: '  ',
    });

    expect(resultat.ok).toBe(false);
    expect(await query(`select 1 from public.entitlements where user_id = $1`, [client.id]))
      .toHaveLength(0);
  });

  it('n’ouvre PAS le téléchargement par défaut', async () => {
    // Le droit de télécharger ne s'obtient normalement que par un achat : c'est
    // la règle métier centrale du projet. L'offrir doit rester explicite.
    const resultat = await admin.octroyerDroit(editeur.id, {
      userId: client.id,
      bookId: livre.id,
      motif: 'Contrôle du comportement par défaut.',
    });
    expect(resultat.ok).toBe(true);

    const droit = await queryOne<{ peut_telecharger: boolean }>(
      `select peut_telecharger from public.entitlements where user_id = $1`,
      [client.id],
    );
    expect(droit?.peut_telecharger).toBe(false);

    await query(`delete from public.entitlements where user_id = $1`, [client.id]);
  });

  it('REFUSE de retirer un droit issu d’un ACHAT', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ §3.1 promet à l'acheteur un accès « sans limite de durée ».           │
    // │                                                                      │
    // │ Retirer ce droit sans rendre l'argent serait reprendre ce qui a été   │
    // │ payé. Le seul chemin qui le retire est le remboursement, qui rend     │
    // │ l'argent dans la même transaction.                                    │
    // └──────────────────────────────────────────────────────────────────────┘
    const commande = await queryOne<{ id: string }>(
      `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
       values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
      [client.id],
    );
    const droit = await queryOne<{ id: string }>(
      `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
       values ($1, $2, 'achat', $3, true) returning id`,
      [client.id, livre.id, commande!.id],
    );

    const resultat = await admin.retirerDroit(editeur.id, droit!.id, 'Tentative de retrait.');
    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.raison).toBe('regle_metier');

    // Le droit est toujours là.
    expect(await query(`select 1 from public.entitlements where id = $1`, [droit!.id]))
      .toHaveLength(1);

    await query(`delete from public.entitlements where id = $1`, [droit!.id]);
    await query(`delete from public.orders where id = $1`, [commande!.id]);
  });
});

describe('UN COMPTE ANONYMISÉ N’EST PAS RÉ-IDENTIFIABLE', () => {
  it('ne rend NI l’email du compte NI celui de la facture', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE PIÈGE EST LA JOINTURE, PAS LA CONSERVATION.                       │
    // │                                                                      │
    // │ La facture conserve `facture_email`, figé à l'émission : c'est une    │
    // │ pièce comptable et la loi l'exige. Mais une vue d'administration qui  │
    // │ listerait les commandes avec cette adresse reconstituerait, en une    │
    // │ ligne de SQL et en toute bonne foi, l'identité que l'utilisateur a    │
    // │ demandé d'effacer.                                                    │
    // └──────────────────────────────────────────────────────────────────────┘
    const partant = await createTestUser();
    const emailOrigine = partant.email;

    const commande = await queryOne<{ id: string }>(
      `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
       values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
      [partant.id],
    );

    // Une facture RÉELLE, portant l'adresse — sans elle, ce test ne prouverait
    // rien : il n'y aurait rien à ré-identifier.
    await query(
      `insert into public.invoices
         (numero, user_id, order_id, facture_nom, facture_email, facture_pays,
          lignes, montant_ht, montant_tva, montant_ttc, taux_tva, devise, zone,
          conservation_jusqu_au)
       values (public.prochain_numero_facture(2026), $1, $2, 'Parent Test', $3, 'FR',
               '[]'::jsonb, 499, 0, 499, 0, 'EUR', 'international',
               public.app_now() + interval '10 years')`,
      [partant.id, commande!.id, emailOrigine],
    );

    await query(`select public.anonymize_user($1)`, [partant.id]);

    const facture = await queryOne<{ facture_email: string }>(
      `select facture_email from public.invoices where order_id = $1`,
      [commande!.id],
    );
    // La facture a bien CONSERVÉ l'adresse : c'est l'obligation comptable, et
    // c'est ce qui rend le test suivant significatif.
    expect(facture?.facture_email).toBe(emailOrigine);

    const commandes = await admin.listerCommandes({ page: 1, taille: 25, userId: partant.id });
    expect(commandes.ok).toBe(true);

    const serialise = JSON.stringify(commandes.ok ? commandes.donnees : []);
    expect(serialise).not.toContain(emailOrigine);
    expect(serialise).not.toContain('Parent Test');
    // Le numéro de facture, lui, reste rendu : il est nécessaire à la
    // comptabilité et ne désigne personne.
    expect(serialise).toContain('acheteur_anonymise');

    const comptes = await admin.listerUtilisateurs({ page: 1, taille: 100 });
    expect(JSON.stringify(comptes.ok ? comptes.donnees : [])).not.toContain(emailOrigine);

    await deleteTestUser(partant);
  });

  it('la RECHERCHE n’atteint pas un compte anonymisé', async () => {
    // Chercher « martin@ » et retrouver le compte de Martin par son jeton
    // d'anonymisation reviendrait à ne pas l'avoir anonymisé.
    const partant = await createTestUser();
    const local = partant.email.split('@')[0] ?? '';

    await query(`select public.anonymize_user($1)`, [partant.id]);

    const resultat = await admin.listerUtilisateurs({ recherche: local, page: 1, taille: 25 });
    expect(resultat.ok).toBe(true);

    const trouves = (resultat.ok ? resultat.donnees : []) as { id: string }[];
    expect(trouves.map((c) => c.id)).not.toContain(partant.id);

    await deleteTestUser(partant);
  });
});

describe('PUBLICATION EN LOT — quarante titres ne contournent rien', () => {
  it('REFUSE le lot entier si UN SEUL titre est incomplet', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ L'ACTION GROUPÉE EST LE CHEMIN PAR LEQUEL LES VALIDATIONS            │
    // │ S'ÉCHAPPENT.                                                          │
    // │                                                                      │
    // │ Et le refus doit être TOTAL : quarante titres publiés à moitié        │
    // │ seraient pires qu'un refus, parce qu'il faudrait deviner lesquels     │
    // │ sont passés.                                                          │
    // └──────────────────────────────────────────────────────────────────────┘
    const complet = await queryOne<{ id: string }>(
      `select id from public.books where slug = 'la-girafe-et-l-oiseau-malin'`,
    );
    const incomplet = await queryOne<{ id: string; statut: string }>(
      `select id, statut from public.books where slug = 'le-lievre-et-la-tortue'`,
    );

    // Le titre incomplet l'est bien : sans quoi le test passerait à côté.
    const manques = await queryOne<{ manques: string[] }>(
      `select public.manques_pour_publication($1) as manques`,
      [incomplet!.id],
    );
    expect(manques?.manques.length).toBeGreaterThan(0);

    const resultat = await admin.changerPublication(
      editeur.id,
      [complet!.id, incomplet!.id],
      'publie',
    );
    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.raison).toBe('regle_metier');

    // NI l'un NI l'autre n'a bougé : la transaction entière a été annulée.
    const apres = await query<{ slug: string; statut: string }>(
      `select slug, statut from public.books where id = any($1) order by slug`,
      [[complet!.id, incomplet!.id]],
    );
    expect(apres.find((l) => l.slug === 'le-lievre-et-la-tortue')?.statut).toBe('brouillon');
  });

  it('publie un lot dont tous les titres sont complets', async () => {
    // Le pendant du test précédent : sans lui, une fonction qui refuserait
    // TOUT lot passerait le premier sans rien garantir.
    const cible = await queryOne<{ id: string; statut: string }>(
      `select id, statut from public.books where slug = 'la-girafe-et-l-oiseau-malin'`,
    );

    try {
      const resultat = await admin.changerPublication(editeur.id, [cible!.id], 'archive');
      expect(resultat.ok).toBe(true);

      const apres = await queryOne<{ statut: string }>(
        `select statut from public.books where id = $1`,
        [cible!.id],
      );
      expect(apres?.statut).toBe('archive');
    } finally {
      // Rétabli quoi qu'il arrive : le jeu de données est partagé.
      await admin.changerPublication(editeur.id, [cible!.id], cible!.statut as 'publie');
    }
  });

  it('ne RÉÉCRIT PAS `publie_le` d’un titre republié', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ `publie_le` FAIT COURIR LA FENÊTRE DE VENTE DE 3 MOIS (§3.2).        │
    // │                                                                      │
    // │ Le remettre à jour à chaque republication rouvrirait la fenêtre d'un  │
    // │ titre déjà entré dans l'abonnement : les abonnés perdraient l'accès à │
    // │ un titre qu'ils lisaient la veille, sans qu'aucune décision           │
    // │ commerciale n'ait été prise.                                          │
    // └──────────────────────────────────────────────────────────────────────┘
    // `la-hyene-qui-voulait-changer` est le titre ARCHIVÉ du jeu de
    // démonstration, et plusieurs autres fichiers s'appuient sur ce fait. Son
    // statut d'origine est donc relu et rétabli dans un `finally` : une
    // première version de ce test le republiait sans le remettre, et sept tests
    // d'autres fichiers échouaient — sur le jeu de données, pas sur leur sujet.
    const cible = await queryOne<{ id: string; statut: string; publie_le: Date }>(
      `select id, statut, publie_le from public.books
        where slug = 'la-hyene-qui-voulait-changer'`,
    );
    expect(cible?.publie_le).not.toBeNull();

    try {
      await admin.changerPublication(editeur.id, [cible!.id], 'publie');

      const apres = await queryOne<{ publie_le: Date }>(
        `select publie_le from public.books where id = $1`,
        [cible!.id],
      );
      expect(apres?.publie_le?.getTime()).toBe(cible?.publie_le?.getTime());
    } finally {
      await admin.changerPublication(
        editeur.id,
        [cible!.id],
        cible!.statut as 'archive',
      );
    }
  });
});

describe('CODES PROMOTIONNELS — validation exclusivement serveur', () => {
  it('REFUSE un code à montant fixe sans zone', async () => {
    // « 5 € de réduction » n'a aucun sens sur un panier en francs CFA.
    const resultat = await admin.enregistrerPromo(editeur.id, {
      code: 'SANSZONE',
      type: 'montant',
      valeur: 200,
      devise: 'EUR',
      zone: null,
    });

    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.raison).toBe('regle_metier');
  });

  it('accepte un code en pourcentage SANS zone ni devise', async () => {
    // Un pourcentage est neutre en devise : 20 % valent 20 % partout. Le
    // cantonner à une zone suggérerait qu'il ne vaut pas ailleurs.
    const resultat = await admin.enregistrerPromo(editeur.id, {
      code: 'PARTOUT20',
      type: 'pourcentage',
      valeur: 20,
    });
    expect(resultat.ok).toBe(true);

    const enregistre = await queryOne<{ zone: string | null; devise: string | null }>(
      `select zone, devise from public.promo_codes where code = 'PARTOUT20'`,
    );
    expect(enregistre?.zone).toBeNull();
    expect(enregistre?.devise).toBeNull();

    await query(`delete from public.promo_codes where code = 'PARTOUT20'`);
  });

  it('la base REFUSE elle-même un code à montant sans zone', async () => {
    // Le second rempart : même une écriture directe est arrêtée.
    await expect(
      query(
        `insert into public.promo_codes (code, type, valeur, devise, zone)
         values ('DIRECT', 'montant', 200, 'EUR', null)`,
      ),
    ).rejects.toThrow();
  });

  it('trace la création d’un code', async () => {
    const resultat = await admin.enregistrerPromo(editeur.id, {
      code: 'TRACE10',
      type: 'pourcentage',
      valeur: 10,
    });
    expect(resultat.ok).toBe(true);

    const trace = await dernierAudit('code_promo_modifie');
    expect(trace?.acteur_id).toBe(editeur.id);
    expect(trace?.nouvelle_valeur).toMatchObject({ code: 'TRACE10' });

    await query(`delete from public.promo_codes where code = 'TRACE10'`);
  });
});

describe('ZONE D’UN ABONNEMENT — arbitrage N4', () => {
  it('change la zone, trace le geste, et NE TOUCHE PAS au montant', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE MONTANT EST FIGÉ SUR L'ABONNEMENT (D4 point 7).                   │
    // │                                                                      │
    // │ Le recalculer maintenant réviserait rétroactivement une période déjà  │
    // │ payée — et pourrait la rendre plus chère après encaissement. La       │
    // │ nouvelle zone ne s'appliquera qu'au prochain renouvellement.          │
    // └──────────────────────────────────────────────────────────────────────┘
    const abonnement = await queryOne<{ id: string; montant: string; devise: string }>(
      `insert into public.subscriptions
         (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
       values ($1, 'mensuel', 'actif', public.app_now(),
               public.app_now() + interval '1 month', 'international', 'EUR', 799)
       returning id, montant::text, devise`,
      [client.id],
    );

    const resultat = await admin.changerZoneAbonnement(
      editeur.id,
      abonnement!.id,
      'afrique',
      'Déménagement déclaré, justificatif fourni.',
    );
    expect(resultat.ok).toBe(true);

    const apres = await queryOne<{ zone: string; montant: string; devise: string }>(
      `select zone, montant::text, devise from public.subscriptions where id = $1`,
      [abonnement!.id],
    );
    expect(apres?.zone).toBe('afrique');
    expect(apres?.montant).toBe(abonnement?.montant);
    expect(apres?.devise).toBe(abonnement?.devise);

    const trace = await dernierAudit('zone_abonnement_modifiee');
    expect(trace?.acteur_id).toBe(editeur.id);
    expect(trace?.ancienne_valeur).toMatchObject({ zone: 'international' });
    expect(trace?.nouvelle_valeur).toMatchObject({ zone: 'afrique' });
    expect(trace?.motif).toContain('Déménagement');

    await query(`delete from public.subscriptions where id = $1`, [abonnement!.id]);
  });

  it('est IDEMPOTENT : rejouer la même zone ne trace rien', async () => {
    // Une trace annonçant un changement qui n'a pas eu lieu rendrait le journal
    // moins lisible sans rien apprendre.
    const abonnement = await queryOne<{ id: string }>(
      `insert into public.subscriptions
         (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
       values ($1, 'mensuel', 'actif', public.app_now(),
               public.app_now() + interval '1 month', 'afrique', 'XOF', 3000)
       returning id`,
      [client.id],
    );

    const avant = await queryOne<{ n: string }>(
      `select count(*)::text as n from public.admin_audit_log
        where action = 'zone_abonnement_modifiee' and cible_id = $1`,
      [abonnement!.id],
    );

    const resultat = await admin.changerZoneAbonnement(editeur.id, abonnement!.id, 'afrique', null);
    expect(resultat.ok).toBe(true);

    const apres = await queryOne<{ n: string }>(
      `select count(*)::text as n from public.admin_audit_log
        where action = 'zone_abonnement_modifiee' and cible_id = $1`,
      [abonnement!.id],
    );
    expect(apres?.n).toBe(avant?.n);

    await query(`delete from public.subscriptions where id = $1`, [abonnement!.id]);
  });
});

describe('TABLEAU DE BORD — ce qui doit sauter aux yeux', () => {
  it('rend les compteurs, les anomalies et les manques de publication', async () => {
    const resultat = await admin.tableauDeBord();
    expect(resultat.ok).toBe(true);

    const bord = resultat.ok ? resultat.donnees : {};
    expect(bord).toHaveProperty('abonnements');
    expect(bord).toHaveProperty('anomalies');
    expect(bord).toHaveProperty('brouillons_non_publiables');
    expect(bord).toHaveProperty('copies_purgeables');

    // Le jeu de démonstration porte un brouillon incomplet : le tableau de bord
    // doit le montrer, avec ce qui lui manque.
    const brouillons = (bord as { brouillons_non_publiables: { slug: string }[] })
      .brouillons_non_publiables;
    expect(brouillons.map((b) => b.slug)).toContain('le-lievre-et-la-tortue');
  });

  it('montre une anomalie AVEC son ancienneté', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ « DEPUIS QUAND » CHANGE LA RÉACTION.                                 │
    // │                                                                      │
    // │ Une anomalie de deux heures est un webhook en retard ; une anomalie   │
    // │ de trois semaines est un défaut d'intégration. Sans l'ancienneté, les │
    // │ deux se ressemblent (arbitrage N2).                                  │
    // └──────────────────────────────────────────────────────────────────────┘
    const echu = await queryOne<{ id: string }>(
      `insert into public.subscriptions
         (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
       values ($1, 'mensuel', 'actif',
               public.app_now() - interval '40 days',
               public.app_now() - interval '10 days',
               'international', 'EUR', 799)
       returning id`,
      [client.id],
    );

    const resultat = await admin.tableauDeBord();
    const anomalies = (
      resultat.ok ? (resultat.donnees as { anomalies: { subscription_id: string; echue_depuis_heures: number }[] }).anomalies : []
    );

    const notre = anomalies.find((a) => a.subscription_id === echu!.id);
    expect(notre).toBeDefined();
    expect(notre?.echue_depuis_heures).toBeGreaterThan(200);

    await query(`delete from public.subscriptions where id = $1`, [echu!.id]);
  });

  it('les anomalies apparaissent EN TÊTE de la liste des abonnements', async () => {
    // Un abonnement en anomalie ne se distingue d'un abonnement sain par aucun
    // autre signe : le ranger au milieu reviendrait à le taire une seconde fois.
    const sain = await queryOne<{ id: string }>(
      `insert into public.subscriptions
         (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
       values ($1, 'annuel', 'actif', public.app_now(),
               public.app_now() + interval '1 year', 'international', 'EUR', 6900)
       returning id`,
      [editeur.id],
    );
    const anomalie = await queryOne<{ id: string }>(
      `insert into public.subscriptions
         (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
       values ($1, 'mensuel', 'actif',
               public.app_now() - interval '40 days',
               public.app_now() - interval '10 days',
               'international', 'EUR', 799)
       returning id`,
      [client.id],
    );

    const resultat = await admin.listerAbonnements({ page: 1, taille: 100 });
    const lignes = (resultat.ok ? resultat.donnees : []) as {
      id: string;
      statut_observe: string;
    }[];

    expect(lignes[0]?.statut_observe).toBe('anomalie');
    expect(lignes.map((l) => l.id)).toContain(anomalie!.id);

    await query(`delete from public.subscriptions where id = any($1)`, [[sain!.id, anomalie!.id]]);
  });
});

describe('PAGINATION PLAFONNÉE (point 7)', () => {
  it('plafonne la taille de page EN BASE, quoi que demande l’appelant', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE PLAFOND VIT EN BASE, PAS DANS LE SCHÉMA ZOD.                      │
    // │                                                                      │
    // │ Une route ajoutée plus tard hérite ainsi de la protection sans avoir  │
    // │ à y penser. Le schéma Zod, lui, ne sert qu'à rendre un message clair. │
    // └──────────────────────────────────────────────────────────────────────┘
    const plafond = await queryOne<{ p: number }>(
      `select public.taille_page_admin(100000) as p`,
    );
    expect(plafond?.p).toBe(100);

    // Une demande absurde est RAMENÉE au plafond, pas refusée : refuser
    // inviterait à réessayer juste en dessous.
    expect((await queryOne<{ p: number }>(`select public.taille_page_admin(-5) as p`))?.p).toBe(1);
    expect((await queryOne<{ p: number }>(`select public.taille_page_admin(null) as p`))?.p).toBe(25);
  });

  it('rend le total, pour que la pagination soit utilisable', async () => {
    const resultat = await admin.listerUtilisateurs({ page: 1, taille: 1 });
    const lignes = (resultat.ok ? resultat.donnees : []) as { total_lignes: string }[];

    expect(lignes).toHaveLength(1);
    // Sans le total, un appelant ne saurait pas s'il reste des pages — et
    // boucherait jusqu'à une page vide, ce que le quota lui refuserait.
    expect(Number(lignes[0]?.total_lignes)).toBeGreaterThan(1);
  });
});

describe('PURGE DES COPIES — maintenance déclenchée à la main (P1)', () => {
  it('s’exécute et se trace', async () => {
    const resultat = await admin.declencherPurgeCopies(editeur.id);
    expect(resultat.ok).toBe(true);

    const trace = await dernierAudit('purge_copies');
    expect(trace?.acteur_id).toBe(editeur.id);
    expect(trace?.nouvelle_valeur).toHaveProperty('copies_effacees');
  });
});

describe('SUSPENSION DE COMPTE', () => {
  it('suspend, trace, et rétablit', async () => {
    const suspendu = await createTestUser();
    try {
      const resultat = await admin.definirStatutCompte(
        editeur.id,
        suspendu.id,
        true,
        'Comportement signalé.',
      );
      expect(resultat.ok).toBe(true);

      const trace = await dernierAudit('compte_suspendu');
      expect(trace?.acteur_id).toBe(editeur.id);
      expect(trace?.motif).toContain('Comportement');

      const reactive = await admin.definirStatutCompte(editeur.id, suspendu.id, false, null);
      expect(reactive.ok).toBe(true);
      expect((await dernierAudit('compte_reactive'))?.acteur_id).toBe(editeur.id);
    } finally {
      await deleteTestUser(suspendu);
    }
  });

  it('REFUSE à un administrateur de se suspendre lui-même', async () => {
    // Se suspendre fermerait la porte de l'intérieur : plus personne ne pourrait
    // rouvrir le compte, l'action exigeant un administrateur actif.
    const resultat = await admin.definirStatutCompte(editeur.id, editeur.id, true, null);

    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.raison).toBe('regle_metier');
  });

  it('REFUSE de suspendre un compte anonymisé', async () => {
    const partant = await createTestUser();
    await query(`select public.anonymize_user($1)`, [partant.id]);

    const resultat = await admin.definirStatutCompte(editeur.id, partant.id, true, null);
    expect(resultat.ok).toBe(false);

    await deleteTestUser(partant);
  });
});
