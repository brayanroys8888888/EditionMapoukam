import type { ReactNode } from 'react';

import { LANGUES_INTERFACE, traduire, type LangueInterface } from '@/i18n';
import type { Utilisateur } from '@/domain/api/contract';
import { IconeCompte, IconeLoupe, IconePanier } from '@/components/icones';
import styles from './enveloppe.module.css';

/**
 * ENVELOPPE APPLICATIVE — §A.5, §A.6 et §A.7 des maquettes.
 *
 * En-tête collant, pied de page long, mot-symbole, langue, état de connexion.
 */

// ═══════════════════════════════════════════════════════════════════════════
// MOT-SYMBOLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le logo : deux formes, aucune image.
 *
 * Un disque jaune, un carré d'encre tourné de 45°. C'est tout. Une image
 * demanderait une requête de plus au chargement de CHAQUE page, pour dessiner
 * ce que deux `<span>` dessinent sans un octet de réseau.
 */
function Marque({
  langue,
  petit = false,
}: {
  langue: LangueInterface;
  petit?: boolean;
}): ReactNode {
  return (
    <a className={petit ? styles.piedMarque : styles.marque} href={`/${langue}`}>
      <span className={petit ? styles.piedLogo : styles.logo} aria-hidden="true">
        <span className={petit ? styles.piedLosange : styles.losange} />
      </span>
      {traduire(langue, 'marque.nom')}
    </a>
  );
}

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
 *
 * La maquette emploie deux `<button aria-pressed>`. Ce sont ici des LIENS :
 * changer de langue est une navigation, elle doit fonctionner sans JavaScript
 * et s'ouvrir dans un nouvel onglet comme n'importe quel lien.
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
    <div
      className={abrege ? styles.langues : `${styles.langues} ${styles.languesLongues}`}
      role="group"
      aria-label={traduire(langue, 'langue.selecteur')}
    >
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
// ACTIONS D'EN-TÊTE
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
 *
 * Le carré à icône est réservé au compte EXISTANT. Un visiteur reçoit un
 * libellé écrit : « Se connecter » derrière un buste stylisé se devine, et se
 * devine mal — c'est la première chose qu'un parent cherche.
 */
export function MenuCompte({ langue, utilisateur }: ProprietesMenuCompte): ReactNode {
  if (!utilisateur) {
    return (
      <a className={styles.rechercheAction} href={`/${langue}/connexion`}>
        {traduire(langue, 'navigation.connexion')}
      </a>
    );
  }

  return (
    <>
      <a
        className={styles.carreAction}
        href={`/${langue}/compte`}
        aria-label={traduire(langue, 'navigation.compte')}
      >
        <IconeCompte />
      </a>
      {utilisateur.role === 'admin' ? (
        <a className={styles.rechercheAction} href={`/${langue}/admin`}>
          {traduire(langue, 'navigation.administration')}
        </a>
      ) : null}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EN-TÊTE
// ═══════════════════════════════════════════════════════════════════════════

interface ProprietesEntete extends ProprietesMenuCompte {
  chemin: string;
  requete?: string;
}

export function Entete({ langue, utilisateur, chemin, requete }: ProprietesEntete): ReactNode {
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
        <Marque langue={langue} />

        <nav className={styles.navigation} aria-label={traduire(langue, 'navigation.principal')}>
          <a href={`/${langue}/catalogue`}>{traduire(langue, 'navigation.catalogue')}</a>
          <a href={`/${langue}/offres`}>{traduire(langue, 'navigation.offres')}</a>
          <a href={`/${langue}/a-propos`}>{traduire(langue, 'navigation.apropos')}</a>
        </nav>

        <div className={styles.actions}>
          <SelecteurLangue langue={langue} chemin={chemin} requete={requete} abrege />

          {/*
           * La recherche est un LIEN vers le catalogue, non un bouton qui
           * ouvrirait un panneau : la maquette montre un bouton, mais tout
           * l'état de recherche de ce produit vit dans l'URL du catalogue.
           * Un panneau flottant serait un second chemin vers la même chose,
           * et le seul à ne pas fonctionner sans JavaScript.
           */}
          <a className={styles.rechercheAction} href={`/${langue}/catalogue`}>
            <IconeLoupe />
            {traduire(langue, 'navigation.recherche')}
          </a>

          <MenuCompte langue={langue} utilisateur={utilisateur} />

          <a
            className={styles.carreAction}
            href={`/${langue}/panier`}
            aria-label={traduire(langue, 'navigation.panier')}
          >
            <IconePanier />
          </a>
        </div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PIED DE PAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pied de page long — quatre colonnes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES LIBELLÉS SONT CEUX DE LA MAQUETTE ; LES DESTINATIONS SONT RÉELLES.  │
 * │                                                                          │
 * │ La maquette porte sept liens dont trois pointent sur « # » et désignent  │
 * │ des pages qui n'existent pas : « Offrir un abonnement », « Écoles et     │
 * │ bibliothèques », « Nos conteurs et illustrateurs ». Les reproduire       │
 * │ donnerait un pied de page qui promet quatre pages sur dix et en sert     │
 * │ zéro — c'est-à-dire pire que de ne pas les afficher.                     │
 * │                                                                          │
 * │ La structure, elle, est reprise exactement : identité plus trois listes. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function ColonnePied({ titre, children }: { titre: string; children: ReactNode }): ReactNode {
  return (
    <div>
      <p className={styles.piedTitre}>{titre}</p>
      <ul className={styles.piedListe}>{children}</ul>
    </div>
  );
}

export function PiedDePage({
  langue,
  chemin,
  requete,
  annee,
}: {
  langue: LangueInterface;
  chemin: string;
  requete?: string;
  /**
   * L'année du bas de page, POSÉE PAR L'APPELANT.
   *
   * Elle vient de l'horloge injectable, jamais d'une lecture directe de
   * l'heure du navigateur : la console de simulation avance le temps, et un
   * pied de page qui lirait l'heure du système afficherait une autre année
   * que le reste du site.
   */
  annee: number;
}): ReactNode {
  return (
    <footer className={styles.pied}>
      <div className={styles.piedColonnes}>
        <div>
          <Marque langue={langue} petit />
          <p className={styles.piedBaseline}>{traduire(langue, 'marque.baseline')}</p>
        </div>

        <ColonnePied titre={traduire(langue, 'pied.colonneCatalogue')}>
          <li>
            <a href={`/${langue}/catalogue`}>{traduire(langue, 'pied.tousLesContes')}</a>
          </li>
          <li>
            <a href={`/${langue}/catalogue?tri=nouveautes`}>{traduire(langue, 'pied.nouveautes')}</a>
          </li>
          <li>
            <a href={`/${langue}/catalogue?acces=gratuit`}>
              {traduire(langue, 'catalogue.accesGratuit')}
            </a>
          </li>
        </ColonnePied>

        <ColonnePied titre={traduire(langue, 'pied.colonneOffres')}>
          <li>
            <a href={`/${langue}/offres`}>{traduire(langue, 'offres.abonnementTitre')}</a>
          </li>
          <li>
            <a href={`/${langue}/offres`}>{traduire(langue, 'offres.achatTitre')}</a>
          </li>
          <li>
            <a href={`/${langue}/conditions-generales`}>{traduire(langue, 'pied.cgv')}</a>
          </li>
        </ColonnePied>

        <ColonnePied titre={traduire(langue, 'pied.colonneEcrire')}>
          <li>
            <a href={`/${langue}/a-propos`}>{traduire(langue, 'pied.aproposStudio')}</a>
          </li>
          <li>
            <a href={`/${langue}/questions-frequentes`}>
              {traduire(langue, 'pied.aideEtQuestions')}
            </a>
          </li>
          <li>
            <a href={`/${langue}/contact`}>{traduire(langue, 'pied.contact')}</a>
          </li>
        </ColonnePied>
      </div>

      <div className={styles.piedBarre}>
        <div className={styles.piedBarreInterieur}>
          <nav className={styles.piedBarreLiens} aria-label={traduire(langue, 'pied.libelle')}>
            <a href={`/${langue}/conditions-generales`}>{traduire(langue, 'pied.cgv')}</a>
            <a href={`/${langue}/confidentialite`}>{traduire(langue, 'pied.confidentialite')}</a>
            <span>
              {traduire(langue, 'pied.droits')
                .replace('{annee}', String(annee))
                .replace('{marque}', traduire(langue, 'marque.nom'))}
            </span>
          </nav>

          <SelecteurLangue langue={langue} chemin={chemin} requete={requete} />
        </div>
      </div>
    </footer>
  );
}
