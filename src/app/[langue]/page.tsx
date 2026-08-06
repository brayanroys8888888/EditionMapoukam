import { headers } from 'next/headers';

import { langueValide, traduire } from '@/i18n';
import { catalogQuerySchema } from '@/domain/catalog/schemas';
import { lireFacettes, listerCatalogue } from '@/lib/catalog/repository';
import { lireOffres } from '@/lib/offers/service';
import { identifierAppelant } from '@/lib/auth/session';
import type { RegionConte } from '@/domain/catalog/types';
import { GrilleCatalogue, teintesRegion } from '@/components/catalogue';
import { Couverture } from '@/components/catalogue/couverture';
import { Motif } from '@/components/motif';
import { AccueilV2 } from '@/components/v2/accueil';
import { versionDesign } from '@/design/version';
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

/** Ordre d'affichage des traditions — celui des maquettes, d'ouest en est. */
const ORDRE_REGIONS: RegionConte[] = [
  'afrique_ouest',
  'sahel',
  'afrique_centrale',
  'afrique_australe',
  'afrique_est',
];

export default async function Accueil({ params }: { params: Promise<{ langue: string }> }) {
  const langue = langueValide((await params).langue);

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ TROIS LECTURES INDÉPENDANTES, ET AUCUNE NE PEUT ABATTRE LA PAGE.      │
  // │                                                                        │
  // │ Une vitrine qui tombe parce que la base tousse est pire qu'une vitrine │
  // │ sans mise en avant. Chaque bloc absent se retire tout seul ; le hero,  │
  // │ lui, s'affiche toujours.                                               │
  // │                                                                        │
  // │ `Promise.all` et non trois `await` de suite : les trois requêtes ne se │
  // │ dépendent pas, et les enchaîner tripleraient le temps d'attente sur la │
  // │ connexion lente qui est la condition réelle d'une partie du public.    │
  // └────────────────────────────────────────────────────────────────────────┘
  const [nouveautes, facettes, offres] = await Promise.all([
    listerCatalogue(
      appelant?.id ?? null,
      catalogQuerySchema.parse({ langue, tri: 'nouveautes', taille: NOMBRE_NOUVEAUTES }),
    ).catch(() => null),
    lireFacettes(langue).catch(() => null),
    // Zone d'AFFICHAGE seulement. La zone d'encaissement est déterminée au
    // paiement, depuis le pays réel du moyen de paiement.
    lireOffres('international').catch(() => null),
  ]);

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LES DEUX DIRECTIONS PARTAGENT LES MÊMES DONNÉES.                      │
  // │                                                                        │
  // │ Le chargement ci-dessus — nouveautés, facettes, offres — est fait UNE   │
  // │ fois, avant de choisir la mise en page. C'est ce qui garantit que la   │
  // │ V2 ne dérive pas : elle ne peut afficher que ce que la V1 affiche,     │
  // │ puisqu'elle reçoit exactement le même objet.                           │
  // └────────────────────────────────────────────────────────────────────────┘
  if (versionDesign() === 'v2') {
    return (
      <AccueilV2
        langue={langue}
        nouveautes={nouveautes}
        facettes={facettes}
        // L'ajout au panier est une Server Action LIÉE au titre : un `GET` qui
        // modifie un panier serait rejoué par le moindre préchargement.
        actionAjout={(livreId) => ajouterAuPanier.bind(null, langue, livreId, langue)}
      />
    );
  }

  const vedette = nouveautes?.entrees[0] ?? null;
  const traditions = ORDRE_REGIONS.map((region) => ({
    region,
    nombre: facettes?.regions.find((facette) => facette.valeur === region)?.nombre ?? 0,
  })).filter((tradition) => tradition.nombre > 0);

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
           * L'aplat porte la couleur du conte mis en avant, jamais une teinte
           * choisie une fois pour toutes : le hero change avec le catalogue.
           */}
          <div className={styles.heroAplat}>
            <Motif
              region={vedette?.region ?? 'afrique_ouest'}
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
                region={vedette.region}
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

      {/* ── D'où viennent ces contes ─────────────────────────────────────── */}
      {traditions.length > 0 ? (
        <section
          id="origines"
          className={`${styles.section} ${styles.traditions}`}
          aria-labelledby="titre-origines"
        >
          <h2 id="titre-origines" className={styles.titreSectionPetit}>
            {traduire(langue, 'accueil.traditionsTitre')}
          </h2>
          <p className={styles.sousTitreSection}>{traduire(langue, 'accueil.traditionsIntro')}</p>

          <ul className={styles.traditionsGrille}>
            {traditions.map(({ region, nombre }) => (
              <li key={region}>
                {/*
                 * Chaque carte est un LIEN vers le catalogue filtré, jamais un
                 * bouton qui poserait un filtre en mémoire : le filtre vit
                 * dans l'URL, il se partage et il survit au rechargement.
                 */}
                <a
                  className={styles.tradition}
                  href={`/${langue}/catalogue?region=${region}`}
                  style={teintesRegion(region)}
                >
                  <Motif region={region} place="vignette" className={styles.traditionMotif} />
                  <p className={styles.traditionNom}>{traduire(langue, `regions.${region}`)}</p>
                  <p className={styles.traditionCompte}>
                    {nombre === 1
                      ? traduire(langue, 'accueil.traditionsCompteUn')
                      : traduire(langue, 'accueil.traditionsCompte').replace(
                          '{nombre}',
                          String(nombre),
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
