import type { ReactNode } from 'react';

import { LANGUES_INTERFACE, traduire, type LangueInterface } from '@/i18n';
import type { Utilisateur } from '@/domain/api/contract';
import { IconeCompte, IconeLoupe, IconePanier, IconeReglages } from '@/components/icones';
import { TiroirPanier } from '@/components/v2/tiroir-panier';
import { RechercheGlobale } from '@/components/v2/recherche-globale';
import { Marque } from '@/components/v2/marque';
import { MenuMobile } from '@/components/v2/menu-mobile';
import { EnteteReactif } from '@/components/v2/entete-reactif';
import { estV3 } from '@/design/version';
import { IDENTITE_EDITEUR } from '@/content/editorial';
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

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ `abrege` DIT AUSSI OÙ LE SÉLECTEUR EST POSÉ, ET PAS SEULEMENT SA     │
   * │ LONGUEUR.                                                            │
   * │                                                                      │
   * │ « FR / EN » plutôt que « Français / English », c'est ce qu'on met     │
   * │ dans une barre serrée — jamais dans le pied de page, qui a la place   │
   * │ d'écrire les noms en entier. Les deux emplacements ne demandent donc  │
   * │ pas le même dessin : sous Organic, la barre utilitaire porte une      │
   * │ pastille translucide de 30 px sur l'olive, quand le pied garde le     │
   * │ commutateur pleine hauteur.                                          │
   * │                                                                      │
   * │ La classe suit la propriété qui existe déjà plutôt que d'en ajouter   │
   * │ une seconde : deux drapeaux pour un seul état finissent toujours par  │
   * │ se contredire.                                                       │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  return (
    <div
      className={styles.langues}
      /*
       * Un ATTRIBUT, et pas une seconde classe.
       *
       * Une classe qui ne serait déclarée que sous `:global(:root[data-design=
       * 'v3'])` n'est pas exportée par le module CSS : `styles.x` vaudrait
       * `undefined` et le `class` rendu serait la chaîne « undefined ». Rien
       * ne le signale — ni le build, ni `tsc`, ni l'exécution.
       * `tests/unit/classes-css.test.ts` existe pour ce piège précis.
       *
       * L'attribut n'a pas ce défaut : il se pose sur une classe déjà locale.
       */
      data-abrege={abrege ? '' : undefined}
      role="group"
      aria-label={traduire(langue, 'langue.selecteur')}
    >
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

/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║ LES DEUX RAYONS, SOUS UNE LISTE DÉROULANTE.                              ║
 * ╠═══════════════════════════════════════════════════════════════════════╣
 * ║ Contes et livrets pédagogiques ne se cherchent pas de la même façon :    ║
 * ║ l'un se lit le soir, l'autre s'imprime pour une classe. Ils ont donc     ║
 * ║ chacun leur écran, et cette liste est la porte des deux.                 ║
 * ║                                                                          ║
 * ║ « Tout le catalogue » N'Y FIGURE PLUS, et l'adresse n'est pas fermée     ║
 * ║ pour autant : le plan de site, la loupe, le pied de page et tous les     ║
 * ║ liens déjà partagés continuent d'y mener. Ce qui est retiré, c'est une   ║
 * ║ TROISIÈME porte, ouverte à côté de deux qui mènent au même fonds — elle  ║
 * ║ demandait de choisir entre « les contes », « les livrets » et « les      ║
 * ║ deux », alors que la question posée en arrivant est la première.         ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * Les libellés des deux rayons sont ceux de `documents.*`, déjà employés par
 * les pastilles de filtre et par le back-office. Un second jeu de clés aurait
 * fini par appeler « Livrets » ici ce que le catalogue nomme « Livrets
 * pédagogiques », sans qu'aucun test ne s'en aperçoive.
 */
const RAYONS: EntreeNav[] = [
  { cle: 'documents.contes', chemin: 'contes' },
  { cle: 'documents.livrets_pedagogiques', chemin: 'livrets' },
];

const NAVIGATION: EntreeNav[] = [
  { cle: 'navigation.offres', chemin: 'offres' },
  { cle: 'navigation.association', chemin: 'association' },
  { cle: 'navigation.expertise', chemin: 'expertise' },
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
        {/*
         * La signature « Contes d'Afrique » n'existe QUE dans l'en-tête.
         *
         * Le pied porte déjà la baseline complète juste sous la marque ; les
         * deux l'une sur l'autre diraient la même chose deux fois. Sous la
         * V2, elle n'a jamais été dessinée — d'où la condition.
         */}
        <Marque langue={langue} signature={estV3()} />

        <nav className={styles.navigation} aria-label={traduire(langue, 'navigation.principal')}>
          {/*
           * ┌───────────────────────────────────────────────────────────┐
           * │ UN `<details>`, ET PAS UN MENU EN JAVASCRIPT.                 │
           * │                                                              │
           * │ Il s'ouvre au clic ET au clavier, il annonce son état aux     │
           * │ lecteurs d'écran, et il fonctionne sans une ligne de script  │
           * │ — la condition réelle d'une partie du public (§5.1). Le pied │
           * │ de page emploie déjà le même élément pour ses colonnes.      │
           * │                                                              │
           * │ Il se referme en changeant de page, puisque la page est      │
           * │ rechargée : aucun état à remettre à zéro, donc aucun état à  │
           * │ oublier de remettre à zéro.                                  │
           * └───────────────────────────────────────────────────────────┘
           */}
          <details className={styles.rayons}>
            <summary
              className={styles.rayonsResume}
              /*
               * `aria-current="true"`, et non `"page"` : le résumé n'est pas
               * une page, c'est le groupe qui contient celle qu'on regarde.
               */
              aria-current={
                RAYONS.some((rayon) => rayon.chemin === segment) ? 'true' : undefined
              }
            >
              {traduire(langue, 'navigation.catalogue')}
            </summary>

            <ul className={styles.rayonsListe}>
              {RAYONS.map((rayon) => (
                <li key={rayon.chemin}>
                  <a
                    href={`/${langue}/${rayon.chemin}`}
                    aria-current={rayon.chemin === segment ? 'page' : undefined}
                  >
                    {traduire(langue, rayon.cle)}
                  </a>
                </li>
              ))}
            </ul>
          </details>

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
              className={`${styles.carreAction} ${styles.actionSecondaire}`}
              href={`/${langue}/admin`}
              aria-label={traduire(langue, 'navigation.administration')}
              title={traduire(langue, 'navigation.administration')}
            >
              <IconeReglages taille={19} />
            </a>
          ) : null}

          {/*
           * ┌──────────────────────────────────────────────────────────────┐
           * │ SOUS LA V3, LA LANGUE A DÉMÉNAGÉ DANS LA BARRE UTILITAIRE.  │
           * │                                                              │
           * │ La laisser AUSSI ici la donnerait deux fois sur le même       │
           * │ écran — et deux groupes `role="group"` de même libellé, que   │
           * │ le lecteur d'écran annonce l'un après l'autre sans pouvoir    │
           * │ dire lequel fait quoi.                                        │
           * │                                                              │
           * │ Elle reste dans le menu plein écran, comme sous la V2 : le    │
           * │ menu est le seul endroit atteignable quand la barre a défilé. │
           * └──────────────────────────────────────────────────────────────┘
           */}
          {estV3() ? null : (
            <SelecteurLangueV2 langue={langue} chemin={chemin} requete={requete} abrege />
          )}

          {/*
           * La loupe, le sélecteur de langue et le compte portent une classe
           * de PLUS que `carreAction` : c'est elle qui permet de les retirer
           * de l'en-tête étroit sans emporter le panier avec eux. Tous trois
           * sont repris dans le menu plein écran, où ils restent atteignables.
           */}
          {/*
           * ┌──────────────────────────────────────────────────────────────┐
           * │ SOUS ORGANIC, LA LOUPE OUVRE ; AILLEURS, ELLE MÈNE.          │
           * │                                                              │
           * │ `RechercheGlobale` rend la MÊME ancre vers `/catalogue` et   │
           * │ n'en intercepte le clic que si le script s'exécute : sans    │
           * │ JavaScript, la loupe continue de mener à l'écran de          │
           * │ recherche, qui porte un vrai formulaire `GET`. Les classes   │
           * │ lui sont passées pour qu'elle reste à sa place dans la barre │
           * │ d'actions, et l'icône lui est passée en enfant — ce          │
           * │ composant-là ne connaît pas le dessin de l'en-tête.          │
           * │                                                              │
           * │ La V1 et la V2 gardent l'ancre nue : elles n'ont pas de      │
           * │ superposition, et leur en donner une serait refondre deux    │
           * │ directions qu'on ne touche pas.                              │
           * └──────────────────────────────────────────────────────────────┘
           */}
          {estV3() ? (
            <RechercheGlobale
              langue={langue}
              className={`${styles.carreAction} ${styles.actionSecondaire}`}
            >
              <IconeLoupe taille={19} />
            </RechercheGlobale>
          ) : (
            <a
              className={`${styles.carreAction} ${styles.actionSecondaire}`}
              href={`/${langue}/catalogue`}
              aria-label={traduire(langue, 'navigation.recherche')}
            >
              <IconeLoupe taille={19} />
            </a>
          )}

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

          {/*
           * ┌──────────────────────────────────────────────────────────────┐
           * │ LE ROND DE COMPTE EXISTE DANS LES DEUX ÉTATS DE SESSION.     │
           * │                                                              │
           * │ Le prototype pose trois ronds — loupe, panier, compte — puis  │
           * │ la pilule « Se connecter ». Il n'a pas de session : les deux  │
           * │ paraissent ensemble. Ici, le rond mène au compte quand on est │
           * │ connecté, et à la connexion sinon ; la pilule, elle, ne sert  │
           * │ plus à rien une fois la session ouverte et disparaît.         │
           * │                                                              │
           * │ Le retirer pour un visiteur aurait décalé toute la barre      │
           * │ d'actions de cinquante pixels entre deux écrans du même site  │
           * │ — l'écart mesuré à la passe au pixel, et la raison pour       │
           * │ laquelle il est ici.                                          │
           * └──────────────────────────────────────────────────────────────┘
           */}
          {utilisateur || estV3() ? (
            <a
              className={`${styles.carreAction} ${styles.actionSecondaire}`}
              href={`/${langue}/${utilisateur ? 'compte' : 'connexion'}`}
              aria-label={traduire(
                langue,
                utilisateur ? 'navigation.compte' : 'navigation.connexion',
              )}
            >
              <IconeCompte taille={20} />
            </a>
          ) : null}

          {utilisateur ? null : (
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
          {/*
           * La classe est PASSÉE, et non ciblée depuis cette feuille.
           *
           * `<Marque>` porte ses propres classes, hachées par
           * `marque.module.css`. Une règle `.piedIdentite .marque` écrite ici
           * viserait le `.marque` LOCAL de cette feuille — un vestige — et ne
           * toucherait jamais le composant. Elle ne lèverait rien : elle
           * s'appliquerait à un élément qui n'existe plus.
           */}
          <Marque langue={langue} ton="sombre" className={styles.marquePied} />
          <p className={styles.piedBaseline}>{traduire(langue, 'marque.baseline')}</p>

          {/*
           * ┌──────────────────────────────────────────────────────────────┐
           * │ LA LETTRE DES NOUVEAUTÉS OUVRE LE COURRIEL, ELLE N'INSCRIT   │
           * │ PERSONNE.                                                     │
           * │                                                              │
           * │ Le dossier l'écrit en tête : « the newsletter [is] stubbed   │
           * │ with toasts ». Il n'y a ici ni table d'abonnés, ni route qui  │
           * │ en reçoive un, et `FileMailer` écrit dans `.mails/` — ce      │
           * │ n'est pas un canal vers l'éditeur.                            │
           * │                                                              │
           * │ Un « merci, vous êtes inscrit » que personne n'enregistre    │
           * │ est pire qu'un bloc absent : il fait attendre une lettre qui  │
           * │ ne partira jamais, et il collecte une adresse dans le vide.   │
           * │ Le formulaire remet donc la demande dans le logiciel de       │
           * │ courrier du visiteur — le même choix que l'écran de contact,  │
           * │ et pour la même raison.                                       │
           * │                                                              │
           * │ Le sujet voyage dans l'adresse, la saisie dans le corps du    │
           * │ message : `enctype="text/plain"` compose des lignes           │
           * │ `nom=valeur` lisibles, sans encodage de formulaire à          │
           * │ déchiffrer. Le jour où une route existera, seule l'`action`   │
           * │ changera.                                                     │
           * └──────────────────────────────────────────────────────────────┘
           */}
          <form
            className={styles.lettre}
            action={`mailto:${IDENTITE_EDITEUR.emailContact}?subject=${encodeURIComponent(
              traduire(langue, 'pied.lettreSujet'),
            )}`}
            method="post"
            encType="text/plain"
          >
            <p className={styles.lettreTitre} id="pied-lettre">
              {traduire(langue, 'pied.lettreTitre')}
            </p>
            <div className={styles.lettreRangee}>
              <input
                className={styles.lettreChamp}
                type="email"
                name="email"
                autoComplete="email"
                placeholder={traduire(langue, 'pied.lettreChamp')}
                aria-labelledby="pied-lettre"
              />
              <button className={styles.lettreAction} type="submit">
                {traduire(langue, 'pied.lettreAction')}
              </button>
            </div>
          </form>
        </div>

        <ColonnePied titre={traduire(langue, 'pied.colonneCatalogue')}>
          <li>
            <a href={`/${langue}/catalogue`}>{traduire(langue, 'pied.tousLesContes')}</a>
          </li>
          <li>
            <a href={`/${langue}/catalogue?tri=nouveautes`}>{traduire(langue, 'pied.nouveautes')}</a>
          </li>
          {/*
            Le rayon des livrets est atteignable d'ICI et par la pastille de
            filtre du catalogue — laquelle n'apparaît que si un livret est
            publié. Un lien de pied, lui, ne dépend d'aucune donnée : c'est
            l'entrée qui ne disparaît pas.
          */}
          <li>
            <a href={`/${langue}/livrets`}>{traduire(langue, 'livrets.lien')}</a>
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
            <a href={`/${langue}/association`}>{traduire(langue, 'navigation.association')}</a>
          </li>
          <li>
            <a href={`/${langue}/expertise`}>{traduire(langue, 'navigation.expertise')}</a>
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

          {/*
           * ┌──────────────────────────────────────────────────────────────┐
           * │ SOUS ORGANIC, LA BARRE DU BAS PORTE LE LIEU, PAS LA LANGUE. │
           * │                                                              │
           * │ La bascule FR/EN vit déjà dans la barre utilitaire, en haut  │
           * │ de chaque écran de la V3 — la maquette ne la met qu'à cet    │
           * │ endroit-là. La laisser aussi dans le pied en ferait deux, et │
           * │ deux commandes pour le même réglage se contredisent tôt ou   │
           * │ tard : celle du pied ne connaît pas l'état de celle du haut. │
           * │                                                              │
           * │ Le dossier met l'adresse à sa place. Elle n'est pas inventée │
           * │ pour l'occasion : c'est `IDENTITE_EDITEUR.adresse`, celle    │
           * │ qu'affiche déjà l'écran de contact.                          │
           * │                                                              │
           * │ La V2, qui n'a pas de barre utilitaire, garde son sélecteur. │
           * └──────────────────────────────────────────────────────────────┘
           */}
          {estV3() ? (
            <p className={styles.piedLieu}>{IDENTITE_EDITEUR.adresse}</p>
          ) : (
            <SelecteurLangueV2 langue={langue} chemin={chemin} requete={requete} />
          )}
        </div>
      </div>
    </footer>
  );
}
