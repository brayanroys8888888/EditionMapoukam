import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import {
  LOGO_ASSOCIATION,
  lirePresentationAssociation,
  type SoutienAssociation,
} from '@/content/association';
import type { ContenuAssociatif } from '@/lib/association/service';

import { imageDuContenu } from './carte-association';
import { Revele } from './revele';
import styles from './association-v3.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ L'ASSOCIATION DAVE — L'ÉCRAN ORGANIC.                                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Prototype, lignes 674 à 784. Les mesures sont dans la feuille voisine ; ce
 * fichier ne porte que la structure et les données.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE BANDEAU DISPARAÎT, ET LE HÉROS PREND SA PLACE.                       │
 * │                                                                          │
 * │ La V2 ouvrait sur le bandeau partagé de la boutique, puis alignait le    │
 * │ logo, la devise, trois sections de prose, la vidéo, un mur d'adhésion    │
 * │ et enfin les contenus. Sept blocs empilés, tous de même poids.           │
 * │                                                                          │
 * │ Le prototype hiérarchise : ce qu'est l'association (héros), ce qu'elle   │
 * │ fait (la bande sombre), ce qu'on obtient en adhérant, ce qu'on peut      │
 * │ faire sans adhérer, puis ses récits. La prose ne change pas ; c'est son  │
 * │ ORDRE et son poids qui changent.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CADENAS EST LU, JAMAIS DÉDUIT.                                       │
 * │                                                                          │
 * │ `peutLire` vient d'`access_for_association`, qui appelle                 │
 * │ `abonnement_ouvre_droit(user, 'association')`. Cet écran ne compare      │
 * │ jamais `acces` à l'état d'un abonnement : il afficherait alors une       │
 * │ seconde règle d'accès, et c'est exactement ce que le test                │
 * │ `frontend-architecture` interdit.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE LA VIDÉO DEVIENT.                                                │
 * │                                                                          │
 * │ Le prototype n'en a pas, et l'écran non plus désormais : elle vivait     │
 * │ au milieu de la prose, où elle coupait le fil, et son AFFICHE est déjà   │
 * │ le visuel « Ensemble, nous apprenons mieux ». Le collage du héros porte  │
 * │ maintenant deux photographies de terrain, ce qui dit la même chose sans  │
 * │ demander qu'on appuie sur lecture. Le fichier reste en place et          │
 * │ `VIDEO_PRESENTATION` avec lui : la V2 le sert toujours.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** L'ancre des contenus — le second bouton du héros y descend. */
const ANCRE_ARTICLES = 'articles';

/**
 * LES TRACÉS DES TROIS PICTOGRAMMES DE SOUTIEN.
 *
 * Ils vivent ici et non dans `src/content/association.ts` : un tracé SVG est
 * du dessin, pas du texte d'association. La clé fait le lien, et une clé sans
 * tracé n'affiche rien plutôt que de casser la carte.
 */
const TRACES_SOUTIEN: Record<SoutienAssociation['cle'], readonly string[]> = {
  partager: ['M4 12v6.5a1.5 1.5 0 0 0 1.5 1.5H10', 'M8.5 12 15 5.5a3 3 0 0 1 4.2 4.2L12.7 16'],
  ateliers: ['M8 3.5v3M16 3.5v3', 'M4.5 8h15v11a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19Z'],
  campagnes: ['M12 20s-7-4.3-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.7 12 20 12 20Z'],
};

/** Le pictogramme du dossier : 20 px, trait de 2,75, sans remplissage. */
function Pictogramme({ cle }: { cle: SoutienAssociation['cle'] }): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {TRACES_SOUTIEN[cle].map((trace) => (
        <path key={trace} d={trace} />
      ))}
    </svg>
  );
}

/**
 * La ligne de méta d'un contenu : sa date, puis sa durée de lecture.
 *
 * Le prototype l'écrit d'un seul tenant — « 1 septembre 2026 · 3 min de
 * lecture ». Elle est rendue ici en une chaîne plutôt qu'en éléments, parce
 * que ni la date ni la durée ne portent de style propre.
 */
function meta(langue: LangueInterface, contenu: ContenuAssociatif): string {
  const morceaux: string[] = [];

  if (contenu.publieLe) {
    morceaux.push(
      new Date(contenu.publieLe).toLocaleDateString(langue, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        // `UTC` explicite : sans lui, une date à minuit recule d'un jour pour
        // tout lecteur à l'ouest de Greenwich.
        timeZone: 'UTC',
      }),
    );
  }

  if (contenu.minutes) {
    morceaux.push(traduire(langue, 'v2.assoMinutes').replace('{minutes}', String(contenu.minutes)));
  }

  return morceaux.join(' · ');
}

/**
 * LA PASTILLE DE RÉSERVE, ET POURQUOI ELLE N'EST PAS UN ÉMOJI.
 *
 * La V2 écrivait un cadenas en caractère. Un lecteur d'écran l'annonce
 * — « cadenas fermé » — juste avant le texte qui dit déjà la même chose ; et
 * sa fonte dépend du système, donc son dessin change d'une machine à l'autre.
 */
function Reserve({ langue }: { langue: LangueInterface }): ReactNode {
  return (
    <span className={styles.reserve}>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
        <path d="M5.5 10h13v9.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z" />
      </svg>
      {traduire(langue, 'v2.assoReserve')}
    </span>
  );
}

/**
 * UNE CARTE-LIGNE : la vignette à gauche, l'étiquette, le titre et la méta à
 * droite. C'est la forme que le prototype donne aux contenus secondaires, et
 * elle sert aussi bien dans la colonne du haut que dans la grille du bas.
 */
function Ligne({
  langue,
  contenu,
}: {
  langue: LangueInterface;
  contenu: ContenuAssociatif;
}): ReactNode {
  return (
    <li className={styles.secondaire}>
      <a className={styles.secondaireLien} href={`/${langue}/association/${contenu.slug}`}>
        {/* Décorative : le titre est écrit à côté, et la carte entière est le lien. */}
        <img
          className={styles.secondaireImage}
          src={imageDuContenu(contenu)}
          alt=""
          loading="lazy"
          decoding="async"
        />
        <div className={styles.secondaireCorps}>
          <span className={styles.secondaireEtiquette}>
            {traduire(langue, `v2.cat_${contenu.categorie}` as CleTraduction)}
          </span>
          <h3 className={styles.secondaireTitre}>{contenu.titre}</h3>
          <p className={styles.secondaireMeta}>{meta(langue, contenu)}</p>
          {contenu.peutLire ? null : <Reserve langue={langue} />}
        </div>
      </a>
    </li>
  );
}

export function AssociationV3({
  langue,
  contenus,
}: {
  langue: LangueInterface;
  contenus: ContenuAssociatif[];
}): ReactNode {
  const presentation = lirePresentationAssociation(langue);
  const [terrain, adhesion] = presentation.sections;

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA MAQUETTE EN COMPTE TROIS ; LA BASE EN A HUIT.                     │
   * │                                                                      │
   * │ Le prototype dessine un contenu en grand et DEUX lignes à côté, et    │
   * │ sa colonne de droite tient exactement la hauteur de la carte — 420    │
   * │ px. Rendre les sept autres dans cette colonne l'étirerait à mille     │
   * │ trois cents pixels, et la carte de gauche avec elle : un visuel de    │
   * │ la hauteur de trois écrans, pour un récit.                            │
   * │                                                                      │
   * │ Les deux premiers gardent donc la place que la maquette leur donne ;  │
   * │ les suivants prennent la même carte-ligne, en deux colonnes égales.   │
   * │ Rien n'est masqué, et le haut du bloc reste celui qui a été dessiné.  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const [principal, ...secondaires] = contenus;
  const cote = secondaires.slice(0, 2);
  const reste = secondaires.slice(2);

  return (
    <>
      {/* ── Le héros ──────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <span className={styles.heroCercle} aria-hidden="true" />

        <div className={styles.heroInterieur}>
          <div>
            <span className={styles.oeil}>
              <span className={styles.point} aria-hidden="true" />
              {presentation.oeil}
            </span>
            <h1 className={styles.titre}>{presentation.titre}</h1>
            <p className={styles.chapeau}>{presentation.chapeau}</p>
            <p className={styles.chapeauSecond}>{presentation.chapeauSecond}</p>

            <div className={styles.heroActions}>
              {/*
                Le lien mène au TUNNEL, avec le domaine dans l'adresse. Aucun
                montant n'est écrit ici : les formules et leurs prix viennent
                de la base, et le tunnel les lit à la zone d'encaissement.
              */}
              <a
                className={styles.boutonPrincipal}
                href={`/${langue}/abonnement/souscrire?domaine=association`}
              >
                {presentation.appel.action}
              </a>

              {/*
                Une ancre, et non un défilement en JavaScript : elle marche
                sans hydratation, se partage, et `scroll-behavior` est déjà
                coupé sous mouvement réduit par le filet de `tokens.css`.
              */}
              <a className={styles.boutonSecondaire} href={`#${ANCRE_ARTICLES}`}>
                {presentation.actionRecits}
              </a>
            </div>
          </div>

          {/*
            ── Le collage ──────────────────────────────────────────────

            Le logo porte le nom ET la devise, en pixels : son `alt` les
            écrit, c'est `logoAlt`. Les deux photographies, elles, décrivent
            ce qu'elles montrent — un `alt` éditorial, jamais une clé
            d'interface déjà affichée à côté.

            `eager` sur le logo, et c'est l'exception qui confirme la règle :
            il identifie l'association en haut de l'écran, et le différer
            ferait un trou à l'endroit qu'on regarde en premier.
          */}
          <div className={styles.collage}>
            <img
              className={styles.logo}
              src={`/images/association/${LOGO_ASSOCIATION.fichier}`}
              alt={presentation.logoAlt}
              width={LOGO_ASSOCIATION.largeur}
              height={LOGO_ASSOCIATION.hauteur}
              loading="eager"
              decoding="async"
            />

            {presentation.collage.map((photo) => (
              <img
                key={photo.fichier}
                className={styles.photo}
                src={`/images/association/${photo.fichier}`}
                alt={photo.alt}
                loading="lazy"
                decoding="async"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── La bande sombre : l'action de terrain ─────────────────────── */}
      <section className={styles.bande}>
        <div className={styles.bandeInterieur}>
          <Revele>
            <div className={styles.bandeEnTete}>
              <span className={styles.oeilSurChrome}>{presentation.axesOeil}</span>
              <h2 className={styles.bandeTitre}>{terrain?.titre}</h2>
            </div>
          </Revele>

          <Revele>
            <ol className={styles.axes}>
              {presentation.axes.map((axe) => (
                <li className={styles.axe} key={axe.numero}>
                  {/*
                    Le numéro est un ORNEMENT : la liste est déjà ordonnée, et
                    un lecteur d'écran annonce « élément 2 sur 3 ». L'énoncer
                    une seconde fois ferait entendre « zéro deux, deux ».
                  */}
                  <span className={styles.axeNumero} aria-hidden="true">
                    {axe.numero}
                  </span>
                  <p className={styles.axeTitre}>{axe.titre}</p>
                  <p className={styles.axeCorps}>{axe.corps}</p>
                </li>
              ))}
            </ol>
          </Revele>
        </div>
      </section>

      {/* ── Adhérer, et ce qu'il faut savoir ──────────────────────────── */}
      <section className={styles.sectionAdhesion}>
        <Revele>
          <div className={styles.adhesion}>
            <div>
              <h2 className={styles.adhesionTitre}>{adhesion?.titre}</h2>
              {adhesion?.paragraphes?.map((paragraphe) => (
                <p className={styles.adhesionTexte} key={paragraphe}>
                  {paragraphe}
                </p>
              ))}
            </div>

            {/*
              Les trois mises en garde du cahier des charges §3.6 : deux
              abonnements étanches, et aucun des deux n'ouvre le
              téléchargement. Elles sont ÉCRITES parce qu'elles sont ce qu'on
              se trompe à supposer — pas parce que la maquette a une carte à
              remplir de ce côté.
            */}
            <div className={styles.notes}>
              <p className={styles.notesTitre}>{presentation.notesTitre}</p>
              <ul className={styles.notesListe}>
                {adhesion?.points?.map((note) => (
                  <li className={styles.note} key={note}>
                    <span className={styles.tiret} aria-hidden="true" />
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Revele>
      </section>

      {/* ── Soutenir autrement, puis la citation ──────────────────────── */}
      <section className={styles.sectionSoutien}>
        {/*
          Le prototype ne donne pas de titre à cette rangée. Un titre CACHÉ la
          nomme quand même : sans lui, la section n'a pas d'étiquette dans la
          liste des repères d'un lecteur d'écran, et trois cartes y flottent
          sans qu'on sache de quoi elles parlent.
        */}
        <h2 className={styles.titreCache}>{presentation.sections[2]?.titre}</h2>

        <Revele>
          <ul className={styles.soutiens}>
            {presentation.soutiens.map((soutien) => (
              <li className={styles.soutien} key={soutien.cle}>
                <span className={styles.soutienIcone}>
                  <Pictogramme cle={soutien.cle} />
                </span>
                <p className={styles.soutienTitre}>{soutien.titre}</p>
                <p className={styles.soutienCorps}>{soutien.corps}</p>
              </li>
            ))}
          </ul>
        </Revele>

        <Revele>
          <div className={styles.panneau}>
            {/*
              La citation est une CITATION : `blockquote` le dit, et le
              prototype l'écrit en simple paragraphe faute de balise dans son
              gabarit. Les guillemets sont dans le texte, comme le veut la
              typographie française — et l'anglais a les siens.
            */}
            <blockquote className={styles.citation}>{presentation.citation}</blockquote>
            <p className={styles.citationRelance}>{presentation.citationRelance}</p>
            <a
              className={styles.panneauAction}
              href={`/${langue}/abonnement/souscrire?domaine=association`}
            >
              {presentation.appel.titre}
            </a>
          </div>
        </Revele>
      </section>

      {/* ── Les contenus, publiés depuis l'administration ─────────────── */}
      <section className={styles.sectionArticles} id={ANCRE_ARTICLES}>
        <Revele>
          <div className={styles.articlesEnTete}>
            <span className={styles.oeilClair}>{traduire(langue, 'v2.assoContenusOeil')}</span>
            <h2 className={styles.articlesTitre}>{traduire(langue, 'v2.assoContenusTitre')}</h2>
            <p className={styles.articlesTexte}>{traduire(langue, 'v2.assoContenusTexte')}</p>
          </div>
        </Revele>

        {contenus.length === 0 ? (
          <p className={styles.vide}>{traduire(langue, 'v2.assoVide')}</p>
        ) : (
          <Revele>
            <ul className={styles.articles}>
              {principal ? (
                <li className={styles.principal}>
                  <a
                    className={styles.principalLien}
                    href={`/${langue}/association/${principal.slug}`}
                  >
                    {/*
                      `alt=""` : le titre est écrit dans le corps de la carte,
                      et la carte entière est le lien. Répéter le titre dans
                      l'image ferait annoncer deux fois la même phrase, la
                      première annoncée comme une image.
                    */}
                    <img
                      className={styles.principalImage}
                      src={imageDuContenu(principal)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <span className={styles.voile} aria-hidden="true" />

                    <div className={styles.principalCorps}>
                      <span className={styles.etiquette}>
                        {traduire(langue, `v2.cat_${principal.categorie}` as CleTraduction)}
                      </span>
                      {/*
                        Un vrai titre, et non un `span` : c'est ce qui met les
                        contenus dans la liste des repères d'un lecteur
                        d'écran. Un `<a>` a un modèle de contenu transparent,
                        il peut donc porter un titre.
                      */}
                      <h3 className={styles.principalTitre}>{principal.titre}</h3>
                      <p className={styles.principalExtrait}>{principal.chapeau}</p>
                      <p className={styles.principalMeta}>{meta(langue, principal)}</p>
                      {principal.peutLire ? null : <Reserve langue={langue} />}
                    </div>
                  </a>
                </li>
              ) : null}

              {cote.length > 0 ? (
                <li className={styles.colonne}>
                  <ul className={styles.colonneListe}>
                    {cote.map((contenu) => (
                      <Ligne key={contenu.slug} langue={langue} contenu={contenu} />
                    ))}
                  </ul>
                </li>
              ) : null}
            </ul>
          </Revele>
        )}

        {reste.length > 0 ? (
          <Revele>
            <ul className={styles.reste}>
              {reste.map((contenu) => (
                <Ligne key={contenu.slug} langue={langue} contenu={contenu} />
              ))}
            </ul>
          </Revele>
        ) : null}
      </section>
    </>
  );
}
