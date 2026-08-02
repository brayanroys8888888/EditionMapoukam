import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { viderFile } from '@/lib/emails/file';
import { MODELES_CONNUS, rendre } from '@/domain/emails/templates';
import type { Mailer, MessageMail, ResultatEnvoi } from '@/adapters/mail/types';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * Emails transactionnels — §9.2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN EMAIL N'EST PAS UN FAIT MÉTIER. IL EN REND COMPTE.                   │
 * │                                                                          │
 * │ Toute la conception découle de là : la demande d'email est écrite dans   │
 * │ la transaction métier — donc atomique avec elle — et l'ENVOI a lieu      │
 * │ après le commit, sans pouvoir rien annuler.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const DOSSIER_MAILS = join(process.cwd(), '.mails');

let acheteur: TestUser;
let livreId: string;

/** Un mailer qui échoue TOUJOURS : c'est le cas qui compte. */
class MailerEnPanne implements Mailer {
  readonly nom = 'panne';
  envoyer(): Promise<ResultatEnvoi> {
    return Promise.reject(new Error('Serveur de messagerie injoignable'));
  }
}

/** Un mailer qui retient ses messages, pour les inspecter. */
class MailerEspion implements Mailer {
  readonly nom = 'espion';
  readonly messages: MessageMail[] = [];
  envoyer(message: MessageMail): Promise<ResultatEnvoi> {
    this.messages.push(message);
    return Promise.resolve({ id: `espion-${String(this.messages.length)}`, envoyeLe: new Date() });
  }
}

async function commanderEtPayer(user: TestUser): Promise<string> {
  const commande = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut)
     values ($1, 499, 'EUR', 'international', 'en_attente') returning id`,
    [user.id],
  );
  await query(
    `insert into public.order_items (order_id, book_id, langue, prix_unitaire, devise, zone)
     values ($1, $2, 'fr', 499, 'EUR', 'international')`,
    [commande!.id, livreId],
  );
  await query(`select * from public.fulfill_order($1)`, [commande!.id]);
  return commande!.id;
}

beforeAll(async () => {
  acheteur = await createTestUser();
  livreId =
    (await queryOne<{ id: string }>(`select id from public.books where slug = 'le-lion-et-la-souris'`))
      ?.id ?? '';
});

afterEach(async () => {
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ AUCUN EMAIL RÉSIDUEL ENTRE DEUX EXÉCUTIONS.                            │
  // │                                                                        │
  // │ Un `.mails/` qui s'accumule ferait passer un test qui n'envoie plus     │
  // │ rien : il trouverait le fichier de l'exécution précédente. C'est la     │
  // │ classe de défaut de §5 sexies — un test vert qui ne valide rien.        │
  // └────────────────────────────────────────────────────────────────────────┘
  if (existsSync(DOSSIER_MAILS)) {
    rmSync(DOSSIER_MAILS, { recursive: true, force: true });
  }
  await query(`delete from public.email_outbox where user_id = $1`, [acheteur.id]);
  await query(`delete from public.entitlements where user_id = $1`, [acheteur.id]);
  await query(`delete from public.orders where user_id = $1`, [acheteur.id]);
});

afterAll(async () => {
  await deleteTestUser(acheteur);
  await closePool();
});

describe('(f) LE DOSSIER .mails/', () => {
  it('est ignoré par git', () => {
    // Un email contient une adresse et une référence de commande. Versionné, il
    // sortirait du poste de développement à la première poussée.
    expect(readFileSync(join(process.cwd(), '.gitignore'), 'utf8')).toContain('.mails/');
  });

  it('ne conserve AUCUN email d’une exécution à l’autre', () => {
    // Le `afterEach` ci-dessus l'efface. Ce test vérifie que la remise à zéro a
    // bien eu lieu — sinon les tests suivants liraient des fichiers anciens.
    const restants = existsSync(DOSSIER_MAILS) ? readdirSync(DOSSIER_MAILS) : [];

    expect(restants).toEqual([]);
  });
});

describe('(a) UN ÉCHEC D’ENVOI N’ANNULE JAMAIS LE FAIT MÉTIER', () => {
  it('la commande reste payée et les droits octroyés quand l’envoi échoue', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE CLIENT A PAYÉ. LE SERVEUR DE MESSAGERIE N'A PAS VOIX AU CHAPITRE. │
    // └──────────────────────────────────────────────────────────────────────┘
    const commande = await commanderEtPayer(acheteur);

    const rapport = await viderFile({ mailer: new MailerEnPanne() });
    expect(rapport.echoues).toBeGreaterThanOrEqual(1);
    expect(rapport.envoyes).toBe(0);

    // Le fait métier est INTACT.
    const apres = await queryOne<{ statut: string }>(
      `select statut from public.orders where id = $1`,
      [commande],
    );
    expect(apres?.statut).toBe('paye');

    expect(
      await query(`select 1 from public.entitlements where user_id = $1`, [acheteur.id]),
    ).toHaveLength(1);

    // Et l'email n'est pas perdu : la ligne porte son erreur, consultable.
    const ligne = await queryOne<{ statut: string; tentatives: number; derniere_erreur: string }>(
      `select statut, tentatives, derniere_erreur from public.email_outbox
        where user_id = $1`,
      [acheteur.id],
    );
    expect(ligne?.statut).toBe('echoue');
    expect(ligne?.tentatives).toBe(1);
    expect(ligne?.derniere_erreur).toContain('injoignable');
  });

  it('l’email est PROGRAMMÉ dans la transaction, envoyé seulement après', async () => {
    // L'atomicité : payer une commande crée la ligne de file, sans rien envoyer.
    await commanderEtPayer(acheteur);

    const enAttente = await queryOne<{ statut: string; modele: string }>(
      `select statut, modele from public.email_outbox where user_id = $1`,
      [acheteur.id],
    );
    expect(enAttente?.statut).toBe('en_attente');
    expect(enAttente?.modele).toBe('commande_confirmee');

    // Rien n'est encore parti.
    expect(existsSync(DOSSIER_MAILS) ? readdirSync(DOSSIER_MAILS) : []).toEqual([]);
  });

  it('ne lève JAMAIS, même si toute la file échoue', async () => {
    // La propriété centrale : si `viderFile` levait depuis le gestionnaire de
    // webhooks, elle transformerait un webhook traité en échec — et le
    // prestataire rejouerait un événement déjà appliqué.
    await commanderEtPayer(acheteur);

    await expect(viderFile({ mailer: new MailerEnPanne() })).resolves.toMatchObject({
      envoyes: 0,
    });
  });
});

describe('(b) IDEMPOTENCE — la clé porte sur l’ÉVÉNEMENT', () => {
  it('un `fulfill_order` rejoué ne programme PAS un second email', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA CLÉ EST CELLE DE LA COMMANDE, PAS CELLE DE L'ENVOI.               │
    // │                                                                      │
    // │ Avec une clé d'envoi, deux appels concurrents passeraient tous deux   │
    // │ le contrôle avant que l'un n'écrive. Avec une clé d'événement, la     │
    // │ base refuse la seconde ligne — au moment de l'écriture, pas après.    │
    // └──────────────────────────────────────────────────────────────────────┘
    const commande = await commanderEtPayer(acheteur);

    // Le rejeu : `fulfill_order` constate que la commande est déjà payée.
    await query(`select * from public.fulfill_order($1)`, [commande]);
    await query(`select * from public.fulfill_order($1)`, [commande]);

    const lignes = await query(
      `select 1 from public.email_outbox where user_id = $1`,
      [acheteur.id],
    );
    expect(lignes).toHaveLength(1);
  });

  it('la contrainte d’unicité refuse une clé déjà employée', async () => {
    // Le rempart en base, éprouvé directement : même une écriture qui
    // contournerait `fulfill_order` ne peut pas doubler un email.
    await query(`select public.programmer_email($1, $2, $3, '{}'::jsonb)`, [
      'evenement-de-controle',
      'commande_confirmee',
      acheteur.id,
    ]);
    await query(`select public.programmer_email($1, $2, $3, '{}'::jsonb)`, [
      'evenement-de-controle',
      'commande_confirmee',
      acheteur.id,
    ]);

    expect(
      await query(`select 1 from public.email_outbox where cle_idempotence = $1`, [
        'evenement-de-controle',
      ]),
    ).toHaveLength(1);
  });

  it('un envoi déjà effectué n’est pas repris au vidage suivant', async () => {
    await commanderEtPayer(acheteur);

    const premier = await viderFile({ mailer: new MailerEspion() });
    expect(premier.envoyes).toBe(1);

    const espion = new MailerEspion();
    const second = await viderFile({ mailer: espion });

    expect(second.envoyes).toBe(0);
    expect(espion.messages).toHaveLength(0);
  });
});

describe('(c) AUCUN LIEN SIGNÉ VERS UN FICHIER', () => {
  it('aucun modèle ne produit d’URL signée, dans aucune langue', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ NOS URL SIGNÉES EXPIRENT EN 300 SECONDES.                            │
    // │                                                                      │
    // │ Un email lu le lendemain donnerait un lien mort, et l'utilisateur     │
    // │ conclurait que son achat n'a pas fonctionné. Allonger la durée pour   │
    // │ l'email serait pire : un lien valable une semaine, dans une boîte de  │
    // │ réception, est un fichier payant transmissible par simple transfert.  │
    // └──────────────────────────────────────────────────────────────────────┘
    expect(MODELES_CONNUS.length).toBeGreaterThanOrEqual(4);

    const coupables: string[] = [];
    for (const modele of MODELES_CONNUS) {
      for (const langue of ['fr', 'en']) {
        const rendu = rendre(modele, langue, { order_id: livreId }, 'https://exemple.test');
        const tout = `${rendu.sujet}\n${rendu.texte}`;

        // Les signatures des URL de stockage Supabase, et les buckets privés.
        for (const motif of [
          /token=/i,
          /\/storage\/v1\/object\/sign/i,
          /book-downloads/i,
          /book-pages/i,
          /book-sources/i,
          /X-Amz-Signature/i,
        ]) {
          if (motif.test(tout)) coupables.push(`${modele}/${langue} : ${String(motif)}`);
        }
      }
    }

    expect(coupables).toEqual([]);
  });

  it('chaque modèle pointe vers une page de l’application', () => {
    // Le pendant : sans lui, un modèle sans AUCUN lien passerait le test
    // précédent en ne proposant rien du tout.
    for (const modele of MODELES_CONNUS) {
      const rendu = rendre(modele, 'fr', {}, 'https://exemple.test');

      expect(rendu.lien.startsWith('/'), `${modele} : lien non relatif`).toBe(true);
      expect(rendu.texte).toContain('https://exemple.test');
    }
  });

  it('l’email de téléchargement DIT qu’aucun lien n’est envoyé', () => {
    // Le modèle qui appelait le plus un lien direct. L'utilisateur qui cherche
    // un lien dans l'email doit comprendre pourquoi il n'y en a pas, sans quoi
    // il croira à une erreur.
    const fr = rendre('telechargement_pret', 'fr', {}, 'https://exemple.test');
    const en = rendre('telechargement_pret', 'en', {}, 'https://exemple.test');

    expect(fr.texte).toContain('aucun lien de téléchargement n’est envoyé');
    expect(en.texte).toContain('no download link is sent by email');
  });
});

describe('(d) CONTENU MINIMAL — un email s’affiche sur un écran de verrouillage', () => {
  it('aucun SUJET ne contient de titre de livre', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE SUJET EST LU PAR QUICONQUE REGARDE LE TÉLÉPHONE POSÉ SUR LA TABLE.│
    // │                                                                      │
    // │ « Votre commande est confirmée » ne dit rien de ce qui a été acheté ; │
    // │ « Anansi l'araignée maligne est prêt » dit ce qu'un enfant lit.       │
    // └──────────────────────────────────────────────────────────────────────┘
    const titres = await query<{ titre: string }>(
      `select titre from public.book_translations`,
    );
    expect(titres.length).toBeGreaterThan(0);

    const coupables: string[] = [];
    for (const modele of MODELES_CONNUS) {
      for (const langue of ['fr', 'en']) {
        const sujet = rendre(modele, langue, {}, '').sujet;
        for (const { titre } of titres) {
          if (sujet.toLowerCase().includes(titre.toLowerCase())) {
            coupables.push(`${modele}/${langue} : « ${titre} »`);
          }
        }
      }
    }

    expect(coupables).toEqual([]);
  });

  it('aucun SUJET ne contient de montant', () => {
    const coupables: string[] = [];
    for (const modele of MODELES_CONNUS) {
      for (const langue of ['fr', 'en']) {
        const sujet = rendre(modele, langue, {}, '').sujet;
        // Un prix sous ses formes usuelles : « 4,99 € », « 7.99 EUR », « 3000 FCFA ».
        if (/\d+[.,]\d{2}|\d+\s*(€|EUR|FCFA|XAF|XOF)/i.test(sujet)) {
          coupables.push(`${modele}/${langue} : « ${sujet} »`);
        }
      }
    }

    expect(coupables).toEqual([]);
  });

  it('le CORPS ne porte pas non plus de montant', () => {
    // Le montant est sur la facture, dans l'espace client, derrière une
    // authentification. Un email n'a pas besoin de le répéter.
    const coupables: string[] = [];
    for (const modele of MODELES_CONNUS) {
      for (const langue of ['fr', 'en']) {
        const texte = rendre(modele, langue, { order_id: livreId }, '').texte;
        if (/\d+[.,]\d{2}\s*(€|EUR)|\d{3,}\s*(FCFA|XAF|XOF)/i.test(texte)) {
          coupables.push(`${modele}/${langue}`);
        }
      }
    }

    expect(coupables).toEqual([]);
  });

  it('la référence de commande n’est pas l’identifiant complet', async () => {
    // Un UUID complet dans un email est un identifiant interne qui voyage en
    // clair. Une référence courte suffit au support.
    const commande = await commanderEtPayer(acheteur);
    const espion = new MailerEspion();
    await viderFile({ mailer: espion });

    expect(espion.messages).toHaveLength(1);
    expect(espion.messages[0]?.texte).not.toContain(commande);
  });
});

describe('(e) EMAILS BILINGUES, avec repli sur le français', () => {
  it('rend en FRANÇAIS pour un destinataire francophone', () => {
    const rendu = rendre('commande_confirmee', 'fr', {}, '');

    expect(rendu.sujet).toBe('Votre commande est confirmée');
    expect(rendu.texte).toContain('Bonjour');
  });

  it('rend en ANGLAIS pour un destinataire anglophone', () => {
    const rendu = rendre('commande_confirmee', 'en', {}, '');

    expect(rendu.sujet).toBe('Your order is confirmed');
    expect(rendu.texte).toContain('Hello');
  });

  it('REPLIE sur le français pour une langue inconnue, sans échouer', () => {
    // Mieux vaut un message en français à un lecteur anglophone qu'aucun
    // message, quand ce message annonce que sa commande est prête.
    const rendu = rendre('commande_confirmee', 'wo', {}, '');

    expect(rendu.sujet).toBe('Votre commande est confirmée');
  });

  it('suit la langue PRÉFÉRÉE du destinataire, de bout en bout', async () => {
    // Le test qui compte : la langue vient du profil, traverse la file, et
    // ressort dans le message envoyé.
    const anglophone = await createTestUser();
    try {
      await query(`update public.users set langue_preferee = 'en' where id = $1`, [
        anglophone.id,
      ]);

      const commande = await queryOne<{ id: string }>(
        `insert into public.orders (user_id, montant_total, devise, zone, statut)
         values ($1, 499, 'EUR', 'international', 'en_attente') returning id`,
        [anglophone.id],
      );
      await query(
        `insert into public.order_items (order_id, book_id, langue, prix_unitaire, devise, zone)
         values ($1, $2, 'en', 499, 'EUR', 'international')`,
        [commande!.id, livreId],
      );
      await query(`select * from public.fulfill_order($1)`, [commande!.id]);

      const espion = new MailerEspion();
      await viderFile({ mailer: espion });

      const message = espion.messages.find((m) => m.destinataire === anglophone.email);
      expect(message?.langue).toBe('en');
      expect(message?.sujet).toBe('Your order is confirmed');
    } finally {
      await query(`delete from public.email_outbox where user_id = $1`, [anglophone.id]);
      await query(`delete from public.entitlements where user_id = $1`, [anglophone.id]);
      await query(`delete from public.orders where user_id = $1`, [anglophone.id]);
      await deleteTestUser(anglophone);
    }
  });

  it('rend CHAQUE modèle dans les DEUX langues', () => {
    // Un modèle qui n'existerait que dans une langue enverrait du français à un
    // anglophone sans que rien ne le signale.
    for (const modele of MODELES_CONNUS) {
      const fr = rendre(modele, 'fr', {}, '');
      const en = rendre(modele, 'en', {}, '');

      expect(fr.sujet.length).toBeGreaterThan(0);
      expect(en.sujet.length).toBeGreaterThan(0);
      // Les deux versions diffèrent réellement : un modèle qui recopierait le
      // français en anglais passerait autrement.
      expect(en.sujet).not.toBe(fr.sujet);
    }
  });
});

describe('un compte ANONYMISÉ ne reçoit plus rien', () => {
  it('ne programme aucun email pour une adresse anonymisée', async () => {
    // Son adresse est un jeton irréversible `@anonymise.invalid` : lui écrire
    // n'aurait aucun sens, et ferait échouer l'envoi à chaque vidage.
    const partant = await createTestUser();
    await query(`select public.anonymize_user($1)`, [partant.id]);

    const id = await queryOne<{ programmer_email: string | null }>(
      `select public.programmer_email($1, $2, $3, '{}'::jsonb)`,
      ['anonymise-controle', 'commande_confirmee', partant.id],
    );

    expect(id?.programmer_email).toBeNull();
    await deleteTestUser(partant);
  });
});
