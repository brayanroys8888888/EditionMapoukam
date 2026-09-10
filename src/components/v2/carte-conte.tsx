import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { EntreeCatalogue } from '@/domain/catalog/types';
import { ligneAcces } from '@/components/catalogue';
import { Couverture, SubstitutCouverture } from '@/components/catalogue/couverture';
import { Surligne } from '@/components/catalogue/surlignage';
import { metaLivre } from '@/components/catalogue/meta';
import { FormulaireAjout } from '@/components/panier/ajout';
import { teinteDepuisThemes } from '@/components/motif';
import { estV3 } from '@/design/version';
import styles from './v2.module.css';

/**
 * CARTE DE CONTE — DIRECTION V2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA COUVERTURE PASSE DEVANT, LE RESTE RECULE.                            │
 * │                                                                          │
 * │ Le reproche fait au site actuel — « les couvertures sont mal mises en    │
 * │ valeur » — vient d'un empilement : une vignette plate, un fond coloré    │
 * │ qui se bat avec l'illustration, et une métadonnée grise qui prend autant │
 * │ de place que l'image.                                                    │
 * │                                                                          │
 * │ Ici la carte est neutre, la couverture porte une ombre qui la décolle,   │
 * │ elle s'agrandit au survol, et un voile vert y fait apparaître            │
 * │ l'invitation à lire l'extrait.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL LIEN, ÉTIRÉ — ET UN VRAI BOUTON PAR-DESSUS.                     │
 * │                                                                          │
 * │ La carte porte un bouton « ajouter au panier », donc un `<form>`. Un     │
 * │ formulaire dans un lien est du HTML invalide, et les navigateurs le      │
 * │ réparent en le sortant du lien — le bouton atterrit alors hors de la     │
 * │ carte, ce qui ne se voit qu'à l'usage.                                   │
 * │                                                                          │
 * │ Le lien du titre s'étire donc sur toute la carte par un pseudo-élément,  │
 * │ et le bouton repasse au-dessus par `z-index`. La surface reste           │
 * │ entièrement cliquable, un seul libellé est annoncé, et le bouton est un  │
 * │ bouton.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA RÈGLE DES TROIS LIGNES D'ACCÈS EST REPRISE TELLE QUELLE.             │
 * │                                                                          │
 * │ `ligneAcces` est celle de la V1, importée et non recopiée. Elle porte la │
 * │ décision qui compte : « Dans votre bibliothèque » prend le pas sur un    │
 * │ prix comme sur « avec l'abonnement », parce que les deux invitent à      │
 * │ obtenir ce qu'on détient déjà.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const COUVERTURE_LARGEUR = 320;
const COUVERTURE_HAUTEUR = 480;

export function CarteConteV2({
  langue,
  entree,
  disposition = 'grille',
  actionAjout,
  recherche,
}: {
  langue: LangueInterface;
  entree: EntreeCatalogue;
  /** La requête courante, marquée dans le titre. Voir `surlignage.tsx`. */
  recherche?: string | undefined;
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ EN RANGÉE, L'ACTION QUITTE LA COUVERTURE — ET C'EST TOUT CE QUI CHANGE.│
   * │                                                                        │
   * │ En grille, le bouton monte sur la couverture au survol : il ne coûte   │
   * │ aucune hauteur, et la grille ne saute pas au passage de la souris.     │
   * │                                                                        │
   * │ En rangée, la couverture ne fait plus que 96 px de large. Un bouton    │
   * │ « Ajouter au panier » n'y tient pas, et un voile de 96 px sur une      │
   * │ rangée de 900 recouvrirait la seule chose qu'on est venu regarder.     │
   * │ L'action prend donc sa propre colonne, à droite, et elle est visible   │
   * │ en permanence — il n'y a plus de hauteur à économiser.                 │
   * │                                                                        │
   * │ Le bouton, lui, est le MÊME : même formulaire, même Server Action,     │
   * │ même règle d'achetabilité. Seule sa place change.                      │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  disposition?: 'grille' | 'liste';
  /**
   * Ajout au panier — une Server Action, jamais un lien.
   *
   * Un `GET` qui modifie un panier est rejoué par le moindre préchargement de
   * navigateur, et par tout robot qui suit les liens de la page. Absente, le
   * bouton n'est simplement pas rendu.
   */
  actionAjout?: (donnees: FormData) => void | Promise<void>;
}): ReactNode {
  const ligne = ligneAcces(entree);
  const ligneMeta = metaLivre(langue, entree);

  /*
   * Le bouton d'ajout n'a de sens que pour un titre ACHETABLE et NON DÉTENU.
   *
   * `acces.canRead` désigne quelqu'un qui peut déjà lire — abonné ou
   * acheteur : lui proposer d'acheter serait l'inviter à repayer ce qu'il a.
   */
  const achetable =
    entree.disponible_achat &&
    entree.prix !== null &&
    ligne.sorte !== 'possede' &&
    actionAjout !== undefined;

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ L'ACTION EST POSÉE SUR LA COUVERTURE, PAS SOUS LA CARTE.                │
   * │                                                                          │
   * │ Deux demandes se rejoignent ici : raccourcir la carte, et ne montrer le │
   * │ bouton qu'au survol. Le laisser dans le flux et le faire apparaître      │
   * │ aurait fait sauter la grille entière au passage de la souris ; réserver  │
   * │ sa place pour éviter le saut aurait annulé le gain de hauteur.           │
   * │                                                                          │
   * │ Sur la couverture, il ne coûte AUCUNE hauteur, et il monte avec le voile │
   * │ vert qui existait déjà pour « lire l'extrait ».                          │
   * │                                                                          │
   * │ Le voile ne porte donc `aria-hidden` que lorsqu'il est DÉCORATIF. Dès    │
   * │ qu'il contient un bouton ou un lien, le masquer aux lecteurs d'écran     │
   * │ retirerait la seule action de la carte.                                  │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const action =
    ligne.sorte === 'possede' ? (
      /*
       * Déjà détenu : on propose de LIRE, jamais d'acheter. C'est le même
       * contresens que la troisième ligne d'accès existe pour éviter.
       */
      <div className={styles.formAjout}>
        <a className={styles.lireCarte} href={`/${langue}/lire/${entree.slug}`}>
          {traduire(langue, 'fiche.lireEnLigne')}
        </a>
      </div>
    ) : achetable ? (
      /*
       * ┌────────────────────────────────────────────────────────────────┐
       * │ LE FORMULAIRE EST ENVELOPPÉ, IL N'EST PAS REMPLACÉ.            │
       * │                                                                │
       * │ `FormulaireAjout` rend exactement ce `<form action={…}>` — même │
       * │ classe, même Server Action, même bouton. Il y AJOUTE un         │
       * │ `onSubmit` qui, si JavaScript s'exécute, empêche la navigation  │
       * │ et fait l'ajout sur place : pastille et toast sur la même       │
       * │ image que le clic, sans recharger l'écran.                      │
       * │                                                                │
       * │ La carte reste rendue par le SERVEUR : seul le formulaire       │
       * │ bascule côté client. C'est ce qui évite d'expédier la grille    │
       * │ entière au navigateur — §5.1.                                   │
       * └────────────────────────────────────────────────────────────────┘
       */
      <FormulaireAjout
        className={styles.formAjout}
        action={actionAjout}
        langue={langue}
        livreId={entree.id}
        titre={entree.titre}
      >
        {/*
         * ┌────────────────────────────────────────────────────────────────┐
         * │ LE LIBELLÉ EST DANS UN `span` POUR POUVOIR ÊTRE MASQUÉ — PAS   │
         * │ RETIRÉ.                                                        │
         * │                                                                │
         * │ Sous Organic, la maquette réduit ce bouton à un disque de      │
         * │ 46 px portant un « + », posé sur le coin de la couverture.     │
         * │ Le mot disparaît donc de l'écran, et il doit rester dans le    │
         * │ document : c'est lui qui donne son nom au bouton. Un disque    │
         * │ sans texte s'annonce « bouton », et rien d'autre.              │
         * │                                                                │
         * │ Le « + » lui-même est dessiné en CSS : un pseudo-élément       │
         * │ n'entre dans aucun arbre d'accessibilité, il ne peut donc pas  │
         * │ venir concurrencer le nom accessible.                          │
         * └────────────────────────────────────────────────────────────────┘
         */}
        <button type="submit" className={styles.ajouter}>
          <span className={styles.ajouterTexte}>
            {traduire(langue, 'fiche.ajouterAuPanier')}
          </span>
        </button>
      </FormulaireAjout>
    ) : null;

  const rangee = disposition === 'liste';

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ UN LIVRET SE PRÉSENTE COUCHÉ — ET LE SUPPORT SUFFIT À LE DIRE.          │
   * │                                                                          │
   * │ La maquette dessine DEUX cartes qui ne se ressemblent pas. Le conte      │
   * │ est une couverture nue posée sur le fond de page, au ratio 268/403,      │
   * │ dont le bouton d'ajout monte sur l'image. Le livret est un PANNEAU —     │
   * │ fond, filet, rayon de 28, ombre — dont la couverture est couchée en      │
   * │ 16/11, et dont l'action vit dans une rangée de pied séparée par un       │
   * │ filet. Ce n'est pas un habillage : c'est la forme réelle de l'objet.     │
   * │ Un livret pédagogique est un A4 à l'italienne, un conte est un album     │
   * │ debout. Les recadrer au même gabarit tronquerait l'un des deux.          │
   * │                                                                          │
   * │ La bascule se lit donc sur `type_document`, et sur rien d'autre. C'est   │
   * │ un usage LÉGITIME de l'étiquette de rangement : elle décide d'une mise   │
   * │ en page, jamais d'un droit. `access_for_books` ne la lit pas et ne doit  │
   * │ pas la lire — `livret-acces-modulaire.test.ts` en fait la preuve sur les │
   * │ huit combinaisons des trois leviers.                                     │
   * │                                                                          │
   * │ Corollaire : sur `/catalogue`, où les deux supports se mêlent, la grille │
   * │ porte les deux formes en même temps. C'est voulu — c'est justement là    │
   * │ qu'un lecteur a besoin de distinguer d'un coup d'œil ce qu'il regarde.   │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * La forme couchée n'existe QUE sous Organic : la V2 n'a jamais été dessinée
   * autour d'elle, et lui imposer un panneau de plus ferait deux directions
   * artistiques dans la même grille.
   */
  const paysage = estV3() && entree.type_document === 'livret_pedagogique' && !rangee;

  /*
   * Le pied de prix, écrit UNE fois et posé à l'un de deux endroits.
   *
   * Sur un conte il tombe sous la méta, en bas de la carte. Sur un livret il
   * entre dans la rangée de pied, à droite, contre le bouton d'ajout. Le
   * recopier aurait mis en double la règle des trois lignes d'accès et le prix
   * formaté par le serveur — les deux endroits du dépôt où une copie coûte le
   * plus cher.
   */
  const pied = (
    <span className={styles.cartePied}>
      {ligne.sorte === 'possede' || ligne.sorte === 'gratuit' ? (
        <span className={styles.accesPossede}>
          {traduire(langue, ligne.sorte === 'possede' ? 'acces.purchase' : 'acces.free')}
        </span>
      ) : ligne.sorte === 'prix' ? (
        <>
          {/*
           * `prix.affichage` est formaté par le SERVEUR, seule autorité sur
           * le nombre de décimales : le franc CFA n'a pas de sous-unité, et
           * une division par cent écrite ici multiplierait l'erreur par cent.
           */}
          <span className={styles.prix}>{ligne.affichage}</span>
          {entree.inclus_abonnement ? (
            <span className={styles.prixSuite}>
              {traduire(langue, 'catalogue.ouInclusAbonnement')}
            </span>
          ) : null}
        </>
      ) : ligne.sorte === 'abonnement' ? (
        <span className={styles.accesPossede}>
          {traduire(langue, 'acces.inclusAbonnement')}
        </span>
      ) : null}
    </span>
  );

  const theme =
    entree.themes[0] !== undefined ? (
      <span className={styles.origine}>
        <span className={styles.puce} aria-hidden="true" />
        {entree.themes[0]}
      </span>
    ) : null;

  /*
   * Le SEUL lien de la carte, et il couvre toute sa surface.
   *
   * `data-etire` dit que sa CIBLE n'est pas sa boîte : le pseudo-élément la
   * porte à la taille de la carte. Sans ce marqueur, une vérification de cible
   * tactile mesure la hauteur du texte — vingt pixels — et signale un défaut
   * là où la zone cliquable fait trois cents pixels.
   */
  const lienTitre = (
    <a
      className={`${styles.carteTitre} ${styles.lienEtire}`}
      href={`/${langue}/contes/${entree.slug}`}
      data-etire="true"
    >
      <Surligne texte={entree.titre} recherche={recherche} />
    </a>
  );

  if (paysage) {
    return (
      <div
        className={`${styles.carte} ${styles.carteLivret}`}
        data-format="paysage"
        /*
         * ┌──────────────────────────────────────────────────────────────────┐
         * │ UNE PLANCHE DEBOUT DANS UN CADRE COUCHÉ SE CONTIENT, ELLE NE SE  │
         * │ RECADRE PAS.                                                     │
         * │                                                                  │
         * │ `object-fit: cover` remplit le cadre en rognant ce qui dépasse.  │
         * │ Sur une couverture, c'est le bon choix : on perd de la marge.    │
         * │ Sur une fiche A4 DEBOUT placée dans un cadre 16/11, on perd les  │
         * │ deux tiers de la feuille — le titre en haut, le numéro en bas,   │
         * │ et il ne reste qu'une bande du milieu.                           │
         * │                                                                  │
         * │ La maquette pose `cover` parce que ses fiches sont couchées ;    │
         * │ elle pose `contain` sur la fiche d'un livret (ligne 1202), là où │
         * │ la planche doit se lire en entier. C'est la même règle, appliquée │
         * │ à ce qu'on a réellement.                                          │
         * │                                                                  │
         * │ L'orientation est LUE sur l'entrée, jamais déduite du fichier :  │
         * │ c'est l'éditeur qui la déclare au dépôt, et un livret porte      │
         * │ souvent une couverture debout devant des planches couchées.      │
         * └──────────────────────────────────────────────────────────────────┘
         */
        data-orientation={entree.orientation}
      >
        <div className={styles.cadreCouverture}>
          {entree.couverture ? (
            <Couverture
              langue={langue}
              url={entree.couverture.vignette}
              largeur={COUVERTURE_LARGEUR}
              hauteur={COUVERTURE_HAUTEUR}
              tailles="(max-width: 640px) 92vw, 330px"
              teinte={teinteDepuisThemes(entree.themes)}
              alt=""
              classeImage={styles.couverture}
            />
          ) : (
            <SubstitutCouverture langue={langue} teinte={teinteDepuisThemes(entree.themes)} />
          )}

          {/*
           * La pastille de gratuité, en haut à gauche — `top:14px;left:14px`.
           *
           * Elle est `aria-hidden` : le pied de la carte annonce déjà « Offert »
           * en toutes lettres, et l'entendre deux fois ne dit rien de plus.
           */}
          {entree.gratuit ? (
            <span className={styles.badgeLivret} aria-hidden="true">
              {traduire(langue, 'acces.free')}
            </span>
          ) : null}

          {/*
           * Le niveau, en bas à gauche. Absent sur un livret qui n'en déclare
           * pas — la colonne est nullable depuis la 0079, et une pastille vide
           * serait un rectangle sans raison.
           */}
          {entree.niveau ? (
            <span className={styles.niveauLivret}>{entree.niveau}</span>
          ) : null}
        </div>

        <div className={styles.corpsLivret}>
          {theme}
          {lienTitre}
          {entree.resume ? (
            <p className={styles.resumeLivret}>{entree.resume}</p>
          ) : null}

          <div className={styles.piedLivret}>
            {ligneMeta ? <span className={styles.carteMeta}>{ligneMeta}</span> : null}
            <span className={styles.piedLivretActions}>
              {pied}
              {action}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={rangee ? `${styles.carte} ${styles.carteListe}` : styles.carte}>
      <div className={styles.cadreCouverture}>
        {entree.couverture ? (
          // La VIGNETTE, jamais la taille « fiche » : sur une grille de vingt
          // titres l'écart se compte en mégaoctets, et §5.1 qualifie ce
          // gaspillage de critique pour le public visé.
          <Couverture
            langue={langue}
            url={entree.couverture.vignette}
            largeur={COUVERTURE_LARGEUR}
            hauteur={COUVERTURE_HAUTEUR}
            tailles="(max-width: 640px) 80vw, 260px"
            teinte={teinteDepuisThemes(entree.themes)}
            // Vide, et délibérément : le titre est écrit juste en dessous, et
            // le redire ferait entendre deux fois la même phrase.
            alt=""
            classeImage={styles.couverture}
          />
        ) : (
          <SubstitutCouverture langue={langue} teinte={teinteDepuisThemes(entree.themes)} />
        )}

        {/*
         * En rangée, le voile n'est pas rendu du tout — ni celui qui porte
         * l'action, ni sa version décorative. Une invitation à « lire un
         * extrait » écrite sur une vignette de 96 px serait illisible, et le
         * lien étiré couvre déjà toute la rangée.
         */}
        {rangee ? null : action ? (
          <div className={styles.voile}>{action}</div>
        ) : (
          /*
           * `aria-hidden` : sans action à porter, ce n'est plus que la
           * répétition décorative de ce que le lien étiré fait déjà.
           */
          <div className={styles.voile} aria-hidden="true">
            <span className={styles.voileTexte}>{traduire(langue, 'fiche.lireExtrait')}</span>
          </div>
        )}
      </div>

      {/*
        LE THÈME À LA PLACE DE LA TRADITION — migration 0071.

        Le thème s'écrit tel quel : c'est de la saisie libre de l'éditeur, il
        n'existe aucune clé de traduction à aller chercher, et une clé absente
        afficherait son propre nom au lieu du mot attendu.
      */}
      {theme}

      {lienTitre}

      {ligneMeta ? <span className={styles.carteMeta}>{ligneMeta}</span> : null}

      {pied}

      {/*
        En grille, l'action vit sur la couverture — voir l'encadré plus haut.
        En rangée, elle prend la colonne de droite, et rien ne la cache.
      */}
      {rangee && action ? <div className={styles.carteListeAction}>{action}</div> : null}
    </div>
  );
}
