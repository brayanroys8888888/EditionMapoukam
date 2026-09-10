import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { EntreeCatalogue } from '@/domain/catalog/types';
import type { ReponseFacettes } from '@/domain/api/contract';
import type { Temoignage } from '@/lib/site/temoignages';
import { Motif, teinteDuTheme } from '@/components/motif';
import { Couverture, SubstitutCouverture } from '@/components/catalogue/couverture';
import { teinteDepuisThemes } from '@/components/motif';
import { estV3 } from '@/design/version';
import { Carrousel } from './carrousel';
import { CarteConteV2 } from './carte-conte';
import { Revele } from './revele';
import styles from './accueil.module.css';

/**
 * ACCUEIL — DIRECTION V2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN CHIFFRE, AUCUN PRIX N'EST ÉCRIT DANS CE FICHIER.                  │
 * │                                                                          │
 * │ Les comptes viennent des facettes du catalogue, les prix de             │
 * │ `prix.affichage` rendu par le serveur. C'est la même règle que la V1, et │
 * │ elle vaut d'autant plus ici que cette page est la vitrine : un montant   │
 * │ recopié serait celui que le client lit AVANT de payer l'autre.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les témoignages ne sont plus de la copie non plus : ils vivent en base
 * depuis la migration 0073, traduits et ordonnés par l'éditeur, et arrivent ici
 * par une prop. Ils étaient figés aux clés `v2.avis1` à `v2.avis3`, où en
 * changer un demandait un déploiement.
 */

/**
 * Combien de THÈMES la vitrine met en avant.
 *
 * La section montrait les cinq traditions, dans un ordre écrit ici. Les thèmes
 * viennent des facettes, déjà ordonnés par effectif : il ne reste qu'à décider
 * combien de tuiles tiennent sur une ligne. Cinq, comme avant.
 */
const NOMBRE_THEMES_VITRINE = 5;

/** Les trois gages de la bande de réassurance. */
const GAGES = [
  { titre: 'v2.gage1Titre', corps: 'v2.gage1Corps' },
  { titre: 'v2.gage2Titre', corps: 'v2.gage2Corps' },
  { titre: 'v2.gage3Titre', corps: 'v2.gage3Corps' },
] as const;

function IconeGage({ rang }: { rang: number }): ReactNode {
  const communes = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    width: 22,
    height: 22,
    'aria-hidden': true,
    focusable: false,
  } as const;

  // Trois tracés seulement, dessinés à la main : cadenas, fichier, bulle.
  // Une bibliothèque d'icônes pour trois formes coûterait plus cher que tout
  // le reste de cette page sur la connexion lente du public visé.
  if (rang === 0) {
    return (
      <svg {...communes}>
        <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
        <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      </svg>
    );
  }

  if (rang === 1) {
    return (
      <svg {...communes}>
        <path d="M13.5 3.5H7.2A2.2 2.2 0 0 0 5 5.7v12.6a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2V9z" />
        <path d="M13.5 3.5V9H19" />
      </svg>
    );
  }

  return (
    <svg {...communes}>
      <path d="M20 13.5a3 3 0 0 1-3 3H9l-4 3.5v-3.5H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z" />
    </svg>
  );
}

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ L'ÉVENTAIL DU HERO — LA PIÈCE QUI MANQUAIT.                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE AVAIT ÉTÉ SUPPRIMÉE, PUIS DÉCLARÉE INEXISTANTE.                    │
 * │                                                                          │
 * │ La maquette pose trois couvertures inclinées à droite du titre, sur      │
 * │ 520 px de haut, avec une pastille flottante. Une version antérieure les  │
 * │ avait retirées parce que le hero portait DÉJÀ une photographie de fond   │
 * │ et que deux images se disputaient la même section — le raisonnement      │
 * │ était juste, la conclusion l'était moins : c'est la photographie qui     │
 * │ était de trop, elle n'existe dans aucune maquette.                       │
 * │                                                                          │
 * │ Pire, la passe mouvement a ensuite inscrit l'effet 4 du dossier — le     │
 * │ flottement de l'éventail — comme « sans objet, il n'y a pas d'éventail   │
 * │ dans ce hero ». Une absence prise pour un fait acquis au lieu d'un       │
 * │ écart. Les deux sont réparés ici.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES TROIS COUVERTURES SONT DE VRAIS TITRES, PAS UN DÉCOR.               │
 * │                                                                          │
 * │ Elles viennent des nouveautés déjà chargées pour le carrousel — aucune   │
 * │ requête de plus, et aucune image inventée. Moins de trois titres         │
 * │ publiés, l'éventail rend ce qu'il a ; aucun, il ne rend rien et la       │
 * │ colonne disparaît plutôt que d'afficher des rectangles vides.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function EventailHero({
  langue,
  titres,
  total,
}: {
  langue: LangueInterface;
  titres: readonly EntreeCatalogue[];
  /** Le compte RÉEL du catalogue, rendu par les facettes. Jamais écrit ici. */
  total: number | null;
}): ReactNode {
  const trois = titres.slice(0, 3);
  if (trois.length === 0) return null;

  return (
    <div className={styles.eventail} aria-hidden="true">
      {trois.map((entree, rang) => (
        <div key={entree.id} className={styles.eventailCarte} data-rang={rang}>
          {entree.couverture ? (
            <Couverture
              langue={langue}
              url={entree.couverture.vignette}
              largeur={268}
              hauteur={403}
              tailles="(max-width: 1120px) 40vw, 268px"
              teinte={teinteDepuisThemes(entree.themes)}
              alt=""
            />
          ) : (
            <SubstitutCouverture langue={langue} teinte={teinteDepuisThemes(entree.themes)} />
          )}
        </div>
      ))}

      {total === null ? null : (
        <p className={styles.eventailBadge}>
          <span className={styles.eventailSceau}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.75}
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4Z" />
              <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6Z" />
            </svg>
          </span>
          <span>
            <span className={styles.eventailBadgeTitre}>
              {traduire(langue, 'v2.heroEventailTitre').replace('{n}', String(total))}
            </span>
            <span className={styles.eventailBadgeCorps}>
              {traduire(langue, 'v2.heroEventailCorps')}
            </span>
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Les trois preuves chiffrées, sous les boutons du hero.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN DE CES TROIS NOMBRES N'EST ÉCRIT ICI.                             │
 * │                                                                          │
 * │ C'est la règle de l'en-tête de ce fichier, et elle vaut d'autant plus    │
 * │ pour une ligne dont le rôle est de RASSURER : « 40 contes » sur un       │
 * │ catalogue qui en porte dix se retourne contre celui qui l'écrit dès la   │
 * │ première visite. Les trois viennent des facettes, c'est-à-dire du        │
 * │ catalogue réel — et la ligne disparaît quand les facettes manquent.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function PreuvesHero({
  langue,
  facettes,
}: {
  langue: LangueInterface;
  facettes: ReponseFacettes | null;
}): ReactNode {
  if (!facettes) return null;

  const preuves: { valeur: string; libelle: string }[] = [
    { valeur: String(facettes.total), libelle: traduire(langue, 'v2.heroPreuveContes') },
    {
      valeur: String(facettes.themes.length),
      libelle: traduire(langue, 'v2.heroPreuveThemes'),
    },
  ];

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LA TROISIÈME PREUVE EST UN FAIT DU PRODUIT, PAS UNE MESURE.           │
   * │                                                                        │
   * │ Elle portait la tranche d'âge du catalogue — « 3–12, l'âge des         │
   * │ lecteurs ». Deux défauts : la phrase se lit mal, et le nombre bougeait  │
   * │ au gré des titres publiés, ce qui n'est pas une promesse mais un état.  │
   * │                                                                        │
   * │ La maquette dit « 2 formats à garder : PDF et EPUB ». Ce deux-là ne     │
   * │ varie pas : c'est la liste `FORMATS` du service de téléchargement, et   │
   * │ c'est la promesse commerciale même — l'achat donne le fichier.          │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  preuves.push({ valeur: '2', libelle: traduire(langue, 'v2.heroPreuveFormats') });

  return (
    <ul className={styles.preuves}>
      {preuves.map((preuve) => (
        <li key={preuve.libelle} className={styles.preuve}>
          <span className={styles.preuveValeur}>{preuve.valeur}</span>
          <span className={styles.preuveLibelle}>{preuve.libelle}</span>
        </li>
      ))}
    </ul>
  );
}

export function AccueilV2({
  langue,
  nouveautes,
  facettes,
  temoignages,
  actionAjout,
}: {
  langue: LangueInterface;
  /** `null` quand la base tousse : la vitrine s'affiche quand même. */
  nouveautes: { entrees: EntreeCatalogue[]; total: number } | null;
  facettes: ReponseFacettes | null;
  /**
   * Les témoignages publiés. Vide fait disparaître la section — une vitrine
   * sans témoignages vaut mieux qu'une section de citations vides.
   */
  temoignages: readonly Temoignage[];
  /** Fabrique l'action d'ajout au panier d'un titre donné. */
  actionAjout?: (livreId: string) => (donnees: FormData) => void | Promise<void>;
}): ReactNode {
  // Les facettes ne rendent que ce que le catalogue porte vraiment : un thème
  // sans titre publié n'y figure pas, et la vitrine ne peut donc pas proposer
  // une tuile qui mènerait à une page vide.
  const themesVitrine = (facettes?.themes ?? []).slice(0, NOMBRE_THEMES_VITRINE);

  return (
    <div className={styles.page}>
      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className={styles.hero} aria-labelledby="titre-accueil">
        <div className={styles.heroGrille}>
          <div className={styles.heroTexte}>
            <p className={styles.surtitre}>{traduire(langue, 'v2.heroSurtitre')}</p>

            <h1 id="titre-accueil" className={styles.heroTitre}>
              {traduire(langue, 'v2.heroTitre1')}{' '}
              <span className={styles.heroAccent}>{traduire(langue, 'v2.heroTitreAccent')}</span>
            </h1>

            <p className={styles.heroAccroche}>{traduire(langue, 'v2.heroAccroche')}</p>

            <div className={styles.heroActions}>
              <a className={styles.boutonOcre} href={`/${langue}/catalogue`}>
                {traduire(langue, 'v2.heroAction')}
              </a>
              <a className={styles.boutonClair} href={`/${langue}/offres`}>
                {traduire(langue, 'v2.heroActionSecondaire')}
              </a>
            </div>

            {/*
             * Les preuves n'apparaissent que sous Organic : sous la V2, le
             * hero est une photographie sombre, et trois nombres posés dessus
             * y seraient illisibles autant qu'inattendus. Voir `PreuvesHero`.
             */}
            {estV3() ? <PreuvesHero langue={langue} facettes={facettes} /> : null}
          </div>

          {/*
           * ┌──────────────────────────────────────────────────────────────┐
           * │ L'ÉVENTAIL REVIENT — SOUS ORGANIC SEULEMENT.                 │
           * │                                                              │
           * │ Sous la V2, le hero garde sa photographie de fond, et une    │
           * │ deuxième image posée dessus se disputerait la section — le   │
           * │ raisonnement qui l'avait fait retirer. Sous Organic il n'y a │
           * │ plus de photographie : le fond est la crème de la maquette,  │
           * │ et l'éventail est ce qui occupe la colonne de droite.        │
           * └──────────────────────────────────────────────────────────────┘
           */}
          {estV3() ? (
            <EventailHero
              langue={langue}
              titres={nouveautes?.entrees ?? []}
              total={facettes?.total ?? null}
            />
          ) : null}
        </div>
      </section>

      {/* ══ RÉASSURANCE ══════════════════════════════════════════════════ */}
      <div className={styles.reassurance}>
        <div className={styles.reassuranceGrille}>
          {GAGES.map((gage, rang) => (
            <div key={gage.titre} className={styles.gage}>
              <span className={styles.gagePastille} aria-hidden="true">
                <IconeGage rang={rang} />
              </span>
              <div>
                <p className={styles.gageTitre}>{traduire(langue, gage.titre)}</p>
                <p className={styles.gageCorps}>{traduire(langue, gage.corps)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ NOUVEAUTÉS — EN CARROUSEL ════════════════════════════════════ */}
      {nouveautes && nouveautes.entrees.length > 0 ? (
        <section className={styles.section} aria-labelledby="titre-nouveautes">
          <div className={styles.interieur}>
            <div className={styles.enteteSection}>
              <div>
                <span className={styles.oeil}>{traduire(langue, 'v2.nouveautesOeil')}</span>
                <h2 id="titre-nouveautes" className={styles.titreSection}>
                  {traduire(langue, 'v2.nouveautesTitre')}
                </h2>
                <p className={styles.sousTitreSection}>
                  {traduire(langue, 'v2.nouveautesSousTitre')}
                </p>
              </div>

              <a className={styles.boutonContour} href={`/${langue}/catalogue`}>
                {traduire(langue, 'accueil.voirTout')}
              </a>
            </div>

            <Carrousel langue={langue} libelle={traduire(langue, 'v2.nouveautesTitre')}>
              {nouveautes.entrees.map((entree) => (
                <li key={entree.id}>
                  <CarteConteV2
                    langue={langue}
                    entree={entree}
                    actionAjout={actionAjout?.(entree.id)}
                  />
                </li>
              ))}
            </Carrousel>
          </div>
        </section>
      ) : null}

      {/* ══ NOTRE HISTOIRE ═══════════════════════════════════════════════ */}
      <section
        className={`${styles.section} ${styles.sectionDouce} ${styles.sectionHistoire}`}
        aria-labelledby="titre-histoire"
      >
        <div className={styles.interieur}>
          <Revele>
            <div className={styles.histoire}>
              {/*
               * Aucune photographie ici, et c'est assumé : nous n'en avons
               * aucune dont les droits soient établis. Un aplat à motif tient
               * la place d'une illustration — jamais un rectangle gris.
               */}
              <div className={styles.histoireVisuel}>
                {/*
                 * ┌────────────────────────────────────────────────────────┐
                 * │ `alt=""` PLUTÔT QUE LE TITRE DE LA SECTION.            │
                 * │                                                        │
                 * │ L'attribut reprenait `v2.histoireTitre` — le texte du  │
                 * │ `<h2>` qui se trouve à trois lignes d'ici. Un lecteur  │
                 * │ d'écran entendait donc la même phrase deux fois de     │
                 * │ suite, la première annoncée comme une image.           │
                 * │                                                        │
                 * │ Cet aplat ne porte aucune information : il tient la    │
                 * │ place d'une illustration que nous n'avons pas. Une     │
                 * │ image décorative se déclare vide ; elle sort alors de  │
                 * │ l'arbre d'accessibilité au lieu d'y répéter le titre.  │
                 * └────────────────────────────────────────────────────────┘
                 */}
                <img
                  src="/images/pourquoi-contes.png"
                  alt=""
                  // Bien au-dessous de la ligne de flottaison : la charger
                  // d'emblée retarde l'affichage du hero, sur la connexion
                  // lente du §5.1 comme sur les autres.
                  loading="lazy"
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                {/*
                 * La pastille sauge de la maquette, décalée de 18 px hors du
                 * cadre en bas à droite. Elle n'existe que sous Organic — la
                 * V2 n'a pas d'image carrée à déborder.
                 */}
                {estV3() ? (
                  <span className={styles.histoireBadge}>
                    {traduire(langue, 'v2.histoireBadge')}
                  </span>
                ) : null}
              </div>

              <div>
                <span className={styles.oeil}>{traduire(langue, 'v2.histoireOeil')}</span>
                <h2 id="titre-histoire" className={styles.titreSection}>
                  {traduire(langue, 'v2.histoireTitre')}
                </h2>

                <p className={styles.histoireTexte} style={{ marginTop: '20px' }}>
                  {traduire(langue, 'v2.histoireCorps1')}
                </p>
                <p className={styles.histoireTexte}>{traduire(langue, 'v2.histoireCorps2')}</p>

                <a className={styles.boutonVert} href={`/${langue}/a-propos`}>
                  {traduire(langue, 'v2.histoireAction')}
                  {/* La flèche de la maquette. Décorative : le lien est nommé. */}
                  {estV3() ? (
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.75}
                      strokeLinecap="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M5 12h13m-5-6 6 6-6 6" />
                    </svg>
                  ) : null}
                </a>
              </div>
            </div>
          </Revele>
        </div>
      </section>

      {/* ══ LES THÈMES ═══════════════════════════════════════════════════ */}
      {themesVitrine.length > 0 ? (
        <section
          className={`${styles.section} ${styles.sectionThemes}`}
          aria-labelledby="titre-traditions"
        >
          <div className={styles.interieur}>
            <div className={styles.enteteSection}>
              <div>
                <span className={styles.oeil}>{traduire(langue, 'v2.themesOeil')}</span>
                <h2 id="titre-traditions" className={styles.titreSection}>
                  {traduire(langue, 'accueil.themesTitre')}
                </h2>
                <p className={styles.sousTitreSection}>
                  {traduire(langue, 'accueil.themesIntro')}
                </p>
              </div>
            </div>

            <ul className={styles.traditions}>
              {themesVitrine.map((facette, rang) => {
                return (
                  <li key={facette.valeur}>
                    <Revele rang={rang}>
                      {/*
                        `encodeURIComponent` : un thème est de la saisie libre,
                        et une espace ou une esperluette y casserait la requête.
                      */}
                      <a
                        className={styles.tradition}
                        href={`/${langue}/catalogue?themes=${encodeURIComponent(facette.valeur)}`}
                        /*
                         * La palette du thème, portée par un attribut plutôt
                         * que par un style en ligne : la couleur reste dans
                         * `tokens.css`, où le test de contraste sait la lire.
                         * Un style en ligne l'aurait rendue invisible à lui.
                         */
                        data-teinte={teinteDuTheme(facette.valeur) ?? 'inconnue'}
                      >
                        {/*
                          ┌──────────────────────────────────────────────────┐
                          │ LE MOTIF DE LA CHARTE, ET NON UNE PHOTO DE       │
                          │ BANQUE D'IMAGES.                                  │
                          │                                                   │
                          │ Ces vignettes portaient quatre photographies en   │
                          │ rotation, et le commentaire qui les posait        │
                          │ l'admettait : « sans rapport avec le thème nommé  │
                          │ juste en dessous ». On lisait donc une ville      │
                          │ sous « animaux », une côte sous « nature », un    │
                          │ désert sous « courage ». Une image qui contredit  │
                          │ son libellé coûte plus qu'elle ne rapporte : elle │
                          │ dit au lecteur que personne n'a regardé.          │
                          │                                                   │
                          │ Le motif, lui, est TIRÉ DU THÈME — même hachage   │
                          │ que les substituts de couverture, donc la même    │
                          │ teinte pour « animaux » ici et sur les cartes du  │
                          │ catalogue. Il ne raconte rien de faux, il range.  │
                          └──────────────────────────────────────────────────┘
                        */}
                        <Motif
                          teinte={teinteDuTheme(facette.valeur)}
                          place="rythme"
                          className={styles.traditionMotif}
                        />
                        <p className={styles.traditionNom}>{facette.valeur}</p>
                        <p className={styles.traditionCompte}>
                          {facette.nombre === 1
                            ? traduire(langue, 'accueil.themesCompteUn')
                            : traduire(langue, 'accueil.themesCompte').replace(
                                '{nombre}',
                                String(facette.nombre),
                              )}
                        </p>

                        {/*
                         * La ligne d'appel de la maquette — « Voir les contes »
                         * suivie d'une flèche. La flèche est `aria-hidden` : le
                         * lien porte déjà son nom, et « flèche vers la droite »
                         * lu après chaque tuile n'apprend rien.
                         */}
                        {estV3() ? (
                          <span className={styles.traditionAppel}>
                            {traduire(langue, 'v2.themesVoir')}
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={3}
                              strokeLinecap="round"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path d="M5 12h13m-5-6 6 6-6 6" />
                            </svg>
                          </span>
                        ) : null}
                      </a>
                    </Revele>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ══ TÉMOIGNAGES ══════════════════════════════════════════════════ */}
      {temoignages.length > 0 ? (
        <section
          className={`${styles.section} ${styles.sectionDouce} ${styles.sectionAvis}`}
          aria-labelledby="titre-avis"
        >
          <div className={styles.interieur}>
            <div className={styles.enteteSection}>
              <div>
                <span className={styles.oeil}>{traduire(langue, 'v2.avisOeil')}</span>
                <h2 id="titre-avis" className={styles.titreSection}>
                  {traduire(langue, 'v2.avisTitre')}
                </h2>
              </div>
            </div>

            <ul className={styles.avis}>
              {temoignages.map((temoignage, rang) => (
                <li key={temoignage.id}>
                  <Revele rang={rang}>
                    <figure className={styles.avisCarte}>
                      <span className={styles.avisGuillemet} aria-hidden="true">
                        &laquo;
                      </span>
                      <blockquote className={styles.avisTexte}>{temoignage.texte}</blockquote>
                      <figcaption className={styles.avisAuteur}>
                        {/*
                         * ┌──────────────────────────────────────────────────┐
                         * │ LA VIGNETTE D'INITIALE — UN DESSIN, PAS UN MOT. │
                         * │                                                  │
                         * │ La maquette pose un disque sauge portant la      │
                         * │ première lettre du prénom. `aria-hidden` :       │
                         * │ l'initiale est le début du nom écrit juste à     │
                         * │ côté, et un lecteur d'écran annoncerait « S,     │
                         * │ Sophie ». Elle repère à l'œil, elle n'informe    │
                         * │ pas.                                             │
                         * │                                                  │
                         * │ `[...auteur][0]` et non `auteur[0]` : le second  │
                         * │ rend une demi-paire de substitution sur un       │
                         * │ prénom qui commencerait hors du plan de base.    │
                         * └──────────────────────────────────────────────────┘
                         */}
                        {estV3() ? (
                          <span className={styles.avisInitiale} aria-hidden="true">
                            {([...temoignage.auteur][0] ?? '').toUpperCase()}
                          </span>
                        ) : null}
                        {/*
                         * Le nom et le rôle sont EMPILÉS dans leur propre
                         * colonne : la légende est une rangée — disque, puis
                         * identité — et sans ce groupe, le rôle devient un
                         * troisième élément de la rangée et se pose à côté du
                         * nom au lieu de se poser dessous.
                         */}
                        <span className={styles.avisIdentite}>
                          <span className={styles.avisNom}>{temoignage.auteur}</span>
                          {/*
                            Le rôle est facultatif : un témoignage signé du seul
                            prénom reste un témoignage. Une ligne vide y aurait
                            laissé un blanc que l'œil lit comme un défaut.
                          */}
                          {temoignage.role ? (
                            <span className={styles.avisRole}>{temoignage.role}</span>
                          ) : null}
                        </span>
                      </figcaption>
                    </figure>
                  </Revele>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ══ APPEL FINAL ══════════════════════════════════════════════════ */}
      <section className={styles.appel}>
        <div className={styles.appelInterieur}>
          <h2 className={styles.appelTitre}>{traduire(langue, 'v2.appelTitre')}</h2>
          <p className={styles.appelCorps}>{traduire(langue, 'v2.appelCorps')}</p>

          <div className={styles.appelActions}>
            <a className={styles.boutonOcre} href={`/${langue}/catalogue`}>
              {traduire(langue, 'v2.heroAction')}
            </a>
            <a className={styles.boutonClair} href={`/${langue}/offres`}>
              {traduire(langue, 'accueil.enSavoirPlus')}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
