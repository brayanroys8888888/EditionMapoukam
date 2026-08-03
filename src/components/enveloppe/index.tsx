import type { ReactNode } from 'react';

import { LANGUES_INTERFACE, traduire, type LangueInterface } from '@/i18n';
import type { Utilisateur } from '@/domain/api/contract';
import styles from './enveloppe.module.css';

/**
 * ENVELOPPE APPLICATIVE — en-tête, pied de page, langue, état de connexion.
 */

// ═══════════════════════════════════════════════════════════════════════════
// SÉLECTEUR DE LANGUE
// ═══════════════════════════════════════════════════════════════════════════

interface ProprietesSelecteur {
  langue: LangueInterface;
  /** Chemin courant, préfixe de langue COMPRIS — par exemple `/fr/catalogue`. */
  chemin: string;
  /** Chaîne de requête, `?` compris, ou chaîne vide. */
  requete?: string;
  /** Forme longue dans le pied de page, abrégée dans l'en-tête. */
  abrege?: boolean;
}

/**
 * Bascule de langue.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE CONSERVE LA PAGE COURANTE, ET SES FILTRES.                         │
 * │                                                                          │
 * │ Renvoyer à l'accueil est le défaut le plus répandu des sélecteurs de     │
 * │ langue, et le plus décourageant : un lecteur qui a filtré le catalogue   │
 * │ par région et par âge perd tout son travail pour avoir voulu lire en     │
 * │ anglais. Il ne recommence pas — il repart en français, ou il part.       │
 * │                                                                          │
 * │ Seul le PREMIER segment change. Le reste du chemin et la chaîne de       │
 * │ requête sont recopiés tels quels.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function SelecteurLangue({
  langue,
  chemin,
  requete = '',
  abrege = false,
}: ProprietesSelecteur): ReactNode {
  function versLangue(cible: LangueInterface): string {
    const segments = chemin.split('/');
    // `['', 'fr', 'catalogue']` — l'indice 1 porte la langue.
    segments[1] = cible;
    return `${segments.join('/')}${requete}`;
  }

  return (
    <div className={styles.langues} role="group" aria-label={traduire(langue, 'langue.selecteur')}>
      {LANGUES_INTERFACE.map((code) => {
        const courante = code === langue;
        const libelle = traduire(langue, abrege ? `langue.${code}Court` : `langue.${code}`);

        // La langue courante n'est pas un lien : cliquer sur « FR » quand on y
        // est déjà ne mène nulle part, et un lecteur d'écran annoncerait un
        // choix qui n'en est pas un.
        return courante ? (
          <span key={code} className={`${styles.langue} ${styles.langueActive}`} aria-current="true">
            {libelle}
          </span>
        ) : (
          <a
            key={code}
            className={styles.langue}
            href={versLangue(code)}
            // `hreflang` sur le lien : il dit au navigateur ET aux moteurs
            // quelle langue attend l'utilisateur au bout.
            hrefLang={code}
            lang={code}
          >
            {libelle}
          </a>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAT DE CONNEXION
// ═══════════════════════════════════════════════════════════════════════════

interface ProprietesMenuCompte {
  langue: LangueInterface;
  /** `null` pour un visiteur. L'état vient du SERVEUR, jamais d'un état local. */
  utilisateur: Utilisateur | null;
}

/**
 * Menu de compte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉTAT DE CONNEXION EST RENDU PAR LE SERVEUR, PAS DEVINÉ PAR LE CLIENT. │
 * │                                                                          │
 * │ Les cookies de session sont `HttpOnly` : le JavaScript de page ne peut   │
 * │ pas les lire, et c'est ce qui empêche une faille XSS de devenir un vol   │
 * │ de session. L'interface n'a donc AUCUN moyen de deviner si quelqu'un est │
 * │ connecté — et c'est très bien : la seule autorité est le profil relu en  │
 * │ base à chaque requête.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function MenuCompte({ langue, utilisateur }: ProprietesMenuCompte): ReactNode {
  if (!utilisateur) {
    return (
      <a className={styles.actionEntete} href={`/${langue}/connexion`}>
        {traduire(langue, 'navigation.connexion')}
      </a>
    );
  }

  return (
    <div className={styles.compte}>
      <a className={styles.actionEntete} href={`/${langue}/compte`}>
        {traduire(langue, 'navigation.compte')}
      </a>
      {utilisateur.role === 'admin' ? (
        <a className={styles.actionEntete} href={`/${langue}/admin`}>
          {traduire(langue, 'navigation.administration')}
        </a>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EN-TÊTE
// ═══════════════════════════════════════════════════════════════════════════

interface ProprietesEntete extends ProprietesMenuCompte {
  chemin: string;
  requete?: string;
}

export function Entete({
  langue,
  utilisateur,
  chemin,
  requete,
}: ProprietesEntete): ReactNode {
  return (
    <header className={styles.entete}>
      {/*
       * Premier élément focalisable de la page : un utilisateur au clavier
       * atteint le contenu sans traverser toute la navigation à chaque page.
       * Invisible jusqu'au focus, jamais absent — c'est un critère AA.
       */}
      <a className={styles.evitement} href="#contenu">
        {traduire(langue, 'navigation.allerAuContenu')}
      </a>

      <div className={styles.enteteInterieur}>
        <a className={styles.marque} href={`/${langue}`}>
          <span className={styles.logo} aria-hidden="true">
            <span className={styles.losange} />
          </span>
          {traduire(langue, 'marque.nom')}
        </a>

        <nav className={styles.navigation} aria-label={traduire(langue, 'navigation.principal')}>
          <a href={`/${langue}/catalogue`}>{traduire(langue, 'navigation.catalogue')}</a>
          <a href={`/${langue}/offres`}>{traduire(langue, 'navigation.offres')}</a>
          <a href={`/${langue}/a-propos`}>{traduire(langue, 'navigation.apropos')}</a>
        </nav>

        <div className={styles.actions}>
          <SelecteurLangue langue={langue} chemin={chemin} requete={requete} abrege />
          <MenuCompte langue={langue} utilisateur={utilisateur} />
          <a className={styles.actionEntete} href={`/${langue}/panier`}>
            {traduire(langue, 'navigation.panier')}
          </a>
        </div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PIED DE PAGE
// ═══════════════════════════════════════════════════════════════════════════

export function PiedDePage({
  langue,
  chemin,
  requete,
}: {
  langue: LangueInterface;
  chemin: string;
  requete?: string;
}): ReactNode {
  const editorial: { cle: string; chemin: string }[] = [
    { cle: 'navigation.apropos', chemin: 'a-propos' },
    { cle: 'pied.faq', chemin: 'questions-frequentes' },
    { cle: 'pied.cgv', chemin: 'conditions-generales' },
    { cle: 'pied.confidentialite', chemin: 'confidentialite' },
    { cle: 'pied.contact', chemin: 'contact' },
  ];

  return (
    <footer className={styles.pied}>
      <div className={styles.piedInterieur}>
        <div>
          <p className={styles.piedMarque}>{traduire(langue, 'marque.nom')}</p>
          <p className={styles.piedBaseline}>{traduire(langue, 'marque.baseline')}</p>
        </div>

        <nav className={styles.piedLiens} aria-label={traduire(langue, 'pied.libelle')}>
          {editorial.map((entree) => (
            <a key={entree.chemin} href={`/${langue}/${entree.chemin}`}>
              {traduire(langue, entree.cle as never)}
            </a>
          ))}
        </nav>

        <SelecteurLangue langue={langue} chemin={chemin} requete={requete} />
      </div>
    </footer>
  );
}
