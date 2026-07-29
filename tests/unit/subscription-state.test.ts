import { describe, expect, it } from 'vitest';

import {
  EVENEMENTS,
  STATUTS,
  demarreGrace,
  dureeEnMois,
  ouvreNouvellePeriode,
  transitionner,
  type EvenementAbonnement,
  type StatutAbonnement,
} from '@/domain/subscriptions/state-machine';

/**
 * Machine à états de l'abonnement — §9.1.
 *
 * Module pur, donc éprouvable sur les VINGT-CINQ combinaisons plutôt que sur
 * les trois d'un parcours nominal. C'est là tout l'intérêt de l'avoir extrait :
 * les transitions qui coûtent cher sont celles qu'on ne pense pas à essayer.
 */

describe('souscription', () => {
  it('ouvre sur un essai quand l’offre en comporte un', () => {
    // §3.4 — essai gratuit de 7 jours, moyen de paiement requis.
    expect(transitionner(null, 'souscrit', { avecEssai: true })).toEqual({
      ok: true,
      statut: 'essai',
      inchange: false,
    });
  });

  it('part directement en actif sans essai', () => {
    expect(transitionner(null, 'souscrit', { avecEssai: false })).toEqual({
      ok: true,
      statut: 'actif',
      inchange: false,
    });
  });

  it('REFUSE une seconde souscription sur un abonnement vivant', () => {
    // Ce serait un double prélèvement.
    for (const statut of ['essai', 'actif', 'impaye', 'annule'] as const) {
      expect(transitionner(statut, 'souscrit'), `depuis ${statut}`).toEqual({
        ok: false,
        raison: 'deja_souscrit',
      });
    }
  });

  it('autorise une nouvelle souscription après expiration', () => {
    // Un ancien abonné doit pouvoir revenir.
    expect(transitionner('expire', 'souscrit').ok).toBe(true);
  });

  it('refuse tout autre événement en l’absence d’abonnement', () => {
    for (const evenement of ['renouvele', 'prelevement_echoue', 'annule'] as const) {
      expect(transitionner(null, evenement)).toEqual({
        ok: false,
        raison: 'souscription_requise',
      });
    }
  });
});

describe('renouvellement', () => {
  it('mène à actif depuis un essai', () => {
    // Le parcours nominal : sept jours d'essai, puis le premier prélèvement.
    expect(transitionner('essai', 'renouvele')).toEqual({
      ok: true,
      statut: 'actif',
      inchange: false,
    });
  });

  it('rattrape un impayé', () => {
    // Carte refusée puis remplacée : le prélèvement réussit et tout rentre
    // dans l'ordre.
    expect(transitionner('impaye', 'renouvele')).toEqual({
      ok: true,
      statut: 'actif',
      inchange: false,
    });
  });

  it('REFUSE de renouveler un abonnement annulé', () => {
    // C'est précisément l'objet de l'annulation. Un prélèvement qui
    // surviendrait après serait une erreur du prestataire, pas une
    // reconduction à honorer.
    expect(transitionner('annule', 'renouvele')).toEqual({
      ok: false,
      raison: 'annulation_definitive',
    });
  });

  it('refuse de renouveler un abonnement expiré', () => {
    expect(transitionner('expire', 'renouvele')).toEqual({
      ok: false,
      raison: 'abonnement_termine',
    });
  });

  it('signale l’absence de changement quand il était déjà actif', () => {
    expect(transitionner('actif', 'renouvele').ok && transitionner('actif', 'renouvele')).toEqual({
      ok: true,
      statut: 'actif',
      inchange: true,
    });
  });
});

describe('échec de prélèvement', () => {
  it('fait basculer en impayé', () => {
    expect(transitionner('actif', 'prelevement_echoue')).toEqual({
      ok: true,
      statut: 'impaye',
      inchange: false,
    });
  });

  it('est idempotent : deux échecs ne relancent pas la grâce', () => {
    // Un prestataire qui réessaie chaque jour prolongerait sinon la période de
    // grâce indéfiniment.
    const second = transitionner('impaye', 'prelevement_echoue');

    expect(second).toEqual({ ok: true, statut: 'impaye', inchange: true });
    expect(demarreGrace('impaye', 'impaye')).toBe(false);
  });

  it('fait courir la grâce au PREMIER échec seulement', () => {
    expect(demarreGrace('actif', 'impaye')).toBe(true);
    expect(demarreGrace('essai', 'impaye')).toBe(true);
    expect(demarreGrace('impaye', 'impaye')).toBe(false);
  });

  it('REFUSE de rouvrir une grâce sur un abonnement annulé', () => {
    // Sinon un échec de prélèvement tardif rouvrirait une période de grâce sur
    // un abonnement que l'utilisateur a résilié.
    expect(transitionner('annule', 'prelevement_echoue')).toEqual({
      ok: false,
      raison: 'annulation_definitive',
    });
  });
});

describe('annulation', () => {
  it('est acceptée depuis tous les états vivants', () => {
    for (const statut of ['essai', 'actif', 'impaye'] as const) {
      expect(transitionner(statut, 'annule').ok, `depuis ${statut}`).toBe(true);
    }
  });

  it('est idempotente', () => {
    expect(transitionner('annule', 'annule')).toEqual({
      ok: true,
      statut: 'annule',
      inchange: true,
    });
  });

  it('N’OUVRE PAS de nouvelle période', () => {
    // `fin_periode` reste intacte : c'est elle qui porte la promesse de §9.1,
    // « accès maintenu jusqu'à la fin de la période payée ».
    expect(ouvreNouvellePeriode('annule')).toBe(false);
  });
});

describe('expiration', () => {
  it('est toujours recevable', () => {
    for (const statut of STATUTS) {
      expect(transitionner(statut, 'expire').ok, `depuis ${statut}`).toBe(true);
    }
  });

  it('est idempotente', () => {
    expect(transitionner('expire', 'expire')).toEqual({
      ok: true,
      statut: 'expire',
      inchange: true,
    });
  });

  it('ferme tout : plus aucun événement n’est recevable ensuite', () => {
    for (const evenement of ['renouvele', 'prelevement_echoue', 'annule'] as const) {
      expect(transitionner('expire', evenement).ok, evenement).toBe(false);
    }
  });
});

describe('périodes', () => {
  it('ne sont ouvertes que par la souscription et le renouvellement', () => {
    expect(ouvreNouvellePeriode('souscrit')).toBe(true);
    expect(ouvreNouvellePeriode('renouvele')).toBe(true);
    expect(ouvreNouvellePeriode('prelevement_echoue')).toBe(false);
    expect(ouvreNouvellePeriode('annule')).toBe(false);
    expect(ouvreNouvellePeriode('expire')).toBe(false);
  });

  it('durent un mois ou douze', () => {
    expect(dureeEnMois('mensuel')).toBe(1);
    expect(dureeEnMois('annuel')).toBe(12);
  });
});

describe('exhaustivité', () => {
  it('répond à TOUTES les combinaisons état × événement', () => {
    // Vingt-cinq combinaisons plus les cinq depuis « aucun abonnement ». Aucune
    // ne doit lever : une machine à états qui plante sur une entrée inattendue
    // est une panne en production, pas un refus.
    const etats: (StatutAbonnement | null)[] = [null, ...STATUTS];

    for (const etat of etats) {
      for (const evenement of EVENEMENTS as readonly EvenementAbonnement[]) {
        expect(() => transitionner(etat, evenement), `${String(etat)} × ${evenement}`).not.toThrow();
      }
    }
  });
});
