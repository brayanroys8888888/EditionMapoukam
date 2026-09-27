import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import fr from '@/i18n/fr.json';
import en from '@/i18n/en.json';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ CHAQUE REFUS DE CODE PROMOTIONNEL A SA PHRASE, DANS LES DEUX LANGUES.     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CE TEST A TROUVÉ LE JOUR OÙ IL A ÉTÉ ÉCRIT.                      │
 * │                                                                          │
 * │ Trois refus sur sept n'avaient aucune traduction : `inactif`,            │
 * │ `devise_incompatible` et `zone_incompatible`. Les écrans du panier       │
 * │ composent la clé à la volée — `panier.refus_promo_${raison}` — et        │
 * │ `traduire` replie sur la CLÉ BRUTE quand elle manque.                    │
 * │                                                                          │
 * │ Autrement dit : un client qui saisissait un code désactivé lisait        │
 * │ « panier.refus_promo_inactif » sur la page de son panier. Rien ne        │
 * │ l'aurait signalé — ni le compilateur, qui ne voit qu'un gabarit de       │
 * │ chaîne, ni les tests du domaine, qui vérifient la RAISON et pas sa       │
 * │ formulation.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les raisons sont lues dans le TYPE, pas recopiées : une huitième ajoutée à
 * `RefusPromo` fera échouer ce test tant qu'elle n'aura pas sa phrase.
 */
const SOURCE = join(process.cwd(), 'src', 'domain', 'orders', 'promo.ts');

function raisons(): string[] {
  const source = readFileSync(SOURCE, 'utf8');
  const bloc = /export type RefusPromo =([\s\S]*?);/.exec(source)?.[1];
  expect(bloc, 'le type RefusPromo est introuvable').toBeTruthy();
  return [...(bloc ?? '').matchAll(/'([a-z_]+)'/g)].map((t) => t[1] ?? '');
}

describe('les refus d’un code promotionnel', () => {
  it('sont au moins sept — sinon le type a été vidé sans qu’on le voie', () => {
    expect(raisons().length).toBeGreaterThanOrEqual(7);
  });

  it('ont tous une phrase en français ET en anglais', () => {
    const manques: string[] = [];

    for (const raison of raisons()) {
      const cle = `refus_promo_${raison}`;
      if (!(cle in fr.panier)) manques.push(`fr : panier.${cle}`);
      if (!(cle in en.panier)) manques.push(`en : panier.${cle}`);
    }

    expect(
      manques,
      'Sans phrase, `traduire` replie sur la clé brute et le client la lit :\n' +
        manques.join('\n'),
    ).toEqual([]);
  });
});
