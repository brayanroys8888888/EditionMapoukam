import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { EntreeCatalogue } from '@/domain/catalog/types';
import { ligneAcces } from '@/components/catalogue';
import { Couverture, SubstitutCouverture } from '@/components/catalogue/couverture';
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

/** « 5–8 ans · 16 pages » — la ligne de métadonnées. */
function meta(langue: LangueInterface, entree: EntreeCatalogue): string {
  const morceaux: string[] = [];

  if (entree.age_min !== null) {
    morceaux.push(
      entree.age_max === null
        ? traduire(langue, 'catalogue.trancheAgeCourteOuverte').replace(
            '{min}',
            String(entree.age_min),
          )
        : traduire(langue, 'catalogue.trancheAgeCourte')
            .replace('{min}', String(entree.age_min))
            .replace('{max}', String(entree.age_max)),
    );
  }

  if (entree.nb_pages !== null) {
    morceaux.push(traduire(langue, 'catalogue.nbPages').replace('{pages}', String(entree.nb_pages)));
  }

  return morceaux.join(' · ');
}

export function CarteConteV2({
  langue,
  entree,
  actionAjout,
}: {
  langue: LangueInterface;
  entree: EntreeCatalogue;
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
  const ligneMeta = meta(langue, entree);

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
      <form className={styles.formAjout} action={actionAjout}>
        <button type="submit" className={styles.ajouter}>
          {traduire(langue, 'fiche.ajouterAuPanier')}
        </button>
      </form>
    ) : null;

  return (
    <div className={styles.carte}>
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
            region={entree.region}
            // Vide, et délibérément : le titre est écrit juste en dessous, et
            // le redire ferait entendre deux fois la même phrase.
            alt=""
            classeImage={styles.couverture}
          />
        ) : (
          <SubstitutCouverture langue={langue} region={entree.region} />
        )}

        {action ? (
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

      {entree.region ? (
        <span className={styles.origine}>
          <span className={styles.puce} aria-hidden="true" />
          {traduire(langue, `regions.${entree.region}`)}
        </span>
      ) : null}

      {/*
       * Le SEUL lien de la carte, et il couvre toute sa surface.
       *
       * `data-etire` dit que sa CIBLE n'est pas sa boîte : le pseudo-élément
       * la porte à la taille de la carte. Sans ce marqueur, une vérification
       * de cible tactile mesure la hauteur du texte — vingt pixels — et
       * signale un défaut là où la zone cliquable fait trois cents pixels.
       */}
      <a
        className={`${styles.carteTitre} ${styles.lienEtire}`}
        href={`/${langue}/contes/${entree.slug}`}
        data-etire="true"
      >
        {entree.titre}
      </a>

      {ligneMeta ? <span className={styles.carteMeta}>{ligneMeta}</span> : null}

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

      {/* L'action vit sur la couverture — voir l'encadré plus haut. */}
    </div>
  );
}
