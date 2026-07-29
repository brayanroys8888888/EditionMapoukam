import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { fichiersSources } from '../helpers/sources';

/**
 * LA ZONE D'ENCAISSEMENT NE VIENT JAMAIS DU CLIENT.
 *
 * §3.3 : les zones tarifaires sont « déterminées par le pays de paiement (et
 * non par l'adresse IP, plus facilement contournable) ».
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE TEST EST UNE DETTE À NE PAS LAISSER REVENIR.                         │
 * │                                                                          │
 * │ Pendant l'étape 8, faute de prestataire, `zone_encaissement` était un    │
 * │ champ d'entrée de `POST /api/orders`. C'était une commodité de           │
 * │ développement, et elle a été retirée à l'étape 9 : un acheteur européen  │
 * │ pouvait réclamer la grille Afrique et payer 1 500 FCFA au lieu de        │
 * │ 4,99 €.                                                                  │
 * │                                                                          │
 * │ Le champ ne doit jamais reparaître. Une commodité retirée revient        │
 * │ toujours par la même porte — un correctif pressé, un test à écrire vite  │
 * │ — et ce test est ce qui ferme la porte.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();

/** Fichiers de routes API. */
function routes(): string[] {
  return fichiersSources(join(RACINE, 'src', 'app', 'api'));
}

describe('schémas de validation des routes', () => {
  it('n’acceptent JAMAIS une zone d’encaissement en entrée', () => {
    // On cherche le champ tel qu'il s'écrirait dans un schéma Zod, et non sa
    // simple mention : les commentaires qui expliquent son absence sont
    // légitimes et doivent le rester.
    const coupables = routes()
      .filter((chemin) => {
        const source = readFileSync(chemin, 'utf8');
        // `zone_encaissement:` ou `zoneEncaissement:` suivi d'un validateur.
        return /(?:zone_encaissement|zoneEncaissement)\s*:\s*z\./.test(source);
      })
      .map((chemin) => relative(RACINE, chemin));

    expect(coupables).toEqual([]);
  });

  it('n’acceptent aucune zone en entrée de la route des commandes', () => {
    // `zone_affichee` est la seule tolérée, et elle ne sert QU'À détecter une
    // divergence — jamais à fixer le tarif.
    const source = readFileSync(
      join(RACINE, 'src', 'app', 'api', 'orders', 'route.ts'),
      'utf8',
    );

    const champsZone = [...source.matchAll(/(\w*zone\w*)\s*:\s*z\./gi)].map((m) => m[1]);

    expect(champsZone).toEqual(['zone_affichee']);
  });

  it('n’acceptent aucune zone en entrée de la route d’abonnement', () => {
    // La zone d'un abonnement est figée à la souscription (D4 point 7) : la
    // laisser choisir au client figerait un tarif qu'il aurait lui-même décidé.
    const source = readFileSync(
      join(RACINE, 'src', 'app', 'api', 'subscriptions', 'route.ts'),
      'utf8',
    );

    expect([...source.matchAll(/(\w*zone\w*)\s*:\s*z\./gi)].map((m) => m[1])).toEqual([]);
  });
});

describe('origine de la zone', () => {
  it('est le prestataire, seul à connaître le moyen de paiement', () => {
    // Si ce test ne trouvait pas l'appel, c'est que la zone viendrait d'ailleurs
    // — et « ailleurs », ici, ne peut être que le client.
    const source = readFileSync(join(RACINE, 'src', 'lib', 'orders', 'orders.ts'), 'utf8');

    expect(source).toContain('paysDuMoyenDePaiement');
    expect(source).toContain('zonePourPays');
  });

  it('passe par la correspondance pure, jamais par une condition ad hoc', () => {
    // Une comparaison de pays écrite à la main dans une route finirait par
    // diverger de la liste de référence.
    const coupables = fichiersSources(join(RACINE, 'src'))
      .filter((chemin) => !chemin.endsWith(join('domain', 'orders', 'zones.ts')))
      .filter((chemin) => /['"]afrique['"]\s*:\s*['"]international['"]/.test(readFileSync(chemin, 'utf8')))
      .map((chemin) => relative(RACINE, chemin));

    expect(coupables).toEqual([]);
  });
});
