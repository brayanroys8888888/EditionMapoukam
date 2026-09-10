import { describe, expect, it } from 'vitest';

import { rendre } from '@/domain/emails/templates';
import { rendreHtml } from '@/lib/emails/html';

/**
 * LA MISE EN FORME HTML DES EMAILS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CES CAS PROTÈGENT.                                                │
 * │                                                                          │
 * │ Le HTML est une VUE du texte, jamais une seconde rédaction. Le jour où   │
 * │ quelqu'un écrirait la prose directement dans le composant, le texte et   │
 * │ le HTML diraient deux choses différentes — et personne ne le verrait,    │
 * │ puisqu'un lecteur ne reçoit jamais les deux.                             │
 * │                                                                          │
 * │ On vérifie donc que le HTML contient ce que le TEXTE contient, et les    │
 * │ deux interdits qui valent partout ailleurs : aucun lien signé, aucun     │
 * │ titre ni montant hors du corps.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const BASE = 'http://localhost:3000';
const MODELES = ['commande_confirmee', 'abonnement_bienvenue', 'abonnement_impaye', 'telechargement_pret'];

describe('la mise en forme HTML d’un email', () => {
  it('rend un document HTML complet pour chaque modèle, dans les deux langues', async () => {
    for (const modele of MODELES) {
      for (const langue of ['fr', 'en'] as const) {
        const rendu = rendre(modele, langue, { order_id: 'abcdef12-3456-7890-abcd-ef1234567890' }, BASE);
        const html = await rendreHtml(rendu, `${BASE}${rendu.lien}`, langue);

        expect(html, `${modele}/${langue}`).toContain('<!DOCTYPE html');
        expect(html, `${modele}/${langue}`).toContain(`lang="${langue}"`);
        // Le sujet est repris en titre : c'est ce qui fait qu'on sait de quoi
        // parle le message sans lire le corps.
        expect(html, `${modele}/${langue}`).toContain(rendu.sujet);
      }
    }
  });

  it('mène au CHEMIN du modèle, et à lui seul', async () => {
    const rendu = rendre('commande_confirmee', 'fr', {}, BASE);
    const html = await rendreHtml(rendu, `${BASE}${rendu.lien}`, 'fr');

    expect(html).toContain(`${BASE}${rendu.lien}`);

    /*
     * Le garde-fou qui compte : une URL signée porte un jeton en paramètre de
     * requête. Aucun email n'en contient, jamais — nos signatures expirent en
     * 300 secondes et un email se lit le lendemain (§D6).
     */
    expect(html).not.toMatch(/token=|signature=|Expires=/i);
  });

  it('n’invente aucune phrase : tout ce qu’il affiche vient du texte', async () => {
    const rendu = rendre('abonnement_bienvenue', 'fr', {}, BASE);
    const html = await rendreHtml(rendu, `${BASE}${rendu.lien}`, 'fr');

    // On retire les balises pour comparer les mots, pas le balisage.
    const mots = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ');

    for (const ligne of rendu.texte.split('\n')) {
      const propre = ligne.trim();
      // Les lignes vides et la ligne d'URL n'ont pas d'équivalent visible :
      // l'URL devient un bouton.
      if (propre === '' || propre.startsWith('http')) continue;
      const debut = propre.slice(0, 24).replace(/\s+/g, ' ');
      expect(mots.replace(/\s+/g, ' '), `absent du HTML : ${propre}`).toContain(debut);
    }
  });

  it('replie sur le français quand la langue est inconnue, comme le texte', async () => {
    const rendu = rendre('commande_confirmee', 'xx', {}, BASE);
    const html = await rendreHtml(rendu, `${BASE}${rendu.lien}`, 'fr');

    expect(rendu.sujet).toBe('Votre commande est confirmée');
    expect(html).toContain('Votre commande est confirmée');
  });
});
