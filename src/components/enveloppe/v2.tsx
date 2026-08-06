import type { ReactNode } from 'react';

import { LANGUES_INTERFACE, traduire, type LangueInterface } from '@/i18n';
import type { Utilisateur } from '@/domain/api/contract';
import { IconeCompte, IconeLoupe, IconePanier } from '@/components/icones';
import { TiroirPanier } from '@/components/v2/tiroir-panier';
import { Marque } from '@/components/v2/marque';
import { MenuMobile } from '@/components/v2/menu-mobile';
import { EnteteReactif } from '@/components/v2/entete-reactif';
import styles from './v2.module.css';

/**
 * ENVELOPPE — DIRECTION V2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER NE CHOISIT PAS SES COULEURS.                                 │
 * │                                                                          │
 * │ Comme la V1, il ne lit que des jetons. Ce qui le distingue est la MISE   │
 * │ EN PAGE : un en-tête qui se détache du contenu, le montant du panier    │
 * │ écrit en toutes lettres, et un pied vert profond qui ferme la page.      │
 * │                                                                          │
 * │ Le montant vient du SERVEUR, jamais d'une addition faite ici — c'est la  │
 * │ même règle que le panier, et un test d'architecture la tient.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════════════════════════
// SÉLECTEUR DE LANGUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bascule de langue — elle conserve la page courante, et ses filtres.
 *
 * Renvoyer à l'accueil est le défaut le plus répandu des sélecteurs de langue,
 * et le plus décourageant : un lecteur qui a filtré la boutique perd son
 * travail pour avoir voulu lire en anglais. Seul le PREMIER segment change.
 */
export function SelecteurLangueV2({
  langue,
  chemin,
  requete = '',
  abrege = false,
}: {
  langue: LangueInterface;
  chemin: string;
  requete?: string;
  abrege?: boolean;
}): ReactNode {
  function versLangue(cible: LangueInterface): string {
    const segments = chemin.split('/');
    segments[1] = cible;
    return `${segments.join('/')}${requete}`;
  }

  return (
    <div className={styles.langues} role="group" aria-label={traduire(langue, 'langue.selecteur')}>
      {LANGUES_INTERFACE.map((code) => {
        const courante = code === langue;
        const libelle = traduire(langue, abrege ? `langue.${code}Court` : `langue.${code}`);

        return courante ? (
          <span key={code} className={`${styles.langue} ${styles.langueActive}`} aria-current="true">
            {libelle}
          </span>
        ) : (
          <a
            key={code}
            className={styles.langue}
            href={versLangue(code)}
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
// EN-TÊTE
// ═══════════════════════════════════════════════════════════════════════════

/** Une entrée de la navigation principale. */
interface EntreeNav {
  cle: Parameters<typeof traduire>[1];
  chemin: string;
}

const NAVIGATION: EntreeNav[] = [
  { cle: 'navigation.catalogue', chemin: 'catalogue' },
  { cle: 'navigation.offres', chemin: 'offres' },
  { cle: 'navigation.blog', chemin: 'blog' },
  { cle: 'navigation.apropos', chemin: 'a-propos' },
  { cle: 'pied.contact', chemin: 'contact' },
];

export function EnteteV2({
  langue,
  utilisateur,
  chemin,
  requete,
  panier,
  pose = false,
}: {
  langue: LangueInterface;
  utilisateur: Utilisateur | null;
  chemin: string;
  requete?: string;
  /**
   * L'état du panier, RÉSOLU PAR LE SERVEUR.
   *
   * `affichage` est le montant formaté par le serveur — jamais une addition
   * faite ici. Le franc CFA n'a pas de sous-unité, et une division par cent
   * écrite dans un en-tête multiplierait l'erreur par cent sur chaque page.
   */
  panier: { nombre: number; affichage: string | null };
  /**
   * L'en-tête est-il POSÉ sur le hero d'accueil ?
   *
   * Vrai uniquement sur l'accueil, dont le hero porte une image assez sombre.
   * Ailleurs, un en-tête transparent deviendrait illisible dès le premier
   * bloc de crème.
   */
  pose?: boolean;
}): ReactNode {
  /** Le premier segment après la langue — `/fr/catalogue` → `catalogue`. */
  const segment = chemin.split('/')[2] ?? '';

  const interieur = (
    <>
      {/*
       * Premier élément focalisable de la page : un utilisateur au clavier
       * atteint le contenu sans traverser toute la navigation. Invisible
       * jusqu'au focus, jamais absent — c'est un critère AA.
       */}
      <a className={styles.evitement} href="#contenu">
        {traduire(langue, 'navigation.allerAuContenu')}
      </a>

      <div className={styles.enteteInterieur}>
        <Marque langue={langue} />

        <nav className={styles.navigation} aria-label={traduire(langue, 'navigation.principal')}>
          {NAVIGATION.map((entree) => {
            const courante = entree.chemin === segment;
            return (
              <a
                key={entree.chemin}
                href={`/${langue}/${entree.chemin}`}
                aria-current={courante ? 'page' : undefined}
              >
                {traduire(langue, entree.cle)}
              </a>
            );
          })}
        </nav>

        <div className={styles.actions}>
          {/*
           * ┌──────────────────────────────────────────────────────────────┐
           * │ LE RACCOURCI D'ADMINISTRATION N'OUVRE AUCUNE PORTE.          │
           * │                                                              │
           * │ Le rôle vient du profil RELU EN BASE par l'enveloppe, jamais │
           * │ d'un jeton ni d'un état de navigateur. Et le montrer ne       │
           * │ donne rien : `exigerAdministrateur` refait le contrôle sur    │
           * │ chaque écran, chaque route d'API le refait, et chaque         │
           * │ fonction SQL le refait une troisième fois. Ce lien épargne    │
           * │ une adresse tapée à la main — c'est tout ce qu'il fait.       │
           * │                                                              │
           * │ Il est posé AVANT le sélecteur de langue plutôt qu'à côté du  │
           * │ compte : l'administrateur y vient plusieurs fois par jour, et │
           * │ un raccourci qu'on doit chercher n'en est pas un.             │
           * └──────────────────────────────────────────────────────────────┘
           */}
          {utilisateur?.role === 'admin' ? (
            <a
              className={`${styles.raccourciAdmin} ${styles.actionSecondaire}`}
              href={`/${langue}/admin`}
            >
              {traduire(langue, 'navigation.administration')}
            </a>
          ) : null}

          <SelecteurLangueV2 langue={langue} chemin={chemin} requete={requete} abrege />

          {/*
           * La loupe, le sélecteur de langue et le compte portent une classe
           * de PLUS que `carreAction` : c'est elle qui permet de les retirer
           * de l'en-tête étroit sans emporter le panier avec eux. Tous trois
           * sont repris dans le menu plein écran, où ils restent atteignables.
           */}
          <a
            className={`${styles.carreAction} ${styles.actionSecondaire}`}
            href={`/${langue}/catalogue`}
            aria-label={traduire(langue, 'navigation.recherche')}
          >
            <IconeLoupe taille={19} />
          </a>

          {/*
           * Le montant ne paraît QUE s'il y a quelque chose à payer.
           *
           * « 0,00 € » en permanence dans un en-tête — ce que fait le site
           * actuel — occupe une place pour ne rien dire, et signale surtout
           * que le panier est vide à qui n'y avait pas pensé.
           */}
          {panier.affichage ? <span className={styles.montant}>{panier.affichage}</span> : null}

          {/*
           * ┌──────────────────────────────────────────────────────────────┐
           * │ LE TIROIR N'EXISTE QUE POUR UN COMPTE CONNECTÉ.              │
           * │                                                              │
           * │ Le panier est attaché à l'utilisateur : `PUT /api/orders`     │
           * │ rend 401 pour un visiteur. Lui montrer un bouton qui ouvre   │
           * │ un tiroir vide, ou pire le renvoie vers la connexion sans    │
           * │ prévenir, serait une porte qui se referme au nez de qui la   │
           * │ pousse. Un visiteur reçoit donc un LIEN vers l'écran du      │
           * │ panier, qui sait, lui, l'inviter à se connecter.             │
           * └──────────────────────────────────────────────────────────────┘
           */}
          {utilisateur ? (
            <TiroirPanier langue={langue} nombreInitial={panier.nombre} />
          ) : (
            <a
              className={styles.carreAction}
              href={`/${langue}/panier`}
              aria-label={traduire(langue, 'navigation.panier')}
            >
              <IconePanier taille={20} />
            </a>
          )}

          {/*
           * Le menu plein écran, pour l'écran étroit. La `<nav>` ci-dessus
           * reste dans le document et se masque en CSS : sans JavaScript, la
           * navigation demeure — sinon un téléphone n'aurait plus AUCUN moyen
           * d'atteindre le catalogue.
           */}
          <MenuMobile
            langue={langue}
            chemin={chemin}
            requete={requete}
            connecte={utilisateur !== null}
            administrateur={utilisateur?.role === 'admin'}
          />

          {utilisateur ? (
            <a
              className={`${styles.carreAction} ${styles.actionSecondaire}`}
              href={`/${langue}/compte`}
              aria-label={traduire(langue, 'navigation.compte')}
            >
              <IconeCompte taille={20} />
            </a>
          ) : (
            <a
              className={`${styles.lienTexte} ${styles.actionSecondaire}`}
              href={`/${langue}/connexion`}
            >
              {traduire(langue, 'navigation.connexion')}
            </a>
          )}
        </div>
      </div>
    </>
  );

  // Posé sur le hero : l'élément `<header>` devient réactif au défilement.
  // Ailleurs, il reste un en-tête ordinaire, rendu par le serveur.
  return pose ? (
    <EnteteReactif>{interieur}</EnteteReactif>
  ) : (
    <header className={styles.entete}>{interieur}</header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PIED DE PAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Une colonne du pied — dépliante sur téléphone, ouverte sur ordinateur.
 *
 * `<details open>` : le CSS ne montre le résumé qu'en écran étroit, où
 * l'utilisateur peut alors replier. Sur ordinateur, le résumé est masqué et la
 * liste reste visible — c'est le comportement voulu dans les deux cas, sans
 * une ligne de JavaScript.
 */
function ColonnePied({ titre, children }: { titre: string; children: ReactNode }): ReactNode {
  return (
    <details className={styles.piedColonne} open>
      <summary className={styles.piedResume}>{titre}</summary>
      <p className={styles.piedTitre}>{titre}</p>
      <ul className={styles.piedListe}>{children}</ul>
    </details>
  );
}

export function PiedDePageV2({
  langue,
  chemin,
  requete,
  annee,
}: {
  langue: LangueInterface;
  chemin: string;
  requete?: string;
  /** L'année vient de l'horloge injectable, jamais de l'heure du navigateur. */
  annee: number;
}): ReactNode {
  return (
    <footer className={styles.pied}>
      <div className={styles.piedHaut}>
        <div className={styles.piedIdentite}>
          <Marque langue={langue} ton="sombre" />
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
            <a href={`/${langue}/blog`}>{traduire(langue, 'navigation.blog')}</a>
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

          <SelecteurLangueV2 langue={langue} chemin={chemin} requete={requete} />
        </div>
      </div>
    </footer>
  );
}
