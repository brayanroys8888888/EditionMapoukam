'use client';

import { useState, type ReactNode } from 'react';

import { messageErreur, traduire, type LangueInterface } from '@/i18n';
import { Bouton, Champ } from '@/components/base';
import { LONGUEUR_MOT_DE_PASSE_MIN } from '@/lib/auth/schemas';
import styles from './auth.module.css';

import type { ActionFormulaire } from './index';

/**
 * INSCRIPTION, et l'indicateur de robustesse qui l'accompagne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CLIENT, MAIS LE FORMULAIRE FONCTIONNE SANS JAVASCRIPT.                  │
 * │                                                                          │
 * │ La directive `use client` sert au seul indicateur de robustesse, qui     │
 * │ suit la frappe. Le formulaire lui-même est une Server Action : son HTML  │
 * │ est complet dès le rendu serveur et se soumet nativement.                │
 * │                                                                          │
 * │ Sans JavaScript, l'utilisateur voit donc les trois conditions énoncées   │
 * │ — non cochées — et son inscription fonctionne. C'est une amélioration    │
 * │ progressive, pas une dépendance : le chemin critique reste servi.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Les trois conditions, et rien d'autre.
 *
 * Elles sont recopiées de `src/lib/auth/schemas.ts` — DONT LA LONGUEUR EST
 * IMPORTÉE, précisément pour qu'un déplacement du seuil serveur ne laisse pas
 * l'écran promettre l'ancien. Un indicateur qui annonce « suffisant » sur un
 * mot de passe que le serveur refuse est pire que pas d'indicateur du tout.
 */
function conditions(valeur: string): { cle: 'regleLongueur' | 'regleLettre' | 'regleChiffre'; tenue: boolean }[] {
  return [
    { cle: 'regleLongueur', tenue: valeur.length >= LONGUEUR_MOT_DE_PASSE_MIN },
    { cle: 'regleLettre', tenue: /[a-zA-Z]/.test(valeur) },
    { cle: 'regleChiffre', tenue: /\d/.test(valeur) },
  ];
}

/** Seuil d'AFFICHAGE, au-delà de la politique. Ne refuse rien : il encourage. */
const LONGUEUR_CONFORTABLE = 16;

/**
 * Robustesse du mot de passe.
 *
 * L'état est porté par le TEXTE de chaque condition, pas par la seule couleur
 * ni par une barre colorée : une barre orange ne dit pas ce qui manque, et ne
 * dit rien du tout à qui ne distingue pas les couleurs.
 */
export function ForceMotDePasse({
  langue,
  valeur,
}: {
  langue: LangueInterface;
  valeur: string;
}): ReactNode {
  const liste = conditions(valeur);
  const toutesTenues = liste.every((c) => c.tenue);

  const niveau = !toutesTenues
    ? 'forceFaible'
    : valeur.length >= LONGUEUR_CONFORTABLE
      ? 'forceFort'
      : 'forceMoyen';

  return (
    <div className={styles.force}>
      <p className={styles.forceNiveau}>
        {traduire(langue, 'auth.forceTitre')} : {traduire(langue, `auth.${niveau}`)}
      </p>
      <ul className={styles.forceListe}>
        {liste.map((condition) => (
          <li
            key={condition.cle}
            className={condition.tenue ? styles.conditionTenue : styles.conditionAttendue}
          >
            {/* Le symbole est décoratif : l'information est portée par le
                libellé invisible qui le suit, que le lecteur d'écran annonce. */}
            <span aria-hidden="true">{condition.tenue ? '✓' : '·'}</span>{' '}
            {traduire(langue, `auth.${condition.cle}`)}
            <span className={styles.invisible}>
              {' '}
              — {traduire(langue, condition.tenue ? 'auth.regleTenue' : 'auth.regleNonTenue')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Inscription.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE DONNÉE D'ENFANT N'EST DEMANDÉE, ET C'EST DIT.                    │
 * │                                                                          │
 * │ Règle 7 de CLAUDE.md. Le formulaire ne comporte ni prénom, ni âge, ni    │
 * │ date de naissance d'enfant — et la mention l'explique, parce qu'un       │
 * │ parent qui inscrit un enfant s'attend à les fournir et se demanderait    │
 * │ sinon s'il a manqué une étape.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function FormulaireInscription({
  langue,
  action,
  erreur,
  attente,
}: {
  langue: LangueInterface;
  action: ActionFormulaire;
  erreur?: string;
  attente?: number;
}): ReactNode {
  const [motDePasse, setMotDePasse] = useState('');
  const bloque = attente !== undefined && attente > 0;

  const texteErreur = !erreur
    ? null
    : bloque
      ? traduire(langue, 'auth.attendre').replace('{secondes}', String(attente))
      : messageErreur(langue, erreur);

  return (
    <div className={styles.panneau}>
      <h1 className={styles.titre}>{traduire(langue, 'auth.inscriptionTitre')}</h1>

      {texteErreur ? (
        <p className={styles.erreurFormulaire} role="alert">
          {texteErreur}
        </p>
      ) : null}

      <form action={action} className={styles.formulaire} noValidate>
        <Champ
          id="inscription-email"
          name="email"
          type="email"
          libelle={traduire(langue, 'auth.email')}
          autoComplete="email"
          required
        />
        <Champ
          id="inscription-nom"
          name="nom_complet"
          type="text"
          libelle={traduire(langue, 'auth.nomComplet')}
          aide={traduire(langue, 'auth.nomCompletAide')}
          autoComplete="name"
        />
        <Champ
          id="inscription-motdepasse"
          name="password"
          type="password"
          libelle={traduire(langue, 'auth.motDePasse')}
          autoComplete="new-password"
          required
          value={motDePasse}
          onChange={(evenement) => {
            setMotDePasse(evenement.target.value);
          }}
        />

        <ForceMotDePasse langue={langue} valeur={motDePasse} />

        <p className={styles.mention}>{traduire(langue, 'auth.aucuneDonneeEnfant')}</p>

        <Bouton type="submit" disabled={bloque}>
          {traduire(langue, 'auth.inscriptionSoumettre')}
        </Bouton>
      </form>

      <nav className={styles.liens} aria-label={traduire(langue, 'auth.inscriptionTitre')}>
        <span className={styles.lienSecondaire}>
          {traduire(langue, 'auth.dejaUnCompte')}{' '}
          <a href={`/${langue}/connexion`}>{traduire(langue, 'auth.seConnecter')}</a>
        </span>
      </nav>
    </div>
  );
}
