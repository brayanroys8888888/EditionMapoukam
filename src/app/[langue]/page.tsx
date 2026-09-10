import { headers } from 'next/headers';

import { langueValide, traduire } from '@/i18n';
import { catalogQuerySchema } from '@/domain/catalog/schemas';
import { lireFacettes, listerCatalogue } from '@/lib/catalog/repository';
import { lireOffres } from '@/lib/offers/service';
import { lireTemoignages } from '@/lib/site/temoignages';
import { identifierAppelantAvecCookies } from '@/lib/auth/session';
import { GrilleCatalogue, teintesTheme } from '@/components/catalogue';
import { Couverture } from '@/components/catalogue/couverture';
import { Motif, teinteDepuisThemes, teinteDuTheme } from '@/components/motif';
import { AccueilV2 } from '@/components/v2/accueil';
import { structureRefondue } from '@/design/version';
import { ajouterAuPanier } from './panier/actions';
import styles from '@/components/accueil/accueil.module.css';

/**
 * Accueil — §4.1 F1, et §B des maquettes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES NOUVEAUTÉS VIENNENT DU CATALOGUE, PAS D'UNE SÉLECTION ÉCRITE ICI.   │
 * │                                                                          │
 * │ Le tri `nouveautes` est celui du catalogue, appliqué en SQL. Choisir à   │
 * │ la main les titres mis en avant aurait produit une liste à tenir à jour  │
 * │ — c'est-à-dire une liste périmée, qui continuerait d'annoncer comme       │
 * │ « nouveau » un conte publié il y a un an.                                │
 * │                                                                          │
 * │ La grille est celle du catalogue, y compris ses trois lignes d'accès :   │
 * │ un lecteur qui possède déjà un titre le voit ici aussi.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN CHIFFRE N'EST ÉCRIT DANS CETTE PAGE.                              │
 * │                                                                          │
 * │ La maquette annonce « Soixante histoires », « Huit à lire aujourd'hui »  │
 * │ et « 24 contes » par tradition. Ces nombres étaient faux le jour où la   │
 * │ maquette a été produite et le resteront : ils viennent des facettes du   │
 * │ catalogue, calculées en base.                                            │
 * │                                                                          │
 * │ Même chose pour les prix — 3,90 € et 6,90 € dans la maquette, contre     │
 * │ 4,99 € et 7,99 € dans `business_settings`. Ils viennent de `lireOffres`, │
 * │ le module qu'emploie `/api/offers`.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const NOMBRE_NOUVEAUTES = 8;

/**
 * LES NOUVEAUTÉS DE L'ACCUEIL SONT DES CONTES, ET SEULEMENT DES CONTES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE N'EST PAS UN DROIT, C'EST UNE VITRINE.                                │
 * │                                                                          │
 * │ Le support n'ouvre et ne ferme aucun accès — `access_for_books` ne lit   │
 * │ jamais `type_document`, et rien ici ne le lui fait dire. Ce filtre est   │
 * │ un choix d'ÉTALAGE : la vitrine s'adresse au parent qui cherche une      │
 * │ histoire à lire le soir, et un cahier de graphisme au milieu des contes  │
 * │ répond à une autre question que celle qu'il se pose.                     │
 * │                                                                          │
 * │ Les livrets ne disparaissent de nulle part : ils gardent leur rayon      │
 * │ `/livrets`, le catalogue entier, la recherche et le plan de site. Seule  │
 * │ la rangée « nouveautés » de l'accueil ne les mêle plus aux contes.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const SUPPORT_NOUVEAUTES = 'conte';

/**
 * Combien de THÈMES la vitrine met en avant.
 *
 * La section montrait les cinq traditions, dans un ordre écrit ici. Les
 * thèmes, eux, ne sont pas une énumération : ils viennent des facettes, déjà
 * ordonnés par effectif décroissant, et il n'y a donc rien à ranger — juste à
 * décider combien de tuiles tiennent sur une ligne. Cinq, comme avant.
 */
const NOMBRE_THEMES_VITRINE = 5;

export default async function Accueil({ params }: { params: Promise<{ langue: string }> }) {
  const langue = langueValide((await params).langue);

  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ TROIS LECTURES INDÉPENDANTES, ET AUCUNE NE PEUT ABATTRE LA PAGE.      │
  // │                                                                        │
  // │ Une vitrine qui tombe parce que la base tousse est pire qu'une vitrine │
  // │ sans mise en avant. Chaque bloc absent se retire tout seul ; le hero,  │
  // │ lui, s'affiche toujours.                                               │
  // │                                                                        │
  // │ `Promise.all` et non quatre `await` de suite : les requêtes ne se      │
  // │ dépendent pas, et les enchaîner quadruplerait le temps d'attente sur   │
  // │ la connexion lente qui est la condition réelle d'une partie du public. │
  // └────────────────────────────────────────────────────────────────────────┘
  const [nouveautes, facettes, offres, temoignages] = await Promise.all([
    listerCatalogue(
      appelant?.id ?? null,
      catalogQuerySchema.parse({
        langue,
        tri: 'nouveautes',
        taille: NOMBRE_NOUVEAUTES,
        type: SUPPORT_NOUVEAUTES,
      }),
    ).catch(() => null),
    lireFacettes(langue).catch(() => null),
    // Zone d'AFFICHAGE seulement. La zone d'encaissement est déterminée au
    // paiement, depuis le pays réel du moyen de paiement.
    lireOffres('international').catch(() => null),
    // `lireTemoignages` ne lève jamais : elle rend un tableau vide, et la
    // section disparaît d'elle-même.
    lireTemoignages(langue),
  ]);

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LES DEUX DIRECTIONS PARTAGENT LES MÊMES DONNÉES.                      │
  // │                                                                        │
  // │ Le chargement ci-dessus est fait UNE fois, avant de choisir la mise    │
  // │ en page. C'est ce qui garantit que la V2 ne dérive pas : elle ne peut  │
  // │ afficher que ce que la V1 affiche, puisqu'elle reçoit exactement les   │
  // │ mêmes objets.                                                          │
  // └────────────────────────────────────────────────────────────────────────┘
  if (structureRefondue()) {
    return (
      <AccueilV2
        langue={langue}
        nouveautes={nouveautes}
        facettes={facettes}
        temoignages={temoignages}
        // L'ajout au panier est une Server Action LIÉE au titre : un `GET` qui
        // modifie un panier serait rejoué par le moindre préchargement.
        actionAjout={(livreId) => ajouterAuPanier.bind(null, langue, livreId, langue)}
      />
    );
  }

  const vedette = nouveautes?.entrees[0] ?? null;
  // Les facettes ne rendent que ce que le catalogue porte vraiment : un thème
  // sans titre publié n'y figure pas, et la vitrine ne peut donc pas proposer
  // une tuile qui mènerait à une page vide.
  const themesVitrine = (facettes?.themes ?? []).slice(0, NOMBRE_THEMES_VITRINE);

  // La première offre d'abonnement est la mensuelle : c'est l'ordre que rend
  // `/api/offers`, et la vitrine affiche le prix d'entrée, pas la liste.
  const abonnement = offres?.abonnement.ouvert ? (offres.abonnement.offres[0] ?? null) : null;

  return (
    <div className={styles.page}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className={`${styles.section} ${styles.hero}`} aria-labelledby="titre-accueil">
        <div className={styles.heroGrille}>
          <div className={styles.heroTexte}>
            <p className={styles.surtitre}>{traduire(langue, 'accueil.surtitre')}</p>

            <h1 id="titre-accueil" className={styles.heroTitre}>
              {traduire(langue, 'accueil.titreBanniere')}
            </h1>

            <p className={styles.heroAccroche}>{traduire(langue, 'accueil.corpsBanniere')}</p>

            <div className={styles.heroActions}>
              <a className={styles.boutonPrimaire} href={`/${langue}/catalogue`}>
                {traduire(langue, 'accueil.actionCatalogue')}
              </a>
              <a className={styles.lienSouligne} href="#comment">
                {traduire(langue, 'accueil.actionComment')}
              </a>
            </div>
          </div>

          {/*
           * L'aplat porte la couleur du titre mis en avant — celle de son
           * premier thème — jamais une teinte choisie une fois pour toutes :
           * le hero change avec le catalogue.
           */}
          <div className={styles.heroAplat}>
            <Motif
              teinte={teinteDepuisThemes(vedette?.themes)}
              place="plein"
              hero
              rayon="0"
              className={styles.heroAplatMotif}
            />

            {vedette?.couverture ? (
              <Couverture
                langue={langue}
                url={vedette.couverture.mise_en_avant}
                largeur={600}
                hauteur={900}
                tailles="(max-width: 700px) 72vw, 300px"
                teinte={teinteDepuisThemes(vedette.themes)}
                alt={vedette.titre}
                // La SEULE image `eager` du site : elle est au-dessus de la
                // ligne de flottaison, et la retarder décalerait le hero.
                eager
                classeImage={styles.heroCouverture}
              />
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Bandeau de réassurance ───────────────────────────────────────── */}
      <div className={styles.reassurance}>
        <p className={styles.reassuranceTexte}>
          {traduire(langue, 'accueil.reassurance1')}{' '}
          <span className={styles.separateur} aria-hidden="true">
            ·
          </span>{' '}
          {traduire(langue, 'accueil.reassurance2')}{' '}
          <span className={styles.separateur} aria-hidden="true">
            ·
          </span>{' '}
          {traduire(langue, 'accueil.reassurance3')}
        </p>
      </div>

      {/* ── Nos contes ───────────────────────────────────────────────────── */}
      {nouveautes && nouveautes.entrees.length > 0 ? (
        <section
          id="contes"
          className={`${styles.section} ${styles.contes}`}
          aria-labelledby="titre-contes"
        >
          <div className={styles.enteteSection}>
            <h2 id="titre-contes" className={styles.titreSection}>
              {traduire(langue, 'accueil.nouveautes')}
            </h2>
            <p className={styles.sousTitreSection}>
              {traduire(langue, 'accueil.nouveautesCompte')
                .replace('{affiches}', String(nouveautes.entrees.length))
                .replace('{total}', String(nouveautes.total))}
            </p>
          </div>

          <GrilleCatalogue langue={langue} entrees={nouveautes.entrees} />

          <div className={styles.contesSuite}>
            <a className={styles.boutonSecondaire} href={`/${langue}/catalogue`}>
              {traduire(langue, 'accueil.voirTout')}
            </a>
          </div>
        </section>
      ) : null}

      {/* ── Explorez par thème ───────────────────────────────────────────── */}
      {themesVitrine.length > 0 ? (
        <section
          id="origines"
          className={`${styles.section} ${styles.traditions}`}
          aria-labelledby="titre-origines"
        >
          {/*
            LES THÈMES ONT REMPLACÉ LES TRADITIONS — migration 0071.

            La section montrait les cinq régions. Elles ne rangeaient que les
            contes : un parent venu chercher une fiche d'activités n'y trouvait
            rien, et le catalogue filtré par région lui cachait tous les
            livrets pédagogiques d'un coup. Le thème vaut pour les deux
            supports.

            L'ancre `#origines` et les classes CSS sont conservées : elles sont
            citées par la navigation et par des liens partagés, et un ancrage
            cassé est une page qui s'ouvre au mauvais endroit.
          */}
          <h2 id="titre-origines" className={styles.titreSectionPetit}>
            {traduire(langue, 'accueil.themesTitre')}
          </h2>
          <p className={styles.sousTitreSection}>{traduire(langue, 'accueil.themesIntro')}</p>

          <ul className={styles.traditionsGrille}>
            {themesVitrine.map((facette) => (
              <li key={facette.valeur}>
                {/*
                 * Chaque carte est un LIEN vers le catalogue filtré, jamais un
                 * bouton qui poserait un filtre en mémoire : le filtre vit
                 * dans l'URL, il se partage et il survit au rechargement.
                 *
                 * `encodeURIComponent` : un thème est de la saisie libre, et
                 * une espace ou une esperluette y casserait la requête.
                 */}
                <a
                  className={styles.tradition}
                  href={`/${langue}/catalogue?themes=${encodeURIComponent(facette.valeur)}`}
                  style={teintesTheme([facette.valeur])}
                >
                  <Motif
                    teinte={teinteDuTheme(facette.valeur)}
                    place="vignette"
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
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Comment ça marche ────────────────────────────────────────────── */}
      <section id="comment" className={styles.comment} aria-labelledby="titre-comment">
        <div className={styles.commentInterieur}>
          <h2 id="titre-comment" className={styles.commentTitre}>
            {traduire(langue, 'accueil.commentTitre')}
          </h2>

          <ol className={styles.etapes}>
            {([1, 2, 3] as const).map((numero) => (
              <li key={numero} className={styles.etape}>
                {/*
                 * Le numéro est décoratif : la liste est ordonnée, et un
                 * lecteur d'écran annonce déjà « élément 1 sur 3 ». L'énoncer
                 * une seconde fois ferait entendre « un, un, choisissez un
                 * conte ».
                 */}
                <span className={styles.etapeNumero} aria-hidden="true">
                  {numero}
                </span>
                <div>
                  <p className={styles.etapeTitre}>
                    {traduire(langue, `accueil.comment${String(numero)}Titre` as never)}
                  </p>
                  <p className={styles.etapeCorps}>
                    {traduire(langue, `accueil.comment${String(numero)}Corps` as never)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Les deux offres ──────────────────────────────────────────────── */}
      <section
        id="offres"
        className={`${styles.section} ${styles.offres}`}
        aria-labelledby="titre-offres"
      >
        <h2 id="titre-offres" className={styles.titreSectionPetit}>
          {traduire(langue, 'accueil.deuxFormulesTitre')}
        </h2>

        <div className={styles.offresGrille}>
          {/* ── Abonnement ─────────────────────────────────────────────── */}
          <div className={`${styles.offre} ${styles.offreAbonnement}`}>
            <div>
              <h3 className={styles.offreTitre}>{traduire(langue, 'offres.abonnementTitre')}</h3>
              <p className={styles.offreSousTitre}>
                {traduire(langue, 'accueil.abonnementSousTitre')}
              </p>
            </div>

            {/*
             * Le prix ne s'affiche QUE si l'abonnement est ouvert. Au
             * lancement il ne l'est pas, et annoncer un montant pour une
             * formule qu'on ne peut pas souscrire est une promesse en l'air.
             */}
            {abonnement ? (
              <p className={styles.offrePrix}>
                {abonnement.affichage}{' '}
                <span className={styles.offrePrixUnite}>
                  {traduire(langue, 'offres.abonnementParPeriode').replace(
                    '{periode}',
                    abonnement.periode,
                  )}
                </span>
              </p>
            ) : (
              <p className={styles.offreSousTitre}>
                {traduire(langue, 'offres.abonnementFermeTitre')}
              </p>
            )}

            <ul className={styles.offreListe}>
              {(['1', '2', '3'] as const).map((rang) => (
                <li key={rang}>
                  <span className={styles.coche} aria-hidden="true">
                    ✓
                  </span>
                  {traduire(langue, `accueil.abonnementAvantage${rang}` as never)}
                </li>
              ))}
            </ul>

            <div className={styles.offreAction}>
              <a className={styles.boutonPrimaire} href={`/${langue}/offres`}>
                {traduire(langue, 'accueil.enSavoirPlus')}
              </a>
            </div>
          </div>

          {/* ── Achat à l'unité ────────────────────────────────────────── */}
          <div className={styles.offre}>
            <div>
              <h3 className={styles.offreTitre}>{traduire(langue, 'offres.achatTitre')}</h3>
              <p className={styles.offreSousTitre}>{traduire(langue, 'accueil.achatSousTitre')}</p>
            </div>

            {offres ? (
              <p className={styles.offrePrix}>
                {offres.achat_unite.affichage}{' '}
                <span className={styles.offrePrixUnite}>
                  {traduire(langue, 'accueil.achatUnite')}
                </span>
              </p>
            ) : null}

            <ul className={styles.offreListe}>
              {(['1', '2', '3'] as const).map((rang) => (
                <li key={rang}>
                  <span className={styles.coche} aria-hidden="true">
                    ✓
                  </span>
                  {traduire(langue, `accueil.achatAvantage${rang}` as never)}
                </li>
              ))}
            </ul>

            <div className={styles.offreAction}>
              <a className={styles.boutonSecondaire} href={`/${langue}/catalogue`}>
                {traduire(langue, 'accueil.actionCatalogue')}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
