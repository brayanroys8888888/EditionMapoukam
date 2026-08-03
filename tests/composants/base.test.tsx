import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Bouton, Champ, Pagination, Pastille, Tableau } from '@/components/base';
import type { ColonneTableau } from '@/components/base';
import { Chargement, Erreur, HorsLigne, Squelette, Vide } from '@/components/etats';

/**
 * COMPOSANTS DE BASE ET ÉTATS PARTAGÉS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST ÉPROUVÉ ICI EST CE QU'ON NE VOIT PAS EN REGARDANT L'ÉCRAN :  │
 * │ les liens `label`/`input`, `aria-invalid`, `aria-pressed`, la cible      │
 * │ tactile, l'état désactivé.                                              │
 * │                                                                          │
 * │ Un composant peut être parfait à l'œil et inutilisable au clavier ou au  │
 * │ lecteur d'écran. C'est exactement le défaut qu'un test de rendu attrape  │
 * │ et qu'une relecture ne voit pas.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

describe('Bouton', () => {
  it('vaut `type="button"` par défaut', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ SANS `type` EXPLICITE, UN BOUTON DANS UN FORMULAIRE VAUT `submit`. │
    // │                                                                    │
    // │ « Retirer du panier » enverrait alors la commande. C'est le défaut │
    // │ le plus courant des interfaces React, et le plus surprenant.       │
    // └────────────────────────────────────────────────────────────────────┘
    render(<Bouton>Agir</Bouton>);
    expect(screen.getByRole('button', { name: 'Agir' })).toHaveProperty('type', 'button');
  });

  it('honore un `type="submit"` demandé — le contre-test', () => {
    // Sans cette assertion, un composant qui forcerait `button` en toutes
    // circonstances passerait le test précédent, et aucun formulaire ne
    // pourrait plus être soumis.
    render(<Bouton type="submit">Envoyer</Bouton>);
    expect(screen.getByRole('button', { name: 'Envoyer' })).toHaveProperty('type', 'submit');
  });

  it('en cours : désactivé ET annoncé, pour que le double-clic soit impossible', async () => {
    // Sur le téléchargement, un double-clic déclencherait deux générations de
    // copie filigranée — chacune tenant une place du sémaphore.
    const clic = vi.fn();
    render(
      <Bouton enCours onClick={clic}>
        Préparer
      </Bouton>,
    );

    const bouton = screen.getByRole('button', { name: 'Préparer' });
    expect(bouton).toHaveProperty('disabled', true);
    expect(bouton.getAttribute('aria-busy')).toBe('true');

    await userEvent.click(bouton);
    expect(clic).not.toHaveBeenCalled();
  });

  it('désactivé, il n’appelle pas son gestionnaire', async () => {
    const clic = vi.fn();
    render(
      <Bouton disabled onClick={clic}>
        Acheter
      </Bouton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Acheter' }));
    expect(clic).not.toHaveBeenCalled();
  });

  it('actif, il appelle bien son gestionnaire', async () => {
    // La garde des deux tests précédents : sans elle, un bouton qui n'appelle
    // JAMAIS son gestionnaire les passerait tous les deux.
    const clic = vi.fn();
    render(<Bouton onClick={clic}>Lire</Bouton>);
    await userEvent.click(screen.getByRole('button', { name: 'Lire' }));
    expect(clic).toHaveBeenCalledOnce();
  });
});

describe('Champ', () => {
  it('relie le libellé au champ', () => {
    // Sans `<label for>`, un lecteur d'écran annonce « zone de saisie » et
    // rien d'autre. `getByLabelText` échoue précisément dans ce cas.
    render(<Champ id="email" libelle="Adresse email" type="email" />);
    expect(screen.getByLabelText('Adresse email')).toBeDefined();
  });

  it('marque l’erreur AUTREMENT que par la couleur', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Une bordure rouge ne dit rien à qui ne distingue pas le rouge, et  │
    // │ rien du tout à un lecteur d'écran. `aria-invalid` et un message    │
    // │ relié par `aria-describedby` le disent à tout le monde.            │
    // └────────────────────────────────────────────────────────────────────┘
    render(<Champ id="mdp" libelle="Mot de passe" erreur="Ce mot de passe est trop court." />);

    const saisie = screen.getByLabelText('Mot de passe');
    expect(saisie.getAttribute('aria-invalid')).toBe('true');
    expect(saisie.getAttribute('aria-describedby')).toContain('mdp-erreur');

    // `role="alert"` : annoncé dès qu'il paraît, sans quoi l'utilisateur
    // resoumet sans savoir ce qui a été refusé.
    expect(screen.getByRole('alert').textContent).toBe('Ce mot de passe est trop court.');
  });

  it('sans erreur, ne prétend pas être invalide — le contre-test', () => {
    render(<Champ id="nom" libelle="Nom" />);
    const saisie = screen.getByLabelText('Nom');
    expect(saisie.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('relie l’aide ET l’erreur quand les deux sont présentes', () => {
    render(<Champ id="code" libelle="Code" aide="Lettres et chiffres." erreur="Code inconnu." />);
    const decrit = screen.getByLabelText('Code').getAttribute('aria-describedby') ?? '';
    expect(decrit).toContain('code-aide');
    expect(decrit).toContain('code-erreur');
  });
});

describe('Pastille', () => {
  it('porte son état dans `aria-pressed`, pas dans sa seule couleur', () => {
    // Un filtre actif qu'on ne voit pas est un catalogue qui ment sur ce
    // qu'il montre.
    render(
      <Pastille actif onClick={() => undefined}>
        Sahel
      </Pastille>,
    );
    expect(screen.getByRole('button', { pressed: true })).toBeDefined();
  });

  it('inactive, l’annonce aussi — le contre-test', () => {
    render(<Pastille onClick={() => undefined}>Sahel</Pastille>);
    expect(screen.getByRole('button', { pressed: false })).toBeDefined();
  });

  it('sans gestionnaire, c’est une étiquette et non un bouton', () => {
    // Un élément annoncé « bouton » mais qui ne fait rien envoie l'utilisateur
    // au clavier sur une impasse.
    render(<Pastille region="afrique_ouest">Afrique de l’Ouest</Pastille>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Afrique de l’Ouest')).toBeDefined();
  });
});

describe('Pagination', () => {
  it('rend des LIENS, pour que la page soit partageable', () => {
    // Des boutons mutant un état en mémoire perdraient le partage, le
    // rechargement et l'indexation des pages suivantes (§5.4).
    render(<Pagination langue="fr" page={2} pages={5} total={98} lien={(p) => `?page=${String(p)}`} />);

    const precedente = screen.getByRole('link', { name: 'Page précédente' });
    expect(precedente.getAttribute('href')).toBe('?page=1');
    expect(screen.getByRole('link', { name: 'Page suivante' }).getAttribute('href')).toBe('?page=3');
  });

  it('n’offre pas de lien mort aux extrémités', () => {
    // Un lien désactivé reste focalisable et annoncé : il promet une
    // navigation qui n'existe pas.
    render(<Pagination langue="fr" page={1} pages={3} total={50} lien={(p) => `?page=${String(p)}`} />);
    expect(screen.queryByRole('link', { name: 'Page précédente' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Page suivante' })).toBeDefined();
  });

  it('disparaît quand il n’y a qu’une page', () => {
    const { container } = render(
      <Pagination langue="fr" page={1} pages={1} total={4} lien={() => '#'} />,
    );
    expect(container.textContent).toBe('');
  });

  it('compose sa position sans concaténer — l’anglais n’a pas le même ordre', () => {
    render(<Pagination langue="en" page={2} pages={5} total={98} lien={() => '#'} />);
    expect(screen.getByText('Page 2 of 5 — 98 results')).toBeDefined();
  });
});

describe('Tableau', () => {
  interface Ligne {
    slug: string;
    n: number;
  }

  const colonnes: ColonneTableau<Ligne>[] = [
    { cle: 'slug', entete: 'Titre', rendu: (l) => l.slug },
    { cle: 'n', entete: 'Ventes', rendu: (l) => l.n, numerique: true },
  ];

  it('porte une légende, même invisible', () => {
    // Sans elle, un lecteur d'écran doit parcourir les en-têtes pour deviner
    // ce que le tableau contient.
    render(
      <Tableau
        legende="Commandes"
        colonnes={colonnes}
        lignes={[{ slug: 'anansi', n: 12 }]}
        cleLigne={(l) => l.slug}
      />,
    );
    expect(screen.getByRole('table', { name: 'Commandes' })).toBeDefined();
  });

  it('déclare la portée de ses en-têtes', () => {
    render(
      <Tableau
        legende="Commandes"
        colonnes={colonnes}
        lignes={[{ slug: 'anansi', n: 12 }]}
        cleLigne={(l) => l.slug}
      />,
    );
    for (const entete of screen.getAllByRole('columnheader')) {
      expect(entete.getAttribute('scope')).toBe('col');
    }
  });

  it('rend l’état vide plutôt qu’un tableau sans ligne', () => {
    // Un tableau à en-têtes et sans corps se lit comme un chargement inachevé.
    render(
      <Tableau
        legende="Commandes"
        colonnes={colonnes}
        lignes={[]}
        cleLigne={(l) => l.slug}
        vide={<Vide langue="fr" titre="Aucune commande" />}
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Aucune commande')).toBeDefined();
  });
});

describe('états partagés', () => {
  it('le chargement est annoncé sans interrompre la lecture en cours', () => {
    render(<Chargement langue="fr" />);
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByText('Chargement…')).toBeDefined();
  });

  it('au-delà du seuil, il DIT que la connexion semble lente', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Un rotor qui tourne indéfiniment se lit comme une panne. Le dire   │
    // │ distingue « c'est long » de « ça ne marche pas » — la différence   │
    // │ entre attendre et abandonner.                                      │
    // └────────────────────────────────────────────────────────────────────┘
    render(<Chargement langue="fr" lent />);
    expect(screen.getByText(/connexion semble lente/i)).toBeDefined();
  });

  it('sous le seuil, il ne l’annonce PAS — le contre-test', () => {
    render(<Chargement langue="fr" />);
    expect(screen.queryByText(/connexion semble lente/i)).toBeNull();
  });

  it('l’erreur affiche le message du CODE, jamais un détail technique', () => {
    render(<Erreur langue="en" code="session_expiree" />);
    expect(screen.getByRole('alert')).toBeDefined();
    // Traduit : l'API ne rédige qu'en français, et l'interface branche sur le
    // code pour pouvoir dire autre chose.
    expect(screen.getByText(/session has expired/i)).toBeDefined();
  });

  it('un code inconnu ne laisse pas l’écran muet', () => {
    render(<Erreur langue="fr" code="code_venu_du_futur" />);
    expect(screen.getByText('Une erreur est survenue.')).toBeDefined();
  });

  it('hors ligne n’offre PAS « réessayer »', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Le bouton échouerait sans réseau, et l'utilisateur conclurait que  │
    // │ le site est cassé. Sur ce public, la coupure est ordinaire.        │
    // └────────────────────────────────────────────────────────────────────┘
    render(<HorsLigne langue="fr" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/dès que la connexion reviendra/i)).toBeDefined();
  });

  it('l’erreur, elle, l’offre bien — le contre-test', async () => {
    const reessayer = vi.fn();
    render(<Erreur langue="fr" code="erreur_interne" onReessayer={reessayer} />);
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(reessayer).toHaveBeenCalledOnce();
  });

  it('le squelette se déclare occupé', () => {
    // `aria-busy` évite qu'un lecteur d'écran annonce des barres vides comme
    // du contenu.
    render(<Squelette lignes={4} />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });

  it('l’état vide propose une issue', () => {
    // Un état vide sans issue est un cul-de-sac.
    render(
      <Vide
        langue="fr"
        action={<Bouton>Retirer les filtres</Bouton>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Retirer les filtres' })).toBeDefined();
  });
});
