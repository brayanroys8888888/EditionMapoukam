'use client';

import { useState, type ReactNode } from 'react';

import { messageErreur, traduire, type LangueInterface } from '@/i18n';
import { Bouton, Champ } from '@/components/base';
import { Marque } from '@/components/v2/marque';
import { LONGUEUR_MOT_DE_PASSE_MIN } from '@/lib/auth/schemas';
import { estV3 } from '@/design/version';
import { BasculeAuth, PanneauPromesse } from './panneau';
import { ChampMotDePasse } from './mot-de-passe';
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

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LA CASE DES CONDITIONS EST TENUE ICI, ET NULLE PART AILLEURS.           │
   * │                                                                          │
   * │ Le prototype la pose ; ce produit n'a rien qui l'enregistre, et rien    │
   * │ dans la spécification n'énonce que l'inscription EXIGE une acceptation. │
   * │ Inventer cette règle au passage — la vérifier côté serveur, la stocker  │
   * │ — serait inventer un engagement juridique dans une passe de design.     │
   * │                                                                          │
   * │ Elle est donc réelle, mais réelle de ce qu'elle peut être : le bouton   │
   * │ reste inerte tant qu'elle n'est pas cochée. Personne ne prétend qu'un   │
   * │ consentement est conservé, et la case ne fait pas semblant d'exister.   │
   * │                                                                          │
   * │ Sans JavaScript, la case reste affichée et le bouton reste actif : le   │
   * │ serveur, lui, n'a pas changé d'avis sur ce qu'il exige. C'est le sens   │
   * │ de « tenue ici » — c'est une aide de saisie, pas une garde.             │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const [conditionsAcceptees, setConditionsAcceptees] = useState(false);

  const bloque = attente !== undefined && attente > 0;

  const texteErreur = !erreur
    ? null
    : bloque
      ? traduire(langue, 'auth.attendre').replace('{secondes}', String(attente))
      : messageErreur(langue, erreur);

  return (
    <div className={styles.cadreAuth}>
      {estV3() ? (
        <PanneauPromesse langue={langue} />
      ) : (
        <aside className={styles.illustration} aria-hidden="true">
          <Marque langue={langue} petite className={styles.marqueAuth} />
          <p className={styles.illustrationTexte}>
            {traduire(langue, 'auth.illustrationInscription')}
          </p>
        </aside>
      )}

      <div className={styles.contenu}>
        <BasculeAuth langue={langue} mode="inscription" />

        <h1 className={styles.titre}>{traduire(langue, 'auth.inscriptionTitre')}</h1>
        {estV3() ? (
          <p className={styles.intro}>{traduire(langue, 'auth.inscriptionIntro')}</p>
        ) : null}

        {texteErreur ? (
          <p className={styles.erreurFormulaire} role="alert">
            {texteErreur}
          </p>
        ) : null}

        <form action={action} className={styles.formulaire} noValidate>
          {/*
           * L'ordre du prototype : le nom, puis l'adresse, puis le mot de
           * passe. Il n'est pas indifférent — on donne son nom avant son
           * adresse, et un formulaire qui commence par l'adresse a l'air d'un
           * formulaire de connexion auquel on aurait ajouté des champs.
           */}
          <Champ
            id="inscription-nom"
            name="nom_complet"
            type="text"
            libelle={traduire(langue, 'auth.nomComplet')}
            aide={traduire(langue, 'auth.nomCompletAide')}
            autoComplete="name"
            {...(estV3() ? { placeholder: traduire(langue, 'auth.nomExemple') } : {})}
          />
          <Champ
            id="inscription-email"
            name="email"
            type="email"
            libelle={traduire(langue, 'auth.email')}
            autoComplete="email"
            required
            {...(estV3() ? { placeholder: traduire(langue, 'auth.emailExemple') } : {})}
          />

          {/*
           * Le seuil affiché est celui de `LONGUEUR_MOT_DE_PASSE_MIN`, importé
           * depuis les schémas — jamais les « au moins 8 caractères » du
           * prototype, qui décrivent une politique que ce produit n'applique
           * pas. Une maquette n'est jamais une autorité sur une règle.
           */}
          <ChampMotDePasse
            langue={langue}
            id="inscription-motdepasse"
            libelle={traduire(langue, 'auth.motDePasse')}
            autoComplete="new-password"
            required
            placeholder={traduire(langue, 'auth.regleLongueur')}
            onChange={setMotDePasse}
          />

          <ForceMotDePasse langue={langue} valeur={motDePasse} />

          {estV3() ? (
            <div className={styles.rangeeOptions}>
              <label className={styles.caseConditions}>
                <input
                  type="checkbox"
                  name="conditions"
                  checked={conditionsAcceptees}
                  onChange={(evenement) => {
                    setConditionsAcceptees(evenement.target.checked);
                  }}
                />
                <a href={`/${langue}/conditions-generales`}>
                  {traduire(langue, 'auth.accepterConditions')}
                </a>
              </label>
            </div>
          ) : null}

          <p className={styles.mention}>{traduire(langue, 'auth.aucuneDonneeEnfant')}</p>

          <Bouton type="submit" disabled={bloque || (estV3() && !conditionsAcceptees)}>
            {traduire(langue, 'auth.inscriptionSoumettre')}
          </Bouton>

          {estV3() ? <p className={styles.note}>{traduire(langue, 'auth.note')}</p> : null}
        </form>

        {estV3() ? null : (
          <nav className={styles.liens} aria-label={traduire(langue, 'auth.inscriptionTitre')}>
            <span className={styles.lienSecondaire}>
              {traduire(langue, 'auth.dejaUnCompte')}{' '}
              <a href={`/${langue}/connexion`}>{traduire(langue, 'auth.seConnecter')}</a>
            </span>
          </nav>
        )}
      </div>
    </div>
  );
}
