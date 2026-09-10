import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { LANGUES_INTERFACE, langueValide, traduire, type CleTraduction } from '@/i18n';
import { LOGO_ASSOCIATION, lirePresentationAssociation } from '@/content/association';
import { lireContenuAssociatif, lireContenusAssociatifs } from '@/lib/association/service';
import { identifierAppelantAvecCookies } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/config/env';
import { Erreur } from '@/components/etats';
import { CarteContenu, imageDuContenu } from '@/components/v2/carte-association';
import styles from '@/components/v2/association.module.css';
import boutique from '@/components/v2/boutique.module.css';

/**
 * UN CONTENU DE L'ASSOCIATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE PAGE N'EST PAS FIGÉE AU BUILD, ET ELLE NE PEUT PAS L'ÊTRE.        │
 * │                                                                          │
 * │ Le blog qu'elle remplace employait `generateStaticParams` : son contenu  │
 * │ était le même pour tout le monde. Ici, la MOITIÉ de la page dépend de    │
 * │ qui la demande — un adhérent voit le corps, un visiteur voit un mur.     │
 * │ Une page mise en cache servirait à l'un ce qui est réservé à l'autre.    │
 * │                                                                          │
 * │ Ce coût est assumé : c'est celui d'un contenu payant.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CORPS N'ARRIVE MÊME PAS JUSQU'ICI QUAND IL EST FERMÉ.                │
 * │                                                                          │
 * │ Ce n'est pas cet écran qui masque le texte : `association_contenu` rend  │
 * │ `corps` à `null` quand `can_read` est faux, et la colonne n'est de toute │
 * │ façon accordée à aucun rôle de navigateur. Masquer à l'affichage —       │
 * │ envoyer le texte puis le cacher en CSS — est le défaut classique de ces  │
 * │ murs, et il se contourne avec la vue « source ».                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string; slug: string }>;
}

/**
 * Combien de contenus la rangée « À lire ensuite » propose.
 *
 * Trois, parce que c'est ce qui tient sur une ligne de la grille sans la
 * casser, et parce qu'une fin d'article n'est pas un second sommaire : le
 * lien « Tous les contenus » reste en dessous pour qui veut la liste entière.
 */
const NOMBRE_A_LIRE_ENSUITE = 3;

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const { langue: langueBrute, slug } = await params;
  const langue = langueValide(langueBrute);

  /*
   * Les métadonnées sont lues EN VISITEUR — `null` plutôt que l'appelant.
   *
   * Titre et chapeau sont publics par construction : ce sont eux qui donnent
   * envie d'adhérer, et la migration 0069 les accorde à `anon`. Les lire au nom
   * du lecteur connecté ne changerait rien à ce qu'elles contiennent, mais
   * ferait dépendre une balise indexable de l'identité de qui la demande.
   */
  const contenu = await lireContenuAssociatif(null, slug, { langue }).catch(() => null);

  if (!contenu) return { title: traduire(langue, 'pages.introuvableTitre') };

  const base = getServerEnv().NEXT_PUBLIC_APP_URL;

  return {
    title: contenu.titre,
    description: contenu.chapeau,
    alternates: {
      canonical: `${base}/${langue}/association/${contenu.slug}`,
      // Sans `hreflang`, les deux versions d'un même contenu se font
      // concurrence dans les moteurs, qui n'en indexent qu'une (§5.4).
      languages: Object.fromEntries(
        LANGUES_INTERFACE.map((code) => [code, `${base}/${code}/association/${contenu.slug}`]),
      ),
    },
    openGraph: { title: contenu.titre, description: contenu.chapeau, type: 'article' },
  };
}

export default async function PageContenuAssociatif({ params }: Parametres) {
  const { langue: langueBrute, slug } = await params;
  const langue = langueValide(langueBrute);

  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ DEUX LECTURES, ET UNE SEULE PEUT ABATTRE LA PAGE.                    │
   * │                                                                      │
   * │ Le détail commande : sans lui il n'y a pas d'article à montrer. La   │
   * │ rangée « À lire ensuite » est un accessoire — si elle échoue, elle   │
   * │ se retire toute seule et l'article se lit quand même. Les enchaîner  │
   * │ ferait dépendre un texte payé d'une requête de suggestion.           │
   * │                                                                      │
   * │ `Promise.all` et non deux `await` de suite : les deux requêtes ne se │
   * │ dépendent pas, et les mettre à la queue doublerait l'attente sur la  │
   * │ connexion lente qui est la condition réelle d'une partie du public.  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const [detail, voisins] = await Promise.all([
    lireContenuAssociatif(appelant?.id ?? null, slug, { langue }).then(
      (valeur) => ({ ok: true as const, valeur }),
      () => ({ ok: false as const, valeur: null }),
    ),
    lireContenusAssociatifs(appelant?.id ?? null, { langue }).catch(() => []),
  ]);

  if (!detail.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const contenu = detail.valeur;

  // Un slug inconnu est un 404, jamais une page vide : une page qui répond
  // 200 sur une adresse qui n'existe pas se fait indexer telle quelle.
  if (!contenu) notFound();

  const categorie = traduire(langue, `v2.cat_${contenu.categorie}` as CleTraduction);
  const presentation = lirePresentationAssociation(langue);

  /*
   * L'article courant s'exclut de sa propre rangée : se proposer à soi-même
   * est un lien qui ne mène nulle part, et il occuperait la place d'un autre.
   */
  const aLireEnsuite = voisins
    .filter((voisin) => voisin.slug !== contenu.slug)
    .slice(0, NOMBRE_A_LIRE_ENSUITE);

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE LOGO ET LE BOUTON D'ADHÉSION N'APPARAISSENT QU'UNE FOIS.          │
   * │                                                                      │
   * │ Sur un contenu fermé, c'est le MUR qui les porte : il est déjà       │
   * │ l'appel à adhérer, à l'endroit exact où la lecture s'arrête. Ajouter │
   * │ un second panneau en dessous ferait deux fois la même demande sur un │
   * │ écran qui n'a rien donné à lire.                                     │
   * │                                                                      │
   * │ Sur un contenu ouvert, le mur n'existe pas — le panneau prend donc   │
   * │ sa place, après le texte, quand le lecteur a vu ce que l'association │
   * │ produit.                                                             │
   * │                                                                      │
   * │ `contenu.sections` est LU, jamais déduit : c'est la base qui rend le │
   * │ corps à `null` quand le droit est fermé. Cet écran ne compare aucun  │
   * │ abonnement — `frontend-architecture` l'interdit.                     │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const logo = (
    <img
      className={styles.murLogo}
      src={`/images/association/${LOGO_ASSOCIATION.fichier}`}
      alt={presentation.logoAlt}
      width={LOGO_ASSOCIATION.largeur}
      height={LOGO_ASSOCIATION.hauteur}
      loading="lazy"
      decoding="async"
    />
  );

  return (
    <>
      <div className={boutique.banniere} data-banniere>
        <div className={boutique.banniereInterieur}>
          <span className={boutique.oeil}>{categorie}</span>
          <h1 className={boutique.banniereTitre}>{contenu.titre}</h1>
          <p className={boutique.banniereTexte}>{contenu.chapeau}</p>
        </div>
      </div>

      {/*
        ── LA PHOTO DE L'ARTICLE ──────────────────────────────────────────

        Elle est DÉCORATIVE — `alt=""` — parce que le titre et le chapeau
        viennent d'être écrits juste au-dessus, dans le bandeau. Lui donner
        un `alt` ferait entendre le titre une troisième fois, annoncé comme
        une image.

        `eager` : c'est le premier élément sous le bandeau, celui qu'on
        regarde en arrivant. Le différer ferait un trou à cet endroit précis,
        puis un saut du texte quand l'image arrive — exactement ce qu'on
        cherche à éviter sur la connexion lente du §5.1.

        Le repli par catégorie garantit qu'un contenu sans image ne laisse
        pas un cadre vide : `imageDuContenu` est la même table que celle des
        cartes, si bien que la vignette de la liste et la photo de l'article
        ne peuvent pas montrer deux images différentes.
      */}
      <div className={styles.photo}>
        <img
          src={imageDuContenu(contenu)}
          alt=""
          loading="eager"
          decoding="async"
        />
      </div>

      <article className={styles.article}>
        <p className={styles.meta} style={{ marginBottom: '32px' }}>
          {contenu.publieLe ? (
            <time dateTime={contenu.publieLe.slice(0, 10)}>
              {new Date(contenu.publieLe).toLocaleDateString(langue, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                // `UTC` explicite : sans lui, une date à minuit recule d'un jour
                // pour tout lecteur à l'ouest de Greenwich.
                timeZone: 'UTC',
              })}
            </time>
          ) : null}

          {contenu.minutes ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {traduire(langue, 'v2.assoMinutes').replace('{minutes}', String(contenu.minutes))}
              </span>
            </>
          ) : null}

          {contenu.peutLire ? null : (
            <>
              <span aria-hidden="true">·</span>
              <span className={styles.reserve}>
                <span className={styles.cadenas} aria-hidden="true">
                  🔒
                </span>
                {traduire(langue, 'v2.assoReserve')}
              </span>
            </>
          )}
        </p>

        {/* ── Le corps, quand le droit est ouvert ───────────────────────── */}
        {contenu.sections ? (
          <div className={styles.corps}>
            {contenu.sections.map((section) => (
              <section key={section.titre}>
                <h2>{section.titre}</h2>

                {section.paragraphes?.map((paragraphe) => (
                  <p key={paragraphe}>{paragraphe}</p>
                ))}

                {section.points ? (
                  <ul>
                    {section.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        ) : (
          /*
           * ── LE MUR ────────────────────────────────────────────────────────
           *
           * Il vient APRÈS le titre et le chapeau, jamais à leur place : le
           * lecteur doit savoir ce qu'il n'a pas encore lu avant qu'on lui
           * propose d'adhérer.
           *
           * Deux portes, et l'ordre compte. Un visiteur non connecté est
           * peut-être DÉJÀ adhérent sur un autre appareil : lui proposer
           * d'abord de payer lui ferait acheter deux fois.
           */
          <div className={styles.mur}>
            {logo}
            <h2 className={styles.murTitre}>{traduire(langue, 'v2.assoMurTitre')}</h2>
            <p className={styles.murTexte}>{traduire(langue, 'v2.assoMurTexte')}</p>

            <p className={styles.murActions}>
              {appelant ? null : (
                /* Sans paramètre de retour : l'écran de connexion n'en honore
                   aucun, et en inventer un ici produirait un lien qui promet un
                   retour que rien ne fait. */
                <a className={styles.boutonSecondaire} href={`/${langue}/connexion`}>
                  {traduire(langue, 'v2.assoMurConnexion')}
                </a>
              )}

              <a
                className={styles.bouton}
                href={`/${langue}/abonnement/souscrire?domaine=association`}
              >
                {traduire(langue, 'v2.assoMurAdherer')}
              </a>
            </p>
          </div>
        )}

        {/*
          ── REJOINDRE L'ASSOCIATION ───────────────────────────────────────

          Il ne s'affiche QUE sous un contenu ouvert : sous un contenu fermé,
          le mur ci-dessus porte déjà le logo et le bouton.

          Le lien mène au TUNNEL, avec le domaine dans l'adresse. Aucun
          montant n'est écrit ici : les formules et leurs prix viennent de la
          base, et le tunnel les lit à la zone d'encaissement réelle. Le
          domaine `association` n'est pas décoratif — les deux abonnements
          sont étanches, et celui de lecture n'ouvrirait pas cet espace.
        */}
        {contenu.sections ? (
          <div className={styles.mur}>
            {logo}
            <h2 className={styles.murTitre}>{presentation.appel.titre}</h2>
            <p className={styles.murTexte}>{presentation.appel.texte}</p>
            <p className={styles.murActions}>
              <a
                className={styles.bouton}
                href={`/${langue}/abonnement/souscrire?domaine=association`}
              >
                {presentation.appel.action}
              </a>
            </p>
          </div>
        ) : null}

        <a className={styles.retour} href={`/${langue}/association`}>
          <span aria-hidden="true">←</span>
          {traduire(langue, 'v2.assoRetour')}
        </a>
      </article>

      {/*
        ── À LIRE ENSUITE ──────────────────────────────────────────────────

        Elle sort de l'`<article>`, et c'est voulu : ces cartes ne font pas
        partie du texte qu'on vient de lire. Les laisser dedans les ferait
        entrer dans le contenu de l'article pour un lecteur d'écran comme
        pour un moteur.

        La rangée disparaît d'elle-même quand il n'y a rien à proposer — sur
        un espace qui ne porte qu'un seul contenu, notamment. Un titre suivi
        d'une grille vide aurait l'air d'une panne.

        Les cadenas y sont ceux de chaque contenu, LUS comme ailleurs : un
        visiteur voit donc ici ce qui lui reste fermé, ce qui est précisément
        ce qui donne envie d'adhérer.
      */}
      {aLireEnsuite.length > 0 ? (
        <section className={styles.suite} aria-labelledby="a-lire-ensuite">
          <h2 className={styles.suiteTitre} id="a-lire-ensuite">
            {traduire(langue, 'v2.assoSuiteTitre')}
          </h2>

          <ul className={styles.liste}>
            {aLireEnsuite.map((voisin) => (
              <li key={voisin.slug}>
                <CarteContenu langue={langue} contenu={voisin} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
