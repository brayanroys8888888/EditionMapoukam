import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { FicheLivre } from '@/domain/catalog/types';
import { Couverture, SubstitutCouverture } from '@/components/catalogue/couverture';
import { teinteDepuisThemes } from '@/components/motif';
import type { AvisDuLivre } from '@/lib/catalog/avis';
import { SectionAvis } from '@/components/fiche/avis';
import { FicheOnglets, type OngletFiche } from './fiche-onglets';
import { FichePlanches } from './fiche-planches';
import type { Planche } from '@/lib/content/planches';
import { estV3 } from '@/design/version';
import { Revele } from './revele';
import styles from './boutique.module.css';
import accueil from './accueil.module.css';

/**
 * FICHE D'UN CONTE — DIRECTION V2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES ACTIONS SE LISENT, ELLES NE SE DÉDUISENT PAS.                       │
 * │                                                                          │
 * │ `canRead` ouvre la lecture, `canDownload` ouvre le fichier. Ces deux     │
 * │ champs sont rendus par le moteur de droits, et cette page les AFFICHE.  │
 * │                                                                          │
 * │ Le raccourci tentant serait de déduire le téléchargement du motif :      │
 * │ « purchase donc téléchargeable ». Il donne le bon résultat la plupart    │
 * │ du temps — et le mauvais exactement là où la règle métier centrale se    │
 * │ joue, c'est-à-dire sur l'abonné, qui lit sans jamais pouvoir conserver.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE LA V2 AJOUTE : LES QUATRE RÉPONSES, AVANT LE BOUTON.             │
 * │                                                                          │
 * │ Âge conseillé, pagination, formats du fichier, langues. Le site actuel   │
 * │ n'en donne aucune : un parent y voit un prix, un champ de quantité et    │
 * │ un bouton, puis un texte de vente qui ne parle pas du livre. C'est la    │
 * │ raison principale du « pas assez rassurant pour l'achat ».               │
 * │                                                                          │
 * │ Une case ne s'affiche QUE si la donnée existe. Une case vide serait pire │
 * │ que son absence : elle annoncerait une information manquante.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Une case des quatre réponses, omise quand la donnée manque. */
function Reponse({ intitule, valeur }: { intitule: string; valeur: string | null }): ReactNode {
  if (!valeur) return null;

  return (
    <div className={styles.reponse}>
      <span className={styles.reponseIntitule}>{intitule}</span>
      <span className={styles.reponseValeur}>{valeur}</span>
    </div>
  );
}

export function FicheV2({
  langue,
  fiche,
  avis,
  planches,
  connecte = false,
  actionAjout,
  actionAvis,
  actionRetraitAvis,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
  /**
   * Les premières planches, DÉJÀ passées par le moteur de droits.
   *
   * `undefined` sur un conte, et sur un livret dont l'appelant n'a rien le
   * droit de voir. La fiche retombe alors sur la couverture — voir l'encadré
   * de la colonne visuelle.
   */
  planches?: Planche[];
  /**
   * Les avis du titre. `undefined` fait disparaître la section : un écran qui
   * ne les a pas chargés reste cohérent, plutôt que d'annoncer « aucun avis »
   * sur un titre qui en a.
   */
  avis?: AvisDuLivre;
  /** L'appelant a une session. Distinct du droit d'écrire : il faut les deux. */
  connecte?: boolean;
  /**
   * Ajout au panier — une Server Action, jamais un lien.
   *
   * Un `GET` qui modifie un panier est rejoué par le moindre préchargement de
   * navigateur, et par tout robot qui suit les liens de la page.
   */
  actionAjout?: (donnees: FormData) => void | Promise<void>;
  actionAvis?: (donnees: FormData) => void | Promise<void>;
  actionRetraitAvis?: () => void | Promise<void>;
}): ReactNode {
  const { canRead, canDownload } = fiche.acces;
  const achetable = Boolean(fiche.prix) && !canDownload && actionAjout !== undefined;

  /*
   * LE SUPPORT EST UNE ÉTIQUETTE DE RANGEMENT, JAMAIS UN DROIT.
   *
   * `type_document` décide de la MISE EN PAGE — planches couchées contre
   * couverture debout, niveau scolaire contre origine culturelle. Il ne décide
   * de rien d'autre : `access_for_books` ne le lit pas, et ne doit jamais le
   * lire (CLAUDE.md, et `livret-acces-modulaire.test.ts` compare les huit
   * combinaisons des trois leviers sur les deux supports).
   */
  const livret = fiche.type_document === 'livret_pedagogique';

  /**
   * ╔═════════════════════════════════════════════════════════════════════════╗
   * ║ L'ACTION PRINCIPALE, ÉCRITE UNE FOIS ET RENDUE DEUX.                    ║
   * ╚═════════════════════════════════════════════════════════════════════════╝
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ DEUX PLACES, UNE SEULE DÉCISION.                                       │
   * │                                                                        │
   * │ Sur écran large, elle vit dans le bloc d'achat, à côté du prix et des  │
   * │ trois faits de réassurance. Sur téléphone, `04-screens-mobile.md` la   │
   * │ veut dans une barre flottante — parce que le bloc d'achat se retrouve  │
   * │ alors à deux écrans de défilement sous la couverture, et qu'un bouton  │
   * │ d'achat qu'il faut aller chercher n'est pas un bouton d'achat.         │
   * │                                                                        │
   * │ Ce que la barre ne fait PAS, c'est décider : `canRead` et `canDownload`│
   * │ sont lus une fois, ici, et les deux rendus portent le même verdict.    │
   * │ Deux calculs auraient fini par diverger exactement là où la règle      │
   * │ métier se joue — sur l'abonné, qui lit sans pouvoir conserver.         │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  /*
   * `data-achat` — LE CRAN QUI PERMET DE LES DESSINER.
   *
   * `.boutonOcre` vit dans `accueil.module.css` : son nom est haché, et
   * différemment dans chaque module. Une règle écrite depuis
   * `boutique.module.css` ne peut donc pas le viser par sa classe — elle se
   * compile, se charge, et ne s'applique à rien. L'attribut, lui, n'est pas
   * renommé, et il dit ce que la classe ne dit pas : lequel des deux boutons
   * est l'action principale de la carte.
   */
  const actionPrincipale = canRead ? (
    <a className={accueil.boutonOcre} data-achat="principal" href={`/${langue}/lire/${fiche.slug}`}>
      {traduire(langue, 'fiche.lireEnLigne')}
    </a>
  ) : achetable ? (
    <form action={actionAjout}>
      <button type="submit" className={accueil.boutonOcre} data-achat="principal">
        {/*
          LE CABAS N'EST PAS UN ORNEMENT : IL FAIT LA HAUTEUR DU BOUTON.

          Mesuré, le bouton du prototype fait 58 px de haut, le nôtre 56. Les
          deux pixels viennent de là : une icône de 19 px agrandit la boîte de
          ligne d'un texte de 17. C'est le genre d'écart qu'on ne voit pas seul
          et qui se voit contre le bouton d'à côté, plus bas de deux pixels.

          Il ne paraît que sur l'ajout au panier — le prototype n'en met pas
          sur « Lire en ligne », et une icône de cabas sur un bouton de lecture
          promettrait un achat.
        */}
        {estV3() ? (
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.75"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8Z" />
            <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
          </svg>
        ) : null}
        {traduire(langue, 'fiche.ajouterAuPanier')}
      </button>
    </form>
  ) : null;

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE SUR-TITRE D'UN CONTE ANNONCE SON THÈME, PLUS SA PROVENANCE.        │
   * │                                                                        │
   * │ Il portait `origine_culturelle` — un pays, une aire. C'est la même     │
   * │ correction qu'aux migrations 0066 et 0071, appliquée ici à l'étiquette │
   * │ de la fiche : la provenance ne vaut que pour la moitié du catalogue,   │
   * │ un cahier de graphisme n'en a pas, et ce n'est pas ce qu'un parent     │
   * │ cherche. Le thème — « le courage », « l'entraide » — vaut pour les     │
   * │ deux supports et répond à la question qu'on se pose.                   │
   * │                                                                        │
   * │ `origine_culturelle` n'est PAS supprimée pour autant : elle reste      │
   * │ affichée dans les détails de la fiche, où elle est à sa place — un     │
   * │ renseignement qu'on va chercher, non une étiquette qu'on met en avant. │
   * │                                                                        │
   * │ Sans thème, la puce ne s'affiche pas du tout. Retomber sur la          │
   * │ provenance ferait réapparaître, au hasard des titres, ce qu'on vient   │
   * │ précisément d'en retirer.                                              │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * Le sur-titre d'un LIVRET, lui, ne change pas : il annonce son NIVEAU
   * scolaire. Prototype : ligne 519 pour le conte, 1214 pour le livret.
   */
  const surTitre = livret ? fiche.niveau : (fiche.themes[0] ?? null);

  const age =
    fiche.age_min === null
      ? null
      : fiche.age_max === null
        ? traduire(langue, 'catalogue.trancheAgeCourteOuverte').replace(
            '{min}',
            String(fiche.age_min),
          )
        : traduire(langue, 'catalogue.trancheAgeCourte')
            .replace('{min}', String(fiche.age_min))
            .replace('{max}', String(fiche.age_max));

  /*
   * ╔═════════════════════════════════════════════════════════════════════════╗
   * ║ SOUS ORGANIC, LE TITRE VIT DANS LA COLONNE DE DROITE.                   ║
   * ╚═════════════════════════════════════════════════════════════════════════╝
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ CE N'EST PAS UN DÉPLACEMENT DÉCORATIF.                                 │
   * │                                                                        │
   * │ La V2 pose une bannière pleine largeur — sur-titre, titre, auteur —    │
   * │ puis deux colonnes en dessous. Le prototype d'Organic ne met au-dessus │
   * │ des colonnes QUE le fil d'Ariane, et fait commencer le titre à la même │
   * │ ligne de base que la couverture, dans la colonne de droite.            │
   * │                                                                        │
   * │ La différence se mesure : relevé sur `/fr/contes/petit-baobab`, notre  │
   * │ titre tombait à x = 128 quand celui du prototype tombe à x = 665,7.    │
   * │ Cinq cent trente-sept pixels — c'est-à-dire une autre page.            │
   * │                                                                        │
   * │ Ce que ça change à la lecture : le regard entre par l'illustration,    │
   * │ puis descend le long du texte qui la commente. Avec un titre en        │
   * │ bandeau, il entre par une ligne de texte et redescend chercher l'image │
   * │ — sur un produit dont l'argument de vente EST l'image.                 │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * Le balisage est écrit UNE fois et rendu à l'une des deux places. Le
   * recopier aurait donné deux titres à garder d'accord, dont un seul est
   * visible à la fois — c'est-à-dire une divergence qu'aucun test ne verrait.
   */
  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE FIL D'ARIANE N'EST PAS UN SUR-TITRE, ET IL PORTAIT SON DESSIN.      │
   * │                                                                        │
   * │ Il était rendu avec `.oeil` — capitales terre cuite, traque de 0,12em, │
   * │ 13 px gras. C'est le dessin d'un SUR-TITRE de section, et le relevé le │
   * │ disait en sept propriétés : `textTransform`, `letterSpacing`, `color`, │
   * │ `fontSize`, `fontWeight`, `lineHeight`, `gap`.                         │
   * │                                                                        │
   * │ Le prototype en fait une ligne de service : 12,5 px, encre douce, des  │
   * │ barres obliques espacées de 9 px, et le seul segment courant en terre  │
   * │ cuite assombrie. `.filAriane` existait déjà — le rayon s'en sert — et  │
   * │ c'est la même ligne au même endroit : la recopier aurait donné deux    │
   * │ fils d'Ariane à garder d'accord.                                       │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * Le second maillon suit le SUPPORT : un livret vient du rayon des livrets,
   * pas de la boutique des contes. Le remonter au catalogue mènerait le
   * lecteur là d'où il n'est pas venu.
   */
  const rayon = livret
    ? { href: `/${langue}/livrets`, libelle: traduire(langue, 'livrets.lien') }
    : { href: `/${langue}/catalogue`, libelle: traduire(langue, 'navigation.catalogue') };

  const filAriane = estV3() ? (
    <nav className={styles.filAriane} aria-label={traduire(langue, 'v2.filAriane')}>
      <a href={`/${langue}`}>{traduire(langue, 'navigation.onglets.accueil')}</a>
      <span aria-hidden="true">/</span>
      <a href={rayon.href}>{rayon.libelle}</a>
      {fiche.themes[0] !== undefined ? (
        <>
          <span aria-hidden="true">/</span>
          <a
            className={styles.filArianeCourant}
            href={`/${langue}/catalogue?themes=${encodeURIComponent(fiche.themes[0])}`}
          >
            {fiche.themes[0]}
          </a>
        </>
      ) : null}
    </nav>
  ) : (
    <nav className={styles.oeil} aria-label={traduire(langue, 'catalogue.titre')}>
      <a href={`/${langue}/catalogue`} style={{ color: 'inherit' }}>
        {traduire(langue, 'navigation.catalogue')}
      </a>
      {fiche.themes[0] !== undefined ? (
        <>
          {' · '}
          <a
            href={`/${langue}/catalogue?themes=${encodeURIComponent(fiche.themes[0])}`}
            style={{ color: 'inherit' }}
          >
            {fiche.themes[0]}
          </a>
        </>
      ) : null}
    </nav>
  );

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ SOUS ORGANIC, L'AUTEUR N'EST PAS SOUS LE TITRE — IL EST DANS          │
   * │ « DÉTAILS ».                                                           │
   * │                                                                        │
   * │ Le prototype met sous le titre UNE ligne de 19 px, et c'est l'accroche.│
   * │ Nous en mettions deux — l'auteur, puis le résumé — ce qui repoussait   │
   * │ l'accroche de 54 px et, avec elle, les pastilles, la carte d'achat et  │
   * │ le bas de la colonne. Mesuré sur « L'oiseau de feu ».                  │
   * │                                                                        │
   * │ L'auteur n'est pas SUPPRIMÉ : il devient une ligne de l'onglet         │
   * │ « Détails », avec la tradition, le thème et les formats. C'est la      │
   * │ place que le prototype donne à ce genre de fait — un renseignement     │
   * │ qu'on va chercher, pas un argument qui vend. Le retirer sans le        │
   * │ reloger aurait été une perte d'information déguisée en réglage.        │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const identite = (
    <>
      <h1 className={styles.banniereTitre}>{fiche.titre}</h1>
      {estV3() ? null : (
        <p className={styles.banniereTexte}>
          {traduire(langue, 'catalogue.parAuteur').replace('{auteur}', fiche.auteur)}
        </p>
      )}
    </>
  );

  /*
   * ╔═════════════════════════════════════════════════════════════════════════╗
   * ║ LE BAS DE FICHE — TROIS ONGLETS, ET RIEN QUI SOIT INVENTÉ.              ║
   * ╚═════════════════════════════════════════════════════════════════════════╝
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LA V2 EMPILAIT QUATRE SECTIONS ; LE PROTOTYPE EN RANGE TROIS.          │
   * │                                                                        │
   * │ « À propos de ce titre », « D'où vient ce conte », « Les avis » et     │
   * │ « Dans la même tradition » se suivaient sur deux écrans de             │
   * │ défilement. Le prototype met les trois premières sous des onglets et   │
   * │ garde la quatrième en pied de page — c'est la seule qui invite à       │
   * │ PARTIR, et elle n'a rien à faire derrière un onglet qu'on n'ouvrira    │
   * │ pas.                                                                   │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UN ONGLET VIDE NE S'AFFICHE PAS — et c'est la même règle que les       │
   * │ pastilles du haut : une case vide annonce une information manquante.   │
   * │                                                                        │
   * │ Le prototype remplit son panneau « Extrait » avec un texte fabriqué à  │
   * │ la volée, et sa colonne « Ce que l'enfant en retire » avec trois       │
   * │ phrases écrites pour la démonstration. Nous n'avons ni l'un ni         │
   * │ l'autre à inventer : l'extrait est la DESCRIPTION saisie par           │
   * │ l'éditeur (migration 0070), et les apports sont ses OBJECTIFS. Là où   │
   * │ l'éditeur n'a rien écrit, il n'y a rien à montrer.                     │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const paragraphes = (fiche.description ?? '')
    .split(/\n\s*\n/)
    .map((bloc) => bloc.trim())
    .filter((bloc) => bloc.length > 0);

  const panneauExtrait =
    paragraphes.length === 0 ? null : (
      <div className={styles.extrait}>
        <div className={styles.extraitTexte}>
          {paragraphes.map((bloc, rang) =>
            rang === 0 ? (
              /*
               * LA LETTRINE N'EST PAS MASQUÉE AUX LECTEURS D'ÉCRAN.
               *
               * Elle est le PREMIER CARACTÈRE du texte, sorti dans un `span`
               * flotté. `aria-hidden` y ferait lire « l était une fois » : la
               * lettre disparaîtrait du mot, pas seulement de l'image. Un
               * flottant ne change ni l'ordre du document ni la lecture.
               */
              <p key={rang} className={styles.extraitPremier}>
                <span className={styles.lettrine}>{bloc.slice(0, 1)}</span>
                {bloc.slice(1)}
              </p>
            ) : (
              <p key={rang} className={styles.extraitSuite}>
                {bloc}
              </p>
            ),
          )}

          <a className={styles.continuer} href={`/${langue}/lire/${fiche.slug}`}>
            {traduire(langue, 'v2.ficheContinuerLecture')}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 12h13m-5-6 6 6-6 6" />
            </svg>
          </a>
        </div>

        {fiche.objectifs.length > 0 ? (
          <aside className={styles.apports}>
            <p className={styles.apportsTitre}>{traduire(langue, 'v2.ficheApports')}</p>
            {fiche.objectifs.map((objectif, rang) => (
              <p key={rang} className={styles.apport}>
                <span className={styles.apportPuce} aria-hidden="true" />
                {objectif}
              </p>
            ))}
          </aside>
        ) : null}
      </div>
    );

  /*
   * L'AUTEUR EST ICI, ET C'EST SA PLACE — voir l'encadré d'`identite`. Il a
   * quitté le dessous du titre, où il repoussait l'accroche de 54 px, pour la
   * liste où l'on va chercher ce genre de fait.
   */
  const lignesDetail: { intitule: string; valeur: string }[] = [
    { intitule: traduire(langue, 'fiche.origine'), valeur: fiche.origine_culturelle ?? '' },
    { intitule: traduire(langue, 'fiche.themes'), valeur: fiche.themes.join(' · ') },
    { intitule: traduire(langue, 'v2.ficheAuteur'), valeur: fiche.auteur },
    { intitule: traduire(langue, 'fiche.illustrateur'), valeur: fiche.illustrateur ?? '' },
    { intitule: traduire(langue, 'catalogue.niveaux'), valeur: fiche.niveau ?? '' },
    { intitule: traduire(langue, 'v2.ficheAge'), valeur: age ?? '' },
    {
      intitule: traduire(langue, 'v2.fichePages'),
      valeur: fiche.nb_pages === null ? '' : String(fiche.nb_pages),
    },
    {
      intitule: traduire(langue, 'v2.ficheFormats'),
      // Même règle qu'en haut de fiche : les formats ne sont promis que sur un
      // titre qui s'achète. L'abonnement n'ouvre jamais un fichier.
      valeur: fiche.disponible_achat ? traduire(langue, 'v2.ficheFormatsValeur') : '',
    },
    {
      intitule: traduire(langue, 'v2.ficheLangues'),
      valeur: fiche.langues.map((code) => code.toUpperCase()).join(' · '),
    },
  ].filter((ligne) => ligne.valeur.length > 0);

  const panneauDetails =
    lignesDetail.length === 0 ? null : (
      <div className={styles.details}>
        {lignesDetail.map((ligne) => (
          <div key={ligne.intitule} className={styles.detail}>
            <span className={styles.detailIntitule}>{ligne.intitule}</span>
            <span className={styles.detailValeur}>{ligne.valeur}</span>
          </div>
        ))}
      </div>
    );

  const panneauAvis = avis ? (
    <SectionAvis
      langue={langue}
      fiche={fiche}
      avis={avis}
      connecte={connecte}
      {...(actionAvis ? { actionDepot: actionAvis } : {})}
      {...(actionRetraitAvis ? { actionRetrait: actionRetraitAvis } : {})}
    />
  ) : null;

  const ongletsPossibles: OngletFiche[] = [
    { cle: 'extrait', libelle: traduire(langue, 'v2.ficheOngletExtrait'), panneau: panneauExtrait },
    { cle: 'details', libelle: traduire(langue, 'v2.ficheOngletDetails'), panneau: panneauDetails },
    { cle: 'avis', libelle: traduire(langue, 'v2.ficheOngletAvis'), panneau: panneauAvis },
  ];

  const onglets = ongletsPossibles.filter((onglet) => onglet.panneau !== null);

  return (
    <>
      {/*
        ╔═══════════════════════════════════════════════════════════════════╗
        ║ LE HAUT DE LA FICHE EST UN SEUL BANDEAU, ET NON DEUX SURFACES.    ║
        ╚═══════════════════════════════════════════════════════════════════╝

        ┌───────────────────────────────────────────────────────────────────┐
        │ CE QUE LE RELEVÉ A MONTRÉ.                                        │
        │                                                                   │
        │ Le prototype pose UNE section crème qui porte à la fois le fil    │
        │ fois le fil d'Ariane ET les deux colonnes, et qui s'arrête sous   │
        │ elles. Nous n'avions de crème que sous le fil : les sept cents    │
        │ pixels de la couverture, du titre et de la carte d'achat          │
        │ tombaient sur le fond de page, d'un ton plus clair.                │
        │                                                                   │
        │ Deux crèmes voisines ne se lisent pas comme une erreur — elles se │
        │ lisent comme une intention. C'est ce qui a fait tenir le défaut :  │
        │ la page n'avait l'air cassée nulle part, elle avait seulement     │
        │ perdu le bloc qui tient la couverture et le prix ensemble.        │
        └───────────────────────────────────────────────────────────────────┘

        D'où ce conteneur. Sous la V1 et la V2 il ne dessine RIEN : la
        bannière garde son aplat, et `.hautCorps` reprend exactement les
        cotes que `.page` donnait à la grille. Sous Organic il porte le
        bandeau, et c'est lui qui s'arrête sous les colonnes.
      */}
      <div className={styles.hautFiche} data-fiche data-support={fiche.type_document}>
        <div className={styles.banniere} data-banniere data-fiche>
          {/*
            LE THÈME À LA PLACE DE LA TRADITION — migration 0071.

            Le fil est le SEUL contenu de ce bandeau sous Organic. Sous la V2,
            il y est rejoint par le titre et l'auteur — voir `identite`.
          */}
          <div className={styles.banniereInterieur}>
            {filAriane}
            {estV3() ? null : identite}
          </div>
        </div>

        <div className={styles.hautCorps}>
          <div className={styles.fiche} data-support={fiche.type_document}>
            {/* ── Colonne visuelle ────────────────────────────────────────── */}
            {/*
              ┌──────────────────────────────────────────────────────────────┐
              │ UN LIVRET MONTRE SES PLANCHES ; UN CONTE MONTRE SA           │
              │ COUVERTURE.                                                  │
              │                                                              │
              │ Ce n'est pas la même promesse. La couverture d'un conte dit  │
              │ le monde qu'on achète — une image composée pour être         │
              │ regardée entière. Un livret s'achète sur ce qu'il fait       │
              │ FAIRE : ce qu'on veut voir, c'est une fiche d'activité, sa   │
              │ consigne et son tracé. Le prototype couche donc la planche,  │
              │ l'affiche en `contain`, et pose une bande de vignettes.      │
              │                                                              │
              │ Sans planche — un livret déposé sans pages, ou un visiteur   │
              │ dont l'extrait est vide — on retombe sur la couverture : un  │
              │ cadre vide serait pire que l'image approchée.                │
              └──────────────────────────────────────────────────────────────┘
            */}
            {livret && estV3() && planches !== undefined && planches.length > 0 ? (
              <FichePlanches langue={langue} planches={planches} titre={fiche.titre} />
            ) : (
            <div className={styles.ficheVisuel}>
              {fiche.couverture ? (
                // La taille « fiche » (800 px) est ICI légitime : une seule
                // image par page, et c'est l'argument de vente de l'écran.
                <Couverture
                  langue={langue}
                  url={fiche.couverture.fiche}
                  largeur={800}
                  hauteur={1200}
                  /*
                   * 478 px sous Organic, 360 sous la V2 — et ce n'est pas un
                   * réglage de confort. La V2 plafonnait la couverture à
                   * 360 px au milieu d'un cadre ; Organic lui donne toute sa
                   * colonne, mesurée à 477,7 px sur une fenêtre de 1440.
                   * Laisser `sizes` à 360 aurait fait choisir au navigateur
                   * une image trop petite pour la place qu'elle occupe,
                   * c'est-à-dire une couverture floue sur l'écran dont elle
                   * est l'argument de vente.
                   */
                  tailles={
                    estV3() ? '(max-width: 820px) 88vw, 478px' : '(max-width: 820px) 88vw, 360px'
                  }
                  teinte={teinteDepuisThemes(fiche.themes)}
                  eager={true}
                  // Le titre est en `h1` juste à côté : le répéter ferait
                  // entendre deux fois la même phrase.
                  alt=""
                  classeImage={styles.ficheCouverture}
                />
              ) : (
                <SubstitutCouverture langue={langue} teinte={teinteDepuisThemes(fiche.themes)} />
              )}

              {/*
                ── « Feuilleter les premières pages » ──────────────────────

                Prototype ligne 511 : une pastille sous la couverture, dans la
                colonne visuelle. Elle mène là où mènent déjà « Lire en ligne »
                et « Lire l'extrait » de la carte d'achat — et ce n'est pas une
                redondance, c'est la place où le geste se présente.

                Le lecteur qui regarde l'illustration a la main sur l'image ;
                lui demander de traverser la colonne de droite pour l'ouvrir,
                c'est lui demander de changer d'avis en route. Les trois
                libellés diffèrent, donc les trois s'annoncent distinctement.

                Elle n'existe que sous Organic : la V2 n'a pas cette pastille,
                et l'ajouter là-bas ferait une troisième commande sans dessin.
              */}
              {estV3() ? (
                <a className={styles.feuilleter} href={`/${langue}/lire/${fiche.slug}`}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--action)"
                    strokeWidth="2.75"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4Z" />
                    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6Z" />
                  </svg>
                  {traduire(langue, 'v2.ficheFeuilleter')}
                </a>
              ) : null}
            </div>
            )}

          {/* ── Colonne d'achat ─────────────────────────────────────────── */}
          <div>
            {/*
              ┌──────────────────────────────────────────────────────────────┐
              │ L'ORIGINE ÉDITORIALE, SANS REPLI — ET SOUS ORGANIC, EN       │
              │ SUR-TITRE.                                                    │
              │                                                              │
              │ Cette ligne se repliait sur le libellé de la région quand    │
              │ `origine_culturelle` manquait ; la région ayant quitté le    │
              │ catalogue public, il n'y a plus de repli. Y mettre le thème  │
              │ ferait dire « Ruse » à une ligne qui annonce une provenance. │
              │                                                              │
              │ Le prototype la pose AU-DESSUS du titre, en capitales sauge  │
              │ espacées, précédée d'un point : c'est son sur-titre, et il y │
              │ écrit « thème · origine ». Le thème est déjà un lien dans le │
              │ fil d'Ariane, deux lignes plus haut ; le répéter ici en      │
              │ ferait le seul mot de l'écran écrit trois fois. La ligne ne  │
              │ porte donc que l'origine — ce qu'elle a toujours annoncé.    │
              └──────────────────────────────────────────────────────────────┘
            */}
            {/*
              Le sur-titre d'un LIVRET annonce son NIVEAU scolaire, pas une
              provenance : une fiche de graphisme ne vient pas d'une tradition,
              elle s'adresse à une classe. Prototype ligne 1214.
            */}
            {surTitre ? (
              <p className={styles.ficheOrigine}>
                <span className={styles.fichePuce} aria-hidden="true" />
                {surTitre}
              </p>
            ) : null}

            {/* Sous Organic, le titre commence ICI — voir l'encadré. */}
            {estV3() ? identite : null}

            {fiche.resume ? <p className={styles.ficheResume}>{fiche.resume}</p> : null}

            {/* ── Les quatre réponses ───────────────────────────────────── */}
            <div className={styles.reponses}>
              <Reponse intitule={traduire(langue, 'v2.ficheAge')} valeur={age} />
              <Reponse
                intitule={traduire(langue, 'v2.fichePages')}
                valeur={fiche.nb_pages === null ? null : String(fiche.nb_pages)}
              />
              {/*
               * Les formats ne sont annoncés QUE si le titre est achetable.
               * Promettre « PDF · EPUB » sur un conte que l'abonnement seul
               * ouvre serait exactement la confusion que tout le produit
               * s'attache à éviter.
               */}
              <Reponse
                intitule={traduire(langue, 'v2.ficheFormats')}
                valeur={
                  fiche.disponible_achat ? traduire(langue, 'v2.ficheFormatsValeur') : null
                }
              />
              <Reponse
                intitule={traduire(langue, 'v2.ficheLangues')}
                valeur={
                  fiche.langues.length > 0
                    ? fiche.langues.map((code) => code.toUpperCase()).join(' · ')
                    : null
                }
              />
            </div>

            {/* ── Bloc d'achat ──────────────────────────────────────────── */}
            <section className={styles.achat} aria-label={traduire(langue, 'acces.acheter')}>
              {canDownload ? (
                <p className={styles.etiquette}>
                  <span className={styles.fichePuce} aria-hidden="true" />
                  {traduire(langue, 'fiche.dansVotreBibliotheque')}
                </p>
              ) : canRead && !fiche.gratuit ? (
                <p className={styles.etiquette}>
                  <span className={styles.fichePuce} aria-hidden="true" />
                  {traduire(langue, 'fiche.inclusDansAbonnement')}
                </p>
              ) : null}

              {fiche.prix && !canDownload ? (
                <p className={styles.achatPrix}>
                  <span className={styles.prixMontant}>{fiche.prix.affichage}</span>
                  <span className={styles.prixMention}>
                    {traduire(langue, livret && estV3() ? 'v2.livretPrixNote' : 'accueil.achatUnite')}
                  </span>
                </p>
              ) : null}

              <div className={styles.achatActions}>
                {actionPrincipale}

                {/*
                 * Le second bouton n'est JAMAIS ocre : deux boutons d'accent
                 * côte à côte, c'est deux actions principales, c'est-à-dire
                 * aucune.
                 */}
                {canDownload ? (
                  <a
                    className={accueil.boutonContour}
                    data-achat="second"
                    href={`/${langue}/compte/bibliotheque`}
                  >
                    {traduire(langue, 'fiche.telecharger')}
                  </a>
                ) : canRead && achetable ? (
                  <form action={actionAjout}>
                    <button type="submit" className={accueil.boutonContour} data-achat="second">
                      {traduire(langue, 'fiche.ajouterAuPanier')}
                    </button>
                  </form>
                ) : canRead ? (
                  /*
                   * ┌────────────────────────────────────────────────────────┐
                   * │ RIEN — ET C'EST LE SEUL CAS OÙ LA CARTE N'A QU'UN      │
                   * │ BOUTON.                                                │
                   * │                                                        │
                   * │ Qui peut déjà lire et ne peut pas acheter — un titre    │
                   * │ offert, un abonné sur un titre hors vente — voyait      │
                   * │ « Lire en ligne » puis « Lire l'extrait » : deux        │
                   * │ commandes menant au MÊME écran, dont la seconde         │
                   * │ promet moins que la première.                          │
                   * │                                                        │
                   * │ Le défaut ne se voyait pas tant que les quatre livrets  │
                   * │ du catalogue étaient les seuls titres dans ce cas.      │
                   * └────────────────────────────────────────────────────────┘
                   */
                  null
                ) : (
                  <a
                    className={accueil.boutonContour}
                    data-achat="second"
                    href={`/${langue}/lire/${fiche.slug}`}
                  >
                    {traduire(langue, 'fiche.lireExtrait')}
                  </a>
                )}
              </div>

              {/*
                L'EXPLICATION DE CE QUI MANQUE — la phrase la plus importante
                de l'écran. Elle ne paraît que pour qui lit sans pouvoir
                conserver. Sans elle, l'absence du bouton de téléchargement se
                lit comme une panne, et le client écrit au support au lieu
                d'acheter.
              */}
              {canRead && !canDownload && fiche.disponible_achat ? (
                <p className={styles.achatNote}>
                  {traduire(langue, 'fiche.telechargementParAchat')}
                </p>
              ) : null}

              {fiche.achat_hors_zone ? (
                <p className={styles.achatNote}>{traduire(langue, 'acces.horsZone')}</p>
              ) : null}

              {/*
                Trois faits, pas trois slogans.

                La coche est un GLYPHE sous la V2 et un TRACÉ sous Organic. Ce
                n'est pas de la coquetterie : le relevé compare `stroke`, et
                une coche typographique n'a pas de tracé — elle hérite la
                couleur de son panneau, ce qui rend deux valeurs identiques de
                part et d'autre sur une icône dont la teinte réelle diverge.
                Le prototype dessine une coche sauge de 16 px, épaisseur 3.
              */}
              {/*
                ┌────────────────────────────────────────────────────────────┐
                │ UN LIVRET LISTE SES CARACTÉRISTIQUES ; UN CONTE DONNE SES  │
                │ TROIS PREUVES.                                             │
                │                                                            │
                │ Les trois preuves parlent de l'ACHAT — paiement vérifié,   │
                │ fichier conservé, extrait lisible sans compte. Elles       │
                │ valent pour les deux supports, et le prototype ne les      │
                │ répète pas sur le livret : à cette place, il met ce qu'un  │
                │ enseignant vérifie avant d'imprimer trente exemplaires —   │
                │ le niveau, l'âge, le nombre de pages, le format.           │
                │                                                            │
                │ C'est la même carte, avec le pied que son lecteur attend.  │
                └────────────────────────────────────────────────────────────┘
              */}
              {livret && estV3() ? (
                <dl className={styles.livretSpecs}>
                  {[
                    { cle: traduire(langue, 'catalogue.niveaux'), valeur: fiche.niveau },
                    { cle: traduire(langue, 'v2.ficheAge'), valeur: age },
                    {
                      cle: traduire(langue, 'v2.fichePages'),
                      valeur: fiche.nb_pages === null ? null : String(fiche.nb_pages),
                    },
                    {
                      cle: traduire(langue, 'v2.livretFormat'),
                      valeur: fiche.disponible_achat
                        ? traduire(langue, 'v2.livretFormatValeur')
                        : null,
                    },
                  ]
                    .filter((ligne) => ligne.valeur !== null && ligne.valeur !== '')
                    .map((ligne) => (
                      <div key={ligne.cle} className={styles.livretSpec}>
                        <dt className={styles.livretSpecCle}>{ligne.cle}</dt>
                        <dd className={styles.livretSpecValeur}>{ligne.valeur}</dd>
                      </div>
                    ))}
                </dl>
              ) : (
              <div className={styles.confiance}>
                {(['1', '2', '3'] as const).map((rang) => (
                  <p key={rang} className={styles.confianceLigne}>
                    {estV3() ? (
                      <svg
                        className={styles.confianceCoche}
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        /*
                         * `--second` — LE SAUGE MÊME DU PROTOTYPE, ET NON SON
                         * ASSOMBRISSEMENT.
                         *
                         * Le sur-titre voisin, lui, prend `--second-encre` :
                         * c'est du TEXTE de 11,5 px, et le sauge n'y vaut que
                         * 2,94:1 quand le §5.3 en demande 4,5. Une coche n'est
                         * pas du texte — le seuil des éléments graphiques est
                         * de 3:1, et le sauge y monte à 3,41:1.
                         *
                         * Deux exigences différentes, donc deux jetons : les
                         * confondre aurait assombri une icône sans raison, ou
                         * éclairci un texte qui ne peut pas l'être.
                         */
                        stroke="var(--second)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="m5 13 4.5 4.5L19 7" />
                      </svg>
                    ) : (
                      <span className={styles.confianceCoche} aria-hidden="true">
                        ✓
                      </span>
                    )}
                    {traduire(langue, `v2.ficheConfiance${rang}` as never)}
                  </p>
                ))}
              </div>
              )}
            </section>
          </div>
          </div>
        </div>
      </div>

      <div className={styles.page} data-fiche>
        {/*
          Sous Organic, les trois premières sections passent sous des onglets ;
          « Dans la même tradition » reste en pied de page. Sous la V1 et la V2
          elles s'empilent comme avant — c'est la direction validée, et la
          réorganiser sans y avoir été invité serait décider à sa place.
        */}
        {/*
          ┌────────────────────────────────────────────────────────────────┐
          │ UN LIVRET NE RANGE RIEN SOUS DES ONGLETS.                      │
          │                                                                │
          │ Le prototype déplie tout à plat : des panneaux côte à côte,    │
          │ lisibles d'un regard. C'est cohérent avec l'objet — on choisit  │
          │ un conte sur une histoire, qu'on découvre en lisant ; on        │
          │ choisit un livret sur une LISTE, qu'on parcourt. Cacher les     │
          │ objectifs derrière un onglet, c'est cacher l'argument.          │
          │                                                                │
          │ Les AVIS restent, eux, et le prototype ne les dessine pas ici : │
          │ un livret s'évalue comme un conte — `book_reviews` ne lit pas   │
          │ `type_document`, et les retirer d'un support serait inventer    │
          │ une règle que la base ne porte pas.                             │
          └────────────────────────────────────────────────────────────────┘
        */}
        {estV3() && livret ? (
          <>
            {fiche.objectifs.length > 0 ? (
              <section className={styles.panneaux}>
                <div className={styles.panneau}>
                  <p className={styles.panneauTitre}>
                    {traduire(langue, 'v2.ficheObjectifs')}
                  </p>
                  {fiche.objectifs.map((objectif, rang) => (
                    <p key={rang} className={styles.panneauLigne}>
                      <svg
                        className={styles.panneauCoche}
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--action)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="m5 13 4.5 4.5L19 7" />
                      </svg>
                      {objectif}
                    </p>
                  ))}
                </div>
              </section>
            ) : null}
            {panneauAvis}
          </>
        ) : null}

        {estV3() && !livret ? <FicheOnglets langue={langue} onglets={onglets} /> : null}

        {estV3() ? null : (
          <>
        {/*
          ── À propos de ce titre ────────────────────────────────────────

          La DESCRIPTION LONGUE, colonne créée par la migration 0070. Elle ne
          remplace pas le résumé : le résumé est la phrase d'accroche des
          cartes et du référencement, celle-ci est le texte qu'on lit avant
          d'acheter. Le bloc disparaît quand elle est vide — un titre déposé
          avant la migration n'en a pas, et une section vide se lit comme un
          défaut.

          Les paragraphes sont découpés sur les lignes vides, comme les saisit
          l'éditeur, et rendus en TEXTE PUR : la description est de la saisie
          libre, et elle n'est jamais interprétée comme du balisage.
        */}
        {fiche.description ? (
          <Revele>
            <section className={styles.bloc}>
              <h2 className={styles.blocTitre}>{traduire(langue, 'fiche.descriptionTitre')}</h2>
              {fiche.description
                .split(/\n\s*\n/)
                .map((bloc) => bloc.trim())
                .filter((bloc) => bloc.length > 0)
                .map((bloc, rang) => (
                  <p key={rang} className={styles.blocTexte}>
                    {bloc}
                  </p>
                ))}
            </section>
          </Revele>
        ) : null}

        {/* ── D'où vient ce conte ─────────────────────────────────────── */}
        {fiche.origine_culturelle ? (
          <Revele>
            <section className={styles.bloc}>
              <h2 className={styles.blocTitre}>{traduire(langue, 'fiche.provenance')}</h2>
              <p className={styles.blocTexte}>{fiche.origine_culturelle}</p>
            </section>
          </Revele>
        ) : null}

        {/*
          ── Les avis des lecteurs ───────────────────────────────────────

          Le MÊME composant qu'en V1, et non une seconde copie : la section ne
          lit que des jetons de couleur, dont la valeur change sous elle selon
          `data-design`. Deux copies auraient divergé au premier ajout de
          champ.
        */}
        {panneauAvis}
          </>
        )}

        {/* ── Dans la même tradition ──────────────────────────────────── */}
        {fiche.suggestions.length > 0 ? (
          <section className={styles.bloc}>
            {/*
              « Dans la même tradition » ne veut rien dire d'un livret : une
              fiche de graphisme ne vient d'aucune tradition. Le prototype
              écrit « D'autres livrets », et c'est ce que la section propose.
            */}
            <h2 className={styles.blocTitre}>
              {traduire(langue, livret ? 'v2.livretAutres' : 'v2.ficheSimilaires')}
            </h2>

            <ul className={styles.similaires}>
              {fiche.suggestions.map((suggestion, rang) => (
                <li key={suggestion.id}>
                  <Revele rang={rang}>
                    <a
                      className={styles.reponse}
                      href={`/${langue}/contes/${suggestion.slug}`}
                      style={{ display: 'block' }}
                    >
                      {/*
                        `couverture.vignette` — une URL ABSOLUE. Le champ
                        `couverture_url` voisin est un chemin de stockage, et
                        le poser ici rendrait 404 sans que la page le montre.
                      */}
                      {suggestion.couverture ? (
                        <img
                          src={suggestion.couverture.vignette}
                          width={320}
                          height={480}
                          loading="lazy"
                          decoding="async"
                          alt=""
                          style={{
                            width: '100%',
                            height: 'auto',
                            aspectRatio: '2 / 3',
                            objectFit: 'cover',
                            borderRadius: 'var(--rayon-image)',
                            display: 'block',
                            marginBottom: '12px',
                          }}
                        />
                      ) : null}
                      <span className={styles.reponseValeur}>{suggestion.titre}</span>
                    </a>
                  </Revele>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/*
        ── La barre d'achat flottante ─────────────────────────────────────

        ┌──────────────────────────────────────────────────────────────────┐
        │ RENDUE TOUJOURS, DESSINÉE PAR LE SEUL ÉCRAN ÉTROIT.              │
        │                                                                  │
        │ Aucun composant ne demande ici quelle direction est servie : la  │
        │ barre est dans le document, et c'est la feuille qui décide si    │
        │ elle se voit — sous 860 px, et sous la V3 seule. C'est la même   │
        │ mécanique que les deux chromes, rendus tous les deux et          │
        │ départagés par une requête média.                                │
        │                                                                  │
        │ La conséquence tient en une ligne : ni reniflage d'agent, ni     │
        │ saut de mise en page, et redimensionner la fenêtre MARCHE.       │
        └──────────────────────────────────────────────────────────────────┘

        Quand elle paraît, le bloc d'achat perd son bouton — sinon la page
        porterait deux fois la même commande, et un lecteur d'écran les
        annoncerait toutes les deux sans pouvoir dire laquelle agit.
      */}
      {actionPrincipale ? (
        <>
          <div className={styles.reserveAchat} aria-hidden="true" />

          <div className={styles.barreAchat}>
            {fiche.prix && !canDownload ? (
              <span className={styles.barreAchatPrix}>{fiche.prix.affichage}</span>
            ) : (
              <span className={styles.barreAchatMention}>
                {traduire(langue, canDownload ? 'acces.purchase' : 'acces.inclusAbonnement')}
              </span>
            )}

            <div className={styles.barreAchatAction}>{actionPrincipale}</div>
          </div>
        </>
      ) : null}
    </>
  );
}
