import { describe, expect, it } from 'vitest';

import { normaliserPays, zonePourPays } from '@/domain/orders/zones';
import {
  ENTETE_PAYS_VISITEUR,
  paysDuVisiteur,
  zoneDuVisiteur,
} from '@/lib/http/pays-visiteur';

/**
 * Le pays du visiteur — zone d'AFFICHAGE et pays prérempli au récapitulatif.
 *
 * Il n'engage aucun montant : le prix payé dépend du pays déclaré, auquel le
 * paiement est verrouillé chez le prestataire. Ce qui est défendu ici, c'est
 * qu'une donnée absente ou illisible ne vaille JAMAIS la grille réduite.
 */

function avec(pays?: string): Headers {
  return new Headers(pays === undefined ? {} : { [ENTETE_PAYS_VISITEUR]: pays });
}

describe('normaliserPays', () => {
  it('accepte deux lettres, quelle que soit la casse ou les espaces', () => {
    expect(normaliserPays('cm')).toBe('CM');
    expect(normaliserPays(' Sn ')).toBe('SN');
  });

  it('refuse tout le reste — et « XX », le pays inconnu de Cloudflare', () => {
    for (const brut of ['', 'CMR', 'C', '12', 'XX', null, undefined, 42]) {
      expect(normaliserPays(brut)).toBeNull();
    }
  });
});

describe('le pays du visiteur', () => {
  it('est lu dans l’en-tête posé par Vercel', () => {
    expect(paysDuVisiteur(avec('CM'))).toBe('CM');
    expect(zoneDuVisiteur(avec('CM'))).toBe('afrique');
    expect(zoneDuVisiteur(avec('FR'))).toBe('international');
  });

  it('manquant — pile locale, VPS — retombe sur la grille la plus CHÈRE', () => {
    expect(paysDuVisiteur(avec())).toBeNull();
    expect(zoneDuVisiteur(avec())).toBe('international');
  });

  it('illisible, retombe aussi sur la grille la plus chère', () => {
    expect(zoneDuVisiteur(avec('Cameroun'))).toBe('international');
  });

  it('passe par la correspondance de `zones.ts`, et par elle seule', () => {
    for (const pays of ['CM', 'SN', 'CI', 'FR', 'BE', 'US']) {
      expect(zoneDuVisiteur(avec(pays))).toBe(zonePourPays(pays));
    }
  });
});
