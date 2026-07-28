import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';

import {
  SIGNATURE_HEADER,
  TOLERANCE_SECONDES,
  signerCharge,
  verifierSignature,
} from '@/lib/crypto/webhook-signature';

/**
 * Signature des webhooks.
 *
 * CLAUDE.md règle 5 : signature vérifiée systématiquement, y compris pour le
 * faux prestataire. C'est le seul moyen que la vérification soit réellement
 * développée plutôt que contournée — un faux prestataire qui écrirait
 * directement en base ne prouverait rien.
 */
const SECRET = 'dev_local_webhook_secret';
const INSTANT = new Date('2026-07-28T12:00:00.000Z');
const CORPS = '{"id":"evt_1","type":"paiement.reussi"}';

describe('signature', () => {
  it('produit un en-tête au format attendu', () => {
    const entete = signerCharge(CORPS, SECRET, INSTANT);

    expect(entete).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });

  it('se vérifie elle-même', () => {
    const entete = signerCharge(CORPS, SECRET, INSTANT);

    expect(verifierSignature(CORPS, entete, SECRET, INSTANT)).toEqual({ valide: true });
  });

  it('nomme l’en-tête selon la convention du marché', () => {
    // Pour qu'un prestataire réel se substitue sans toucher au gestionnaire.
    expect(SIGNATURE_HEADER).toBe('x-webhook-signature');
  });
});

describe('rejets', () => {
  it('refuse un en-tête absent', () => {
    expect(verifierSignature(CORPS, null, SECRET, INSTANT)).toEqual({
      valide: false,
      raison: 'entete_absent',
    });
  });

  it('refuse un en-tête malformé', () => {
    expect(verifierSignature(CORPS, 'nimportequoi', SECRET, INSTANT)).toEqual({
      valide: false,
      raison: 'entete_malforme',
    });
  });

  it('refuse un horodatage non numérique', () => {
    expect(verifierSignature(CORPS, 't=hier,v1=abcd', SECRET, INSTANT)).toEqual({
      valide: false,
      raison: 'horodatage_invalide',
    });
  });

  it('refuse une signature fabriquée', () => {
    const horodatage = Math.floor(INSTANT.getTime() / 1000);
    const entete = `t=${String(horodatage)},v1=${'0'.repeat(64)}`;

    expect(verifierSignature(CORPS, entete, SECRET, INSTANT)).toEqual({
      valide: false,
      raison: 'signature_invalide',
    });
  });

  it('refuse une signature valide produite avec un autre secret', () => {
    const entete = signerCharge(CORPS, 'un_autre_secret_local', INSTANT);

    expect(verifierSignature(CORPS, entete, SECRET, INSTANT)).toEqual({
      valide: false,
      raison: 'signature_invalide',
    });
  });

  it('refuse un corps altéré après signature', () => {
    // Le cas qu'un attaquant tenterait : garder l'en-tête, changer le montant.
    const entete = signerCharge(CORPS, SECRET, INSTANT);
    const altere = CORPS.replace('paiement.reussi', 'paiement.echoue');

    expect(verifierSignature(altere, entete, SECRET, INSTANT)).toEqual({
      valide: false,
      raison: 'signature_invalide',
    });
  });

  it('refuse un corps re-sérialisé, même sémantiquement identique', () => {
    // Le piège classique : signer l'objet parsé puis re-sérialisé change
    // l'ordre des clés et les espaces, donc les octets, donc la signature.
    const entete = signerCharge(CORPS, SECRET, INSTANT);
    const reserialise = JSON.stringify({ type: 'paiement.reussi', id: 'evt_1' });

    expect(verifierSignature(reserialise, entete, SECRET, INSTANT).valide).toBe(false);
  });
});

describe('fenêtre temporelle', () => {
  it('accepte à la limite de la tolérance', () => {
    const entete = signerCharge(CORPS, SECRET, INSTANT);
    const juste = new Date(INSTANT.getTime() + TOLERANCE_SECONDES * 1000);

    expect(verifierSignature(CORPS, entete, SECRET, juste).valide).toBe(true);
  });

  it('refuse un événement trop ancien', () => {
    // Sans cette vérification, une signature valide interceptée resterait
    // rejouable indéfiniment.
    const entete = signerCharge(CORPS, SECRET, INSTANT);
    const tard = new Date(INSTANT.getTime() + (TOLERANCE_SECONDES + 1) * 1000);

    expect(verifierSignature(CORPS, entete, SECRET, tard)).toEqual({
      valide: false,
      raison: 'horodatage_hors_tolerance',
    });
  });

  it('refuse un événement daté du futur', () => {
    const futur = new Date(INSTANT.getTime() + 3_600_000);
    const entete = signerCharge(CORPS, SECRET, futur);

    expect(verifierSignature(CORPS, entete, SECRET, INSTANT)).toEqual({
      valide: false,
      raison: 'horodatage_hors_tolerance',
    });
  });
});

describe('compatibilité du schéma', () => {
  it('signe bien « horodatage.corps » et non le corps seul', () => {
    // Reproduction indépendante du calcul, pour qu'un changement d'implémentation
    // ne passe pas inaperçu au prétexte que la fonction se vérifie elle-même.
    const horodatage = Math.floor(INSTANT.getTime() / 1000);
    const attendu = createHmac('sha256', SECRET)
      .update(`${String(horodatage)}.${CORPS}`)
      .digest('hex');

    expect(signerCharge(CORPS, SECRET, INSTANT)).toBe(`t=${String(horodatage)},v1=${attendu}`);
  });
});
