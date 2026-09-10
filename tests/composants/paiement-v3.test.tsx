import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { IssuePaiementV3, PaiementV3, type CommandeAffichee } from '@/components/v2/paiement-v3';
import type { LigneCommandeLue } from '@/lib/orders/lecture';
import { traduire } from '@/i18n';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE RÈGLEMENT — L'ÉCRAN ORGANIC.                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Les mesures se vérifient dans un navigateur, contre le prototype. Ce fichier
 * défend ce qu'un remaniement casserait sans bruit : aucun montant recomposé,
 * aucun champ de carte, le bouton de paiement relié au formulaire d'à-côté, et
 * la console de simulation qui disparaît devant un vrai prestataire.
 */

function ligne(partiel: Partial<LigneCommandeLue> = {}): LigneCommandeLue {
  return {
    livre_id: 'livre-1',
    langue: 'fr',
    titre: 'Anansi l’araignée',
    slug: 'anansi-l-araignee',
    couverture: 'http://exemple.test/vignette.webp',
    age_min: 6,
    age_max: 9,
    nb_pages: 24,
    prix_unitaire: 699,
    ...partiel,
  };
}

function commande(partiel: Partial<CommandeAffichee> = {}): CommandeAffichee {
  return {
    id: '9ace560b-d6e2-416a-8a49-38d0ec7a816e',
    montantAffiche: '16 970 FCFA',
    remiseAffichee: null,
    lignes: [ligne()],
    prixAffiches: ['6 990 FCFA'],
    ...partiel,
  };
}

const ACTIONS = {
  reglerReussi: () => Promise.resolve(),
  reglerEchoue: () => Promise.resolve(),
  reglerAbandonne: () => Promise.resolve(),
};

function rendre(props: Partial<Parameters<typeof PaiementV3>[0]> = {}) {
  return render(
    <PaiementV3
      langue="fr"
      commande={commande()}
      moyen="carte"
      base="/fr/paiement/9ace560b-d6e2-416a-8a49-38d0ec7a816e"
      emailDefaut="parent@exemple.test"
      enDefaut={[]}
      simule
      {...ACTIONS}
      {...props}
    />,
  );
}

describe('le récapitulatif', () => {
  it('affiche les montants TELS QUE le serveur les a mis en forme', () => {
    rendre();

    /*
     * Le franc CFA n'a pas de sous-unité. Un écran qui diviserait par cent
     * afficherait 169,70 au lieu de 16 970 — et le bouton de paiement porterait
     * le même faux montant, juste avant qu'on le presse.
     */
    expect(screen.getAllByText('16 970 FCFA').length).toBeGreaterThan(0);
    expect(screen.getByText('6 990 FCFA')).toBeTruthy();
  });

  it('n’affiche PAS de sous-total — il faudrait l’additionner', () => {
    rendre();
    expect(screen.queryByText(traduire('fr', 'panier.sousTotal'))).toBeNull();
  });

  it('n’affiche la remise que lorsqu’il y en a une', () => {
    const { unmount } = rendre();
    expect(screen.queryByText(traduire('fr', 'panier.remise'))).toBeNull();
    unmount();

    rendre({ commande: commande({ remiseAffichee: '1 000 FCFA' }) });
    expect(screen.getByText(traduire('fr', 'panier.remise'))).toBeTruthy();
    expect(screen.getByText('−1 000 FCFA')).toBeTruthy();
  });

  it('écrit le montant SUR le bouton de paiement', () => {
    rendre();

    // « Payer » seul oblige à remonter des yeux pour vérifier ce qu'on
    // s'apprête à débiter, au moment précis où l'on hésite.
    const bouton = screen.getByRole('button', {
      name: traduire('fr', 'paiement.payerMontant').replace('{montant}', '16 970 FCFA'),
    });
    expect(bouton).toBeTruthy();
  });

  it('relie le bouton au formulaire de l’autre colonne, sans JavaScript', () => {
    /*
     * Le prototype pose le bouton à droite et les champs à gauche. L'attribut
     * `form` d'HTML relie les deux : l'écran garde sa mise en page ET continue
     * de régler sans script — ce qui compte sur les connexions du §5.1.
     */
    rendre();
    const bouton = screen.getByRole('button', { name: /Payer/ });
    const cible = bouton.getAttribute('form');
    expect(cible).toBeTruthy();
    expect(document.querySelector(`form#${String(cible)}`)).toBeTruthy();
  });

  it('remplace le bouton par une consigne tant qu’aucun moyen n’est choisi', () => {
    rendre({ moyen: null });

    expect(screen.queryByRole('button', { name: /Payer/ })).toBeNull();
    expect(screen.getByText(traduire('fr', 'paiement.choisirDabord'))).toBeTruthy();
  });
});

describe('le choix du moyen de paiement', () => {
  it('propose les trois moyens en LIENS, et marque celui qui est retenu', () => {
    rendre({ moyen: 'orange_money' });

    const carte = screen.getByRole('link', { name: new RegExp(traduire('fr', 'moyens.carte')) });
    const orange = screen.getByRole('link', {
      name: new RegExp(traduire('fr', 'moyens.orange_money')),
    });

    // Des liens, non des boutons radio : les champs diffèrent d'un moyen à
    // l'autre, et `?moyen=` ne rend que ceux du moyen choisi — sans script.
    expect(carte.getAttribute('href')).toContain('?moyen=carte');
    expect(orange.getAttribute('aria-current')).toBe('true');
    expect(carte.getAttribute('aria-current')).toBeNull();
  });
});

describe('ce que l’écran ne demande pas, et ne demandera jamais', () => {
  it('AUCUN champ de numéro de carte', () => {
    /*
     * Le prototype en dessine quatre. Un prestataire réel impose des champs
     * hébergés chez lui, précisément pour que le numéro ne touche pas le
     * serveur du marchand : les dessiner ici apprendrait aux clients à taper
     * leur carte sur ce domaine.
     */
    const { container } = rendre({ moyen: 'carte' });

    expect(container.querySelector('input[autocomplete="cc-number"]')).toBeNull();
    expect(container.querySelector('input[autocomplete="cc-csc"]')).toBeNull();
    expect(container.querySelector('input[autocomplete="cc-exp"]')).toBeNull();
    expect(screen.getByText(traduire('fr', 'coordonnees.carteHebergeeTitre'))).toBeTruthy();
  });

  it('AUCUN champ de code promotionnel — il vit une étape plus tôt', () => {
    const { container } = rendre();
    expect(screen.queryByText(traduire('fr', 'panier.codePromo'))).toBeNull();
    expect(container.querySelector('input[name="promo"]')).toBeNull();
  });
});

describe('la console de simulation', () => {
  it('paraît devant le FAUX prestataire', () => {
    rendre({ simule: true });

    expect(screen.getByText(traduire('fr', 'simulation.banniereTitre'))).toBeTruthy();
    expect(screen.getByRole('button', { name: traduire('fr', 'simulation.echouer') })).toBeTruthy();
  });

  it('DISPARAÎT devant un prestataire réel — l’issue se joue chez lui', () => {
    /*
     * Face à Notch Pay, « simuler un échec » n'a aucun sens : le bouton
     * écrirait un échec que le prestataire n'a pas prononcé, et le bandeau
     * « aucun débit ne sera effectué » serait faux même en mode test.
     */
    rendre({ simule: false });

    expect(screen.queryByText(traduire('fr', 'simulation.banniereTitre'))).toBeNull();
    expect(screen.queryByRole('button', { name: traduire('fr', 'simulation.echouer') })).toBeNull();
    // Le règlement, lui, reste possible.
    expect(screen.getByRole('button', { name: /Payer/ })).toBeTruthy();
  });
});

describe('le fil d’étapes', () => {
  it('n’est jamais une navigation, et annonce l’état de chaque étape', () => {
    const { container } = rendre();
    const etapes = container.querySelectorAll('ol li');

    expect(etapes).toHaveLength(3);
    // Une commande écrite ne se dé-crée pas : aucune étape n'est cliquable.
    for (const etape of etapes) expect(etape.querySelector('a')).toBeNull();

    const courante = container.querySelector('li[aria-current="step"]');
    expect(courante?.textContent).toContain(traduire('fr', 'tunnel.etapePaiement'));
  });
});

describe('l’issue', () => {
  it('sur un paiement confirmé : le titre, les fichiers, et « Lire »', () => {
    render(<IssuePaiementV3 langue="fr" commande={commande()} statut="paye" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      traduire('fr', 'paiement.confirmationTitre'),
    );

    const fichiers = screen.getByText(traduire('fr', 'paiement.fichiersTitre')).parentElement;
    expect(fichiers).toBeTruthy();

    const lire = within(fichiers as HTMLElement).getByRole('link', {
      name: traduire('fr', 'paiement.lire'),
    });
    expect(lire.getAttribute('href')).toBe('/fr/lire/anansi-l-araignee');
  });

  it('AUCUN bouton de téléchargement sur l’écran de confirmation', () => {
    /*
     * La lecture et le téléchargement sont deux droits. Le second se sert
     * depuis la bibliothèque, par le service qui vérifie les droits et signe
     * l'URL — jamais par un lien posé sur un écran de remerciement.
     */
    const { container } = render(
      <IssuePaiementV3 langue="fr" commande={commande()} statut="paye" />,
    );

    expect(container.querySelector('a[download]')).toBeNull();
    expect(screen.queryByText(traduire('fr', 'fiche.telecharger'))).toBeNull();
  });

  it('retire le bouton « Lire » d’un titre sans fiche, sans retirer la ligne', () => {
    // La ligne est payée : elle reste. Le lien mènerait à un 404 : il part.
    render(
      <IssuePaiementV3
        langue="fr"
        commande={commande({ lignes: [ligne({ slug: null })] })}
        statut="paye"
      />,
    );

    expect(screen.getByText('Anansi l’araignée')).toBeTruthy();
    expect(screen.queryByRole('link', { name: traduire('fr', 'paiement.lire') })).toBeNull();
  });

  it('sur un échec : pas de liste de fichiers, et le retour au panier', () => {
    render(<IssuePaiementV3 langue="fr" commande={commande()} statut="echoue" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      traduire('fr', 'paiement.echoueeTitre'),
    );
    expect(screen.queryByText(traduire('fr', 'paiement.fichiersTitre'))).toBeNull();
    expect(
      screen.getByRole('link', { name: traduire('fr', 'paiement.versPanier') }).getAttribute('href'),
    ).toBe('/fr/panier');
  });

  it('un remboursement porte son propre titre — ce n’est pas un échec', () => {
    render(<IssuePaiementV3 langue="fr" commande={commande()} statut="rembourse" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      traduire('fr', 'paiement.rembourseeTitre'),
    );
  });
});
