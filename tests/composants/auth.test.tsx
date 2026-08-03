import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  ForceMotDePasse,
  FormulaireCode,
  FormulaireConnexion,
  FormulaireInscription,
  FormulaireOubli,
  MessageAuth,
} from '@/components/auth';

/**
 * ÉCRANS D'AUTHENTIFICATION — étape F3.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CES TESTS PROUVENT, ET CE QU'ILS NE PROUVENT PAS.                │
 * │                                                                          │
 * │ L'indistinguabilité des RÉPONSES est une propriété du backend, éprouvée  │
 * │ octet pour octet dans `tests/integration/parcours-auth.test.ts`. Ici, on │
 * │ éprouve la moitié que le backend ne peut pas tenir : que l'INTERFACE ne  │
 * │ la défasse pas.                                                          │
 * │                                                                          │
 * │ C'est le risque réel, et il vient toujours d'une bonne intention —       │
 * │ marquer le champ fautif pour « aider », proposer un renvoi d'email pour  │
 * │ « dépanner ». Les deux répondent à la question qu'on refuse de répondre. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const ACTION = '/action-de-test';

// ═══════════════════════════════════════════════════════════════════════════
// L'ÉCHEC DE CONNEXION NE DÉSIGNE JAMAIS UN CHAMP
// ═══════════════════════════════════════════════════════════════════════════

describe('échec de connexion', () => {
  it('ne marque NI le champ email NI le champ mot de passe', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ `aria-invalid` sur le seul champ « mot de passe » signifierait      │
    // │ « l'adresse, elle, est connue ». La plateforme deviendrait          │
    // │ énumérable une adresse à la fois, sans qu'aucune réponse HTTP n'ait │
    // │ changé.                                                             │
    // └────────────────────────────────────────────────────────────────────┘
    render(
      <FormulaireConnexion langue="fr" action={ACTION} erreur="identifiants_invalides" />,
    );

    expect(screen.getByLabelText('Adresse email').getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByLabelText('Mot de passe').getAttribute('aria-invalid')).toBeNull();
  });

  it('porte l’erreur au niveau du FORMULAIRE, annoncée', () => {
    render(
      <FormulaireConnexion langue="fr" action={ACTION} erreur="identifiants_invalides" />,
    );

    const alerte = screen.getByRole('alert');
    expect(alerte.textContent).toBe('Adresse email ou mot de passe incorrect.');
  });

  it('ne propose PAS de renvoyer un code sur un échec ordinaire', () => {
    // Ce bouton, proposé ici, confirmerait l'existence du compte à qui essaie
    // une adresse au hasard — la fuite que l'erreur unique évitait.
    render(
      <FormulaireConnexion
        langue="fr"
        action={ACTION}
        actionRenvoi={ACTION}
        erreur="identifiants_invalides"
      />,
    );

    expect(screen.queryByRole('button', { name: 'Renvoyer un code de vérification' })).toBeNull();
  });

  it('mais le propose sur `email_non_verifie` — le contre-test', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ SANS CETTE ASSERTION, UN COMPOSANT QUI NE RENDRAIT JAMAIS CE       │
    // │ BOUTON PASSERAIT LES DEUX TESTS PRÉCÉDENTS.                        │
    // │                                                                    │
    // │ `email_non_verifie` est le SEUL cas où l'écran nomme la raison, et  │
    // │ il ne révèle rien : l'utilisateur vient de créer ce compte.         │
    // └────────────────────────────────────────────────────────────────────┘
    render(
      <FormulaireConnexion
        langue="fr"
        action={ACTION}
        actionRenvoi={ACTION}
        erreur="email_non_verifie"
      />,
    );

    expect(screen.getByRole('button', { name: 'Renvoyer un code de vérification' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe(
      'Vérifiez votre adresse email avant de vous connecter.',
    );
  });

  it('sans erreur, aucune alerte n’est rendue', () => {
    // La garde du cas nominal : un composant qui afficherait toujours une
    // alerte passerait les tests ci-dessus.
    render(<FormulaireConnexion langue="fr" action={ACTION} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SESSION RÉVOQUÉE — UN MESSAGE DISTINCT, PORTÉ DEPUIS LE MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

describe('session révoquée', () => {
  it('nomme le vol de jeton et invite à changer le mot de passe', () => {
    // Porté par `?motif=session_revoquee`, posé par le middleware en F2. Un
    // « session expirée » générique laisserait la victime se reconnecter sans
    // jamais apprendre qu'elle a été compromise.
    render(<FormulaireConnexion langue="fr" action={ACTION} motif="session_revoquee" />);

    expect(screen.getByRole('alert').textContent).toContain('changez votre mot de passe');
  });

  it('n’apparaît pas sans motif — le contre-test', () => {
    render(<FormulaireConnexion langue="fr" action={ACTION} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 429 — LE DÉLAI EST DIT, ET LE BOUTON SE TAIT
// ═══════════════════════════════════════════════════════════════════════════

describe('trop de tentatives', () => {
  it('affiche le délai de `retry-after` ET désactive le bouton', () => {
    render(
      <FormulaireConnexion
        langue="fr"
        action={ACTION}
        erreur="trop_de_requetes"
        attente={90}
      />,
    );

    expect(screen.getByRole('alert').textContent).toBe(
      'Trop de tentatives. Réessayez dans 90 secondes.',
    );
    expect(screen.getByRole('button', { name: 'Se connecter' }).hasAttribute('disabled')).toBe(true);
  });

  it('sans délai, le bouton reste actif — le contre-test', () => {
    // Sans lui, un bouton désactivé en permanence passerait le test précédent
    // — et l'écran serait inutilisable.
    render(<FormulaireConnexion langue="fr" action={ACTION} />);

    expect(screen.getByRole('button', { name: 'Se connecter' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('le délai vaut aussi pour la demande de réinitialisation', () => {
    render(
      <FormulaireOubli langue="fr" action={ACTION} erreur="trop_de_requetes" attente={30} />,
    );

    expect(screen.getByRole('alert').textContent).toContain('30');
    expect(screen.getByRole('button', { name: 'Envoyer le code' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES D'ISSUE — CE QU'ILS NE DISENT PAS
// ═══════════════════════════════════════════════════════════════════════════

describe('message d’inscription', () => {
  it('n’affirme JAMAIS qu’un compte vient d’être créé', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Le message naturel — « votre compte est créé, confirmez votre       │
    // │ adresse » — apprendrait à qui teste une adresse déjà inscrite       │
    // │ qu'elle ne l'était pas. Le libellé retenu reste vrai dans les deux  │
    // │ cas sans les distinguer.                                            │
    // └────────────────────────────────────────────────────────────────────┘
    render(<MessageAuth langue="fr" cle="auth.inscriptionEnvoyee" />);

    const texte = screen.getByText(/Inscription enregistrée/).textContent ?? '';
    expect(texte).toContain('Si cette adresse n');
    expect(texte).not.toMatch(/compte (a été|est) créé/i);
  });

  it('la demande de réinitialisation reste au conditionnel', () => {
    render(<MessageAuth langue="fr" cle="auth.oubliEnvoye" />);

    const texte = screen.getByText(/Si un compte existe/).textContent ?? '';
    expect(texte).toContain('Si un compte existe');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SAISIE DU CODE
// ═══════════════════════════════════════════════════════════════════════════

describe('saisie du code à usage unique', () => {
  it('le champ est prévu pour un code, pas pour un nombre', () => {
    // `type="number"` retirerait les zéros de tête et afficherait des flèches
    // d'incrément. `one-time-code` permet au système mobile de proposer le
    // code depuis la notification, ce qui rend la saisie acceptable.
    render(
      <FormulaireCode
        langue="fr"
        action={ACTION}
        titre="auth.confirmationTitre"
        intro="auth.confirmationIntro"
        soumettre="auth.confirmationSoumettre"
      />,
    );

    const champ = screen.getByLabelText('Code reçu par email');
    expect(champ.getAttribute('type')).toBe('text');
    expect(champ.getAttribute('inputmode')).toBe('numeric');
    expect(champ.getAttribute('autocomplete')).toBe('one-time-code');
    expect(champ.getAttribute('maxlength')).toBe('6');
  });

  it('la confirmation d’adresse ne demande PAS de mot de passe', () => {
    render(
      <FormulaireCode
        langue="fr"
        action={ACTION}
        titre="auth.confirmationTitre"
        intro="auth.confirmationIntro"
        soumettre="auth.confirmationSoumettre"
      />,
    );

    expect(screen.queryByLabelText('Nouveau mot de passe')).toBeNull();
  });

  it('la réinitialisation le demande — le contre-test', () => {
    // Sans lui, un formulaire qui n'afficherait jamais ce champ passerait le
    // test précédent, et la réinitialisation serait impossible.
    render(
      <FormulaireCode
        langue="fr"
        action={ACTION}
        titre="auth.nouveauTitre"
        intro="auth.nouveauIntro"
        soumettre="auth.nouveauSoumettre"
        avecMotDePasse
      />,
    );

    expect(screen.getByLabelText('Nouveau mot de passe')).toBeDefined();
  });

  it('un code refusé n’efface pas l’adresse déjà connue', () => {
    // Sur connexion lente, retaper son adresse après un code mal recopié est
    // le moment où l'on abandonne.
    render(
      <FormulaireCode
        langue="fr"
        action={ACTION}
        titre="auth.nouveauTitre"
        intro="auth.nouveauIntro"
        soumettre="auth.nouveauSoumettre"
        email="parent@exemple.test"
        erreur="code_invalide"
      />,
    );

    expect(screen.getByLabelText<HTMLInputElement>('Adresse email').value).toBe(
      'parent@exemple.test',
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Ce code est invalide ou a expiré. Demandez-en un nouveau.',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROBUSTESSE DU MOT DE PASSE
// ═══════════════════════════════════════════════════════════════════════════

describe('robustesse du mot de passe', () => {
  it('énonce les TROIS conditions, même sur un champ vide', () => {
    // Elles sont l'information utile : une barre colorée ne dit pas ce qui
    // manque. Et sans JavaScript, cette liste statique est tout ce que
    // l'utilisateur verra — elle doit donc suffire.
    render(<ForceMotDePasse langue="fr" valeur="" />);

    expect(screen.getByText('Au moins 10 caractères')).toBeDefined();
    expect(screen.getByText('Au moins une lettre')).toBeDefined();
    expect(screen.getByText('Au moins un chiffre')).toBeDefined();
  });

  it('un mot de passe vide n’est pas annoncé comme suffisant', () => {
    render(<ForceMotDePasse langue="fr" valeur="" />);
    expect(screen.getByText(/Robustesse du mot de passe/).textContent).toContain('Insuffisant');
  });

  it('un mot de passe conforme l’est — le contre-test', () => {
    render(<ForceMotDePasse langue="fr" valeur="MotDePasse2026" />);
    expect(screen.getByText(/Robustesse du mot de passe/).textContent).toContain('Acceptable');
  });

  it('l’état de chaque condition est LISIBLE, pas seulement coloré', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Une condition marquée par la seule couleur — ou par un « ✓ »        │
    // │ décoratif — ne dit rien à un lecteur d'écran. Le libellé            │
    // │ visuellement masqué porte l'information.                            │
    // └────────────────────────────────────────────────────────────────────┘
    const { container } = render(<ForceMotDePasse langue="fr" valeur="abcdefghij" />);

    const texte = container.textContent ?? '';
    expect(texte).toContain('Condition remplie');
    expect(texte).toContain('Condition non remplie');
  });

  it('le seuil affiché suit celui du serveur', () => {
    // Neuf caractères : sous le minimum de `LONGUEUR_MOT_DE_PASSE_MIN`, que le
    // composant IMPORTE plutôt que de le recopier. Un indicateur qui
    // annoncerait « suffisant » sur un mot de passe que le serveur refuse est
    // pire que pas d'indicateur du tout.
    render(<ForceMotDePasse langue="fr" valeur="abcdefgh1" />);
    expect(screen.getByText(/Robustesse du mot de passe/).textContent).toContain('Insuffisant');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RÈGLE 7 — AUCUNE DONNÉE D'ENFANT
// ═══════════════════════════════════════════════════════════════════════════

describe('aucune donnée d’enfant n’est demandée', () => {
  it('le formulaire d’inscription ne comporte aucun champ d’enfant', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ RÈGLE 7 DE CLAUDE.md, tenue jusque dans l'interface — où elle se    │
    // │ perd d'ordinaire, parce qu'un formulaire d'inscription à une        │
    // │ plateforme pour enfants « appelle » un prénom et un âge.            │
    // └────────────────────────────────────────────────────────────────────┘
    const { container } = render(<FormulaireInscription langue="fr" action={ACTION} />);

    const libelles = [...container.querySelectorAll('label')].map((l) => l.textContent ?? '');
    expect(libelles.length).toBeGreaterThanOrEqual(3);

    for (const libelle of libelles) {
      expect(libelle, `libellé suspect : ${libelle}`).not.toMatch(
        /enfant|prénom|âge|date de naissance|naissance/i,
      );
    }
  });

  it('et l’écran le DIT, plutôt que de le taire', () => {
    // Un parent qui inscrit un enfant s'attend à fournir ces informations et
    // se demanderait sinon s'il a manqué une étape.
    render(<FormulaireInscription langue="fr" action={ACTION} />);

    // L'apostrophe est indifférente : le dictionnaire mêle la droite et la
    // typographique, et ce test porte sur la présence de la mention, pas sur
    // sa ponctuation.
    expect(screen.getByText(/Ce compte est celui d['’]un adulte/)).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACCESSIBILITÉ ET NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

describe('accessibilité des formulaires', () => {
  it('chaque champ de la connexion est relié à son libellé', () => {
    render(<FormulaireConnexion langue="fr" action={ACTION} />);

    // `getByLabelText` échoue si l'association `label`/`for` est absente :
    // c'est exactement le contrôle voulu, pas une commodité de test.
    expect(screen.getByLabelText('Adresse email').getAttribute('name')).toBe('email');
    expect(screen.getByLabelText('Mot de passe').getAttribute('name')).toBe('password');
  });

  it('les liens de secours sont atteignables depuis la connexion', () => {
    // Ce sont ceux qu'on cherche quand on est bloqué dehors : ils doivent
    // être des liens réels, préfixés par la langue.
    render(<FormulaireConnexion langue="fr" action={ACTION} />);

    expect(
      screen.getByRole('link', { name: 'Mot de passe oublié ?' }).getAttribute('href'),
    ).toBe('/fr/mot-de-passe-oublie');
    expect(screen.getByRole('link', { name: 'Créer un compte' }).getAttribute('href')).toBe(
      '/fr/inscription',
    );
  });

  it('les liens suivent la langue — le contre-test', () => {
    // Sans lui, des chemins écrits en dur en français passeraient le test
    // précédent et renverraient un anglophone vers le middleware.
    render(<FormulaireConnexion langue="en" action={ACTION} />);

    expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe(
      '/en/inscription',
    );
  });

  it('l’écran d’inscription porte un titre de niveau 1, unique', () => {
    render(<FormulaireInscription langue="fr" action={ACTION} />);

    const titres = screen.getAllByRole('heading', { level: 1 });
    expect(titres.length).toBe(1);
    expect(titres[0]?.textContent).toBe('Créer un compte');
  });
});
