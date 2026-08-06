import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ChampsCoordonnees, ChoixMoyens, FilEtapes } from '@/components/tunnel';
import { EnteteV2 } from '@/components/enveloppe/v2';
import type { Utilisateur } from '@/domain/api/contract';
import { MOYENS_PAIEMENT, paysDeLOperateur } from '@/domain/payments/moyens';

/**
 * LES ÉCRANS DU TUNNEL — achat et abonnement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI SE VÉRIFIE ICI NE SE VOIT PAS EN CLIQUANT.                       │
 * │                                                                          │
 * │ Un tunnel se démontre en le parcourant une fois, correctement, sur un    │
 * │ écran large. Les défauts de cette famille sont ailleurs : un champ sans  │
 * │ étiquette associée, une carte de règlement qui donne trois arrêts de     │
 * │ tabulation pour une décision, une case décochée qui n'envoie rien.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const PANIER_VIDE = { nombre: 0, affichage: null };

const ADMIN: Utilisateur = {
  id: 'a',
  email: 'editeur@exemple.test',
  role: 'admin',
  langue_preferee: 'fr',
};

const LECTEUR: Utilisateur = { ...ADMIN, role: 'user', email: 'parent@exemple.test' };

describe('le fil d’étapes', () => {
  it('situe l’étape en cours, en toutes lettres AUSSI', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Sous 560 px, les noms d'étapes sont retirés et seules les pastilles │
    // │ restent. « Étape 2 sur 4 » est la seule chose qui subsiste — et      │
    // │ c'est justement la question qu'on se pose en payant sur un          │
    // │ téléphone.                                                          │
    // └────────────────────────────────────────────────────────────────────┘
    render(<FilEtapes langue="fr" parcours="achat" etape={2} />);

    expect(screen.getByText('Étape 2 sur 4')).toBeTruthy();
  });

  it('marque l’étape courante par `aria-current`, et une seule', () => {
    const { container } = render(<FilEtapes langue="fr" parcours="achat" etape={3} />);

    const courantes = container.querySelectorAll('[aria-current="step"]');
    expect(courantes.length).toBe(1);
    expect(courantes[0]?.textContent).toContain('Paiement');
  });

  it('AUCUNE étape n’est un lien, pas même celle déjà franchie', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Revenir de « Paiement » à « Récapitulatif » supposerait de dé-créer │
    // │ une commande, ce qui n'existe pas : elle a un identifiant, et un    │
    // │ webhook peut arriver dessus à tout instant. Chaque écran offre le   │
    // │ retour qui a du sens pour LUI ; ce fil ne fait que situer.          │
    // └────────────────────────────────────────────────────────────────────┘
    const { container } = render(<FilEtapes langue="fr" parcours="achat" etape={4} />);

    expect(container.querySelectorAll('a').length).toBe(0);
  });

  it('dit l’état de chaque étape à qui ne voit pas l’écran', () => {
    // Une pastille verte et un trait gris ne disent rien à un lecteur d'écran,
    // et `aria-current` seul ne distingue pas le franchi de l'à-venir.
    render(<FilEtapes langue="fr" parcours="abonnement" etape={2} />);

    expect(screen.getByText(/étape franchie/)).toBeTruthy();
    expect(screen.getByText(/étape en cours/)).toBeTruthy();
    expect(screen.getByText(/étape à venir/)).toBeTruthy();
  });

  it('le parcours d’abonnement compte TROIS étapes, pas quatre', () => {
    // Il n'a pas de panier : on s'abonne, on ne remplit pas un cabas.
    render(<FilEtapes langue="fr" parcours="abonnement" etape={1} />);

    expect(screen.getByText('Étape 1 sur 3')).toBeTruthy();
  });
});

describe('le choix du moyen de paiement', () => {
  it('offre les trois moyens, chacun sur UN SEUL lien', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Trois liens par carte — le nom, la note, le mot « Choisir » —       │
    // │ donneraient trois arrêts de tabulation pour une seule décision, et  │
    // │ un lecteur d'écran annoncerait trois fois la même destination.      │
    // └────────────────────────────────────────────────────────────────────┘
    const { container } = render(
      <ChoixMoyens langue="fr" lienDuMoyen={(moyen) => `/fr/paiement/x?moyen=${moyen}`} />,
    );

    const liens = container.querySelectorAll('a');
    expect(liens.length).toBe(MOYENS_PAIEMENT.length);

    for (const moyen of MOYENS_PAIEMENT) {
      expect(container.querySelector(`a[href$="moyen=${moyen}"]`)).toBeTruthy();
    }
  });

  it('nomme chaque moyen et dit ce qui va se passer', () => {
    render(<ChoixMoyens langue="fr" lienDuMoyen={(moyen) => `?moyen=${moyen}`} />);

    expect(screen.getByText('Orange Money')).toBeTruthy();
    expect(screen.getByText('MTN Mobile Money')).toBeTruthy();
    expect(screen.getByText('Carte bancaire')).toBeTruthy();
    // Le Mobile Money pousse une confirmation sur le combiné : le dire évite
    // qu'on reste sur l'écran à attendre qu'il se passe quelque chose.
    expect(screen.getAllByText(/demande de confirmation/).length).toBe(2);
  });
});

describe('les coordonnées de règlement', () => {
  it('NE DEMANDE AUCUN NUMÉRO DE CARTE, et explique pourquoi', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LA RÈGLE DE L'ÉCRAN D'ORIGINE, TENUE.                              │
    // │                                                                    │
    // │ Les prestataires réels imposent des champs hébergés chez eux,       │
    // │ précisément pour que le numéro ne touche jamais le serveur du       │
    // │ marchand. Un formulaire de carte écrit ici devrait être démonté le  │
    // │ jour de l'intégration, après avoir appris à des gens à taper leur   │
    // │ carte sur un écran qui n'encaisse rien.                            │
    // └────────────────────────────────────────────────────────────────────┘
    const { container } = render(
      <ChampsCoordonnees langue="fr" moyen="carte" emailDefaut="parent@exemple.test" />,
    );

    for (const nom of ['numero', 'carte', 'cvc', 'cvv', 'expiration']) {
      expect(container.querySelector(`input[name*="${nom}"]`), nom).toBeNull();
    }

    expect(screen.getByText(/ne se saisit pas ici/)).toBeTruthy();
  });

  it('demande pays et téléphone pour le Mobile Money, et eux seuls', () => {
    const { container } = render(
      <ChampsCoordonnees langue="fr" moyen="orange_money" emailDefaut="parent@exemple.test" />,
    );

    expect(container.querySelector('select[name="pays"]')).toBeTruthy();
    expect(container.querySelector('input[name="telephone"]')).toBeTruthy();
  });

  it('ne demande NI pays NI téléphone pour une carte', () => {
    const { container } = render(
      <ChampsCoordonnees langue="fr" moyen="carte" emailDefaut="parent@exemple.test" />,
    );

    expect(container.querySelector('select[name="pays"]')).toBeNull();
    expect(container.querySelector('input[name="telephone"]')).toBeNull();
  });

  it('le menu des pays est filtré PAR OPÉRATEUR', () => {
    // Proposer « Orange Money au Rwanda » enverrait vers un opérateur absent
    // du pays. La validation serveur le refuse aussi — mais un menu qui
    // propose ce que le serveur rejette est un piège.
    const { container } = render(
      <ChampsCoordonnees langue="fr" moyen="orange_money" emailDefaut="a@b.test" />,
    );

    const select = container.querySelector('select[name="pays"]');
    expect(select).toBeTruthy();

    const codes = [...(select?.querySelectorAll('option') ?? [])]
      .map((option) => option.getAttribute('value'))
      .filter((valeur) => valeur !== '');

    expect(codes).toEqual([...paysDeLOperateur('orange_money')]);
    expect(codes).not.toContain('RW');
  });

  it('chaque champ a une ÉTIQUETTE qui lui est associée', () => {
    // Un `<label>` posé à côté sans `for` n'est pas une étiquette : il ne
    // donne ni le focus au clic, ni le nom au lecteur d'écran.
    render(<ChampsCoordonnees langue="fr" moyen="mtn_momo" emailDefaut="a@b.test" />);

    expect(screen.getByLabelText('Nom et prénom')).toBeTruthy();
    expect(screen.getByLabelText('Adresse email')).toBeTruthy();
    expect(screen.getByLabelText('Pays du compte')).toBeTruthy();
    expect(screen.getByLabelText('Numéro de téléphone')).toBeTruthy();
  });

  it('préremplit l’adresse du compte — le serveur la connaît déjà', () => {
    render(<ChampsCoordonnees langue="fr" moyen="carte" emailDefaut="parent@exemple.test" />);

    expect(screen.getByLabelText('Adresse email').getAttribute('value')).toBe(
      'parent@exemple.test',
    );
  });

  it('signale un champ en défaut PAR LE TEXTE, jamais par la seule couleur', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Critère 1.4.1 de WCAG : la couleur ne doit pas être le seul moyen   │
    // │ de transmettre une information. Une bordure rouge s'adresse aux     │
    // │ seules personnes qui distinguent le rouge.                          │
    // └────────────────────────────────────────────────────────────────────┘
    render(
      <ChampsCoordonnees
        langue="fr"
        moyen="orange_money"
        emailDefaut="a@b.test"
        enDefaut={['telephone']}
      />,
    );

    const alerte = screen.getByRole('alert');
    expect(alerte.textContent).toContain('numéro de téléphone');
    expect(screen.getByLabelText('Numéro de téléphone').getAttribute('aria-invalid')).toBe('true');
  });

  it('DIT que rien n’est conservé, et qu’aucune donnée d’enfant n’est demandée', () => {
    // La contrepartie honnête d'un formulaire qui demande un numéro personnel,
    // et le rappel de la règle 7 de CLAUDE.md au seul endroit où l'on saisit
    // quelque chose.
    render(<ChampsCoordonnees langue="fr" moyen="orange_money" emailDefaut="a@b.test" />);

    expect(screen.getByText(/ne sont pas enregistrées sur ce site/)).toBeTruthy();
    expect(screen.getByText(/jamais le prénom, l'âge ni la date de naissance/)).toBeTruthy();
  });
});

describe('le raccourci d’administration dans l’en-tête', () => {
  it('paraît pour un ADMINISTRATEUR', () => {
    const { container } = render(
      <EnteteV2 langue="fr" utilisateur={ADMIN} chemin="/fr/catalogue" panier={PANIER_VIDE} />,
    );

    const raccourci = within(container).getByRole('link', { name: 'Administration' });
    expect(raccourci.getAttribute('href')).toBe('/fr/admin');
  });

  it('ne paraît PAS pour un lecteur, ni pour un visiteur', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ CE LIEN NE FERME AUCUNE PORTE, ET NE DOIT PAS ÊTRE PRIS POUR TEL.  │
    // │                                                                    │
    // │ `exigerAdministrateur` refait le contrôle sur chaque écran, chaque  │
    // │ route d'API le refait, et chaque fonction SQL le refait une         │
    // │ troisième fois. Le cacher évite seulement de proposer une porte qui │
    // │ se refermera.                                                       │
    // └────────────────────────────────────────────────────────────────────┘
    const lecteur = render(
      <EnteteV2 langue="fr" utilisateur={LECTEUR} chemin="/fr/catalogue" panier={PANIER_VIDE} />,
    );
    expect(lecteur.queryByRole('link', { name: 'Administration' })).toBeNull();

    const visiteur = render(
      <EnteteV2 langue="fr" utilisateur={null} chemin="/fr/catalogue" panier={PANIER_VIDE} />,
    );
    expect(visiteur.queryByRole('link', { name: 'Administration' })).toBeNull();
  });

  it('suit la langue de l’interface', () => {
    const { container } = render(
      <EnteteV2 langue="en" utilisateur={ADMIN} chemin="/en/catalogue" panier={PANIER_VIDE} />,
    );

    expect(
      within(container).getByRole('link', { name: 'Administration' }).getAttribute('href'),
    ).toBe('/en/admin');
  });
});
