import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ContactV3 } from '@/components/v2/contact';
import { IDENTITE_EDITEUR } from '@/content/editorial';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ NOUS ÉCRIRE — L'ÉCRAN ORGANIC.                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QU'UN TEST DE RENDU PEUT DÉFENDRE ICI, ET CE QU'IL NE PEUT PAS.      │
 * │                                                                          │
 * │ Les MESURES — 820 px de bandeau, 56 px de gouttière, 34 px de rayon —    │
 * │ ne se vérifient pas dans jsdom, qui ne met rien en page. Elles se        │
 * │ mesurent dans un navigateur, contre le prototype, et c'est ce que fait   │
 * │ la comparaison d'atelier.                                                │
 * │                                                                          │
 * │ Ce qui se défend ici, c'est ce qu'un remaniement casserait sans bruit :  │
 * │ le formulaire part-il vraiment vers le courrier de l'éditeur, le choix   │
 * │ du sujet voyage-t-il avec lui, et les coordonnées sont-elles LUES sur    │
 * │ l'identité de l'éditeur plutôt que recopiées de la maquette.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('la colonne des coordonnées', () => {
  it('lit l’identité de l’éditeur, jamais les valeurs de la maquette', () => {
    render(<ContactV3 langue="fr" />);

    /*
     * La maquette écrit « Yassa, Douala, Cameroun » — une adresse RACCOURCIE.
     * Le dépôt porte la vraie, avec son lieu-dit. C'est la règle du
     * `CLAUDE.md` : une maquette n'est jamais une autorité sur une donnée.
     */
    expect(screen.getByText(IDENTITE_EDITEUR.adresse)).toBeTruthy();
    expect(screen.getByText(IDENTITE_EDITEUR.telephone)).toBeTruthy();
    expect(screen.getByText(IDENTITE_EDITEUR.emailContact)).toBeTruthy();
  });

  /**
   * Trois étiquettes DISTINCTES.
   *
   * Le lot 9 avait corrigé deux `<dt>` identiques sur l'écran de la V2 : à
   * l'oreille, « Nos coordonnées : Yassa… Nos coordonnées : +237… » ne dit
   * jamais ce qu'est la seconde valeur. Le dessin a changé, la règle non.
   */
  it('chaque coordonnée porte son propre intitulé', () => {
    render(<ContactV3 langue="fr" />);

    const intitules = screen
      .getAllByRole('listitem')
      .map((ligne) => ligne.textContent?.replace(/\s+/g, ' ') ?? '');

    expect(intitules.some((t) => t.startsWith('Adresse'))).toBe(true);
    expect(intitules.some((t) => t.startsWith('Téléphone'))).toBe(true);
    expect(intitules.some((t) => t.startsWith('Email'))).toBe(true);
  });

  /**
   * Le numéro se compose, l'adresse ne s'ouvre nulle part.
   *
   * `tel:` sans espaces : certains combinés ne composent pas un numéro qui en
   * contient. Et pas de lien sur l'adresse — un lien qui ne mène nulle part
   * est une promesse cassée, pas une commodité.
   */
  it('le téléphone et le courriel sont cliquables, l’adresse ne l’est pas', () => {
    render(<ContactV3 langue="fr" />);

    expect(screen.getByRole('link', { name: IDENTITE_EDITEUR.telephone }).getAttribute('href')).toBe(
      `tel:${IDENTITE_EDITEUR.telephone.replace(/\s/g, '')}`,
    );
    expect(
      screen.getByRole('link', { name: IDENTITE_EDITEUR.emailContact }).getAttribute('href'),
    ).toBe(`mailto:${IDENTITE_EDITEUR.emailContact}`);

    const adresse = screen.getByText(IDENTITE_EDITEUR.adresse);
    expect(adresse.querySelector('a')).toBeNull();
  });

  /**
   * Les pictogrammes n'ajoutent rien à ce qui est dit.
   *
   * C'est ce qui autorise la terre cuite sur le fond doux — 2,84:1, sous le
   * seuil de WCAG 1.4.11 pour un graphique PORTEUR d'information. S'ils
   * cessaient d'être masqués, l'exemption tomberait avec eux.
   */
  it('les pictogrammes sont masqués aux lecteurs d’écran', () => {
    const { container } = render(<ContactV3 langue="fr" />);

    const parlants = [...container.querySelectorAll('svg')].filter(
      (svg) => svg.getAttribute('aria-hidden') !== 'true',
    );

    expect(parlants).toHaveLength(0);
  });
});

describe('le formulaire', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ IL OUVRE LE COURRIEL — ET AUCUNE ROUTE.                              │
   * │                                                                      │
   * │ Aucun prestataire d'envoi n'est branché : un formulaire qui dirait   │
   * │ « message envoyé » ferait attendre une réponse qui ne viendrait pas. │
   * │ Le jour où une route existera, ce test dira exactement où regarder.  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('adresse le courrier à l’éditeur', () => {
    const { container } = render(<ContactV3 langue="fr" />);
    const formulaire = container.querySelector('form');

    expect(formulaire?.getAttribute('action')).toBe(`mailto:${IDENTITE_EDITEUR.emailContact}`);
    expect(formulaire?.getAttribute('method')).toBe('get');
  });

  it('porte quatre champs, et aucune donnée d’enfant', () => {
    const { container } = render(<ContactV3 langue="fr" />);

    const noms = [...container.querySelectorAll('input, textarea')].map((champ) =>
      champ.getAttribute('name'),
    );

    expect(new Set(noms)).toEqual(new Set(['nom', 'email', 'sujet', 'message']));
    /*
     * Le §7 des règles de sécurité : aucune donnée d'enfant, nulle part. Un
     * formulaire de contact est exactement l'endroit où un champ « âge de
     * votre enfant » s'ajoute un jour « pour mieux conseiller ».
     *
     * La recherche porte sur les CHAMPS et leurs étiquettes, pas sur la page :
     * la colonne de gauche promet en toutes lettres qu'on ne demande jamais
     * rien sur les enfants, et cette phrase-là doit rester.
     */
    const formulaire = container.querySelector('form') as HTMLElement;
    expect(formulaire.textContent ?? '').not.toMatch(/enfant/i);
    for (const champ of formulaire.querySelectorAll('input, textarea')) {
      expect(champ.outerHTML).not.toMatch(/enfant/i);
    }
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE SUJET EST UN GROUPE DE BOUTONS RADIO, ET IL PART AVEC LE MESSAGE. │
   * │                                                                      │
   * │ Le prototype en fait quatre boutons et garde le choix dans son état  │
   * │ React. Traduit tel quel, le sujet ne quitterait jamais la page : il  │
   * │ n'y a pas de JavaScript ici, et le courrier partirait sans lui.      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('le sujet est un choix unique, dont le premier est présélectionné', () => {
    const { container } = render(<ContactV3 langue="fr" />);

    const sujets = [...container.querySelectorAll('input[type="radio"][name="sujet"]')];
    expect(sujets.map((s) => s.getAttribute('value'))).toEqual([
      'livre',
      'livret',
      'consulting',
      'association',
    ]);

    const coches = sujets.filter((s) => (s as HTMLInputElement).defaultChecked);
    expect(coches).toHaveLength(1);
    expect(coches[0]?.getAttribute('value')).toBe('livre');
  });

  /**
   * La VALEUR envoyée ne se traduit pas.
   *
   * Un message venu du site anglais doit se trier avec ceux du site français.
   * Si la valeur suivait le libellé, la boîte de réception aurait huit
   * catégories au lieu de quatre — et personne ne s'en apercevrait avant d'en
   * compter les résultats.
   */
  it('la valeur du sujet reste la même en anglais', () => {
    const { container: fr } = render(<ContactV3 langue="fr" />);
    const { container: en } = render(<ContactV3 langue="en" />);

    const valeurs = (racine: HTMLElement) =>
      [...racine.querySelectorAll('input[name="sujet"]')].map((s) => s.getAttribute('value'));

    expect(valeurs(en)).toEqual(valeurs(fr));
    // …mais les libellés, eux, changent bel et bien.
    expect(en.textContent).not.toBe(fr.textContent);
  });

  it('le groupe de sujets porte son intitulé', () => {
    const { container } = render(<ContactV3 langue="fr" />);
    const groupe = container.querySelector('fieldset');

    expect(groupe).toBeTruthy();
    expect(within(groupe as HTMLElement).getByText('Votre demande porte sur')).toBeTruthy();
  });

  it('les trois champs de saisie sont nécessaires, et étiquetés', () => {
    render(<ContactV3 langue="fr" />);

    for (const nom of ['Nom complet', 'Adresse email', 'Votre message']) {
      const champ = screen.getByLabelText(nom);
      expect(champ.hasAttribute('required')).toBe(true);
    }
  });

  it('le bouton d’envoi porte le libellé de la maquette', () => {
    render(<ContactV3 langue="fr" />);
    expect(screen.getByRole('button', { name: /Envoyer/ })).toBeTruthy();
  });
});
