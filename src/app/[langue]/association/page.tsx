import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { langueValide, traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import {
  lirePresentationAssociation,
  LOGO_ASSOCIATION,
  VIDEO_PRESENTATION,
} from '@/content/association';
import {
  lireContenusAssociatifs,
  type ContenuAssociatif,
} from '@/lib/association/service';
import { identifierAppelant } from '@/lib/auth/session';
import { Erreur } from '@/components/etats';
import { Revele } from '@/components/v2/revele';
import styles from '@/components/v2/association.module.css';
import boutique from '@/components/v2/boutique.module.css';

/**
 * L'ESPACE DE L'ASSOCIATION DAVE — §3.6, en remplacement du blog.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX SOURCES SUR UN SEUL ÉCRAN, ET C'EST LA DÉCISION DU 3 SEPTEMBRE.    │
 * │                                                                          │
 * │ La PRÉSENTATION vient d'un fichier versionné (`src/content/association`) │
 * │ — elle change deux fois par an, doit être relue en revue de code et      │
 * │ s'afficher sans requête.                                                 │
 * │                                                                          │
 * │ Les CONTENUS viennent de la base — ils se publient au fil de l'eau       │
 * │ depuis `/admin/association`, et surtout ils portent un DROIT D'ACCÈS.    │
 * │ Un droit se garde là où RLS et les privilèges de colonne le protègent.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CADENAS EST LU, JAMAIS DÉDUIT.                                       │
 * │                                                                          │
 * │ `peutLire` vient d'`access_for_association`, qui appelle                 │
 * │ `abonnement_ouvre_droit(user, 'association')`. Cet écran ne compare      │
 * │ jamais `acces` à l'état d'un abonnement : il afficherait alors une       │
 * │ seconde règle d'accès, et c'est exactement ce que le test               │
 * │ `frontend-architecture` interdit.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  const presentation = lirePresentationAssociation(langue);
  return { title: presentation.titre, description: presentation.chapeau };
}

const IMAGE_PAR_CATEGORIE: Record<ContenuAssociatif['categorie'], string> = {
  'vie-associative': '/images/blog-4.png',
  actions: '/images/blog-4.png',
  accompagnement: '/images/blog-1.png',
  pedagogie: '/images/blog-2.png',
  culture: '/images/blog-3.png',
  'besoins-specifiques': '/images/blog-1.png',
};

function CarteContenu({
  langue,
  contenu,
  vedette = false,
}: {
  langue: LangueInterface;
  contenu: ContenuAssociatif;
  vedette?: boolean;
}): ReactNode {
  const categorie = traduire(langue, `v2.cat_${contenu.categorie}` as CleTraduction);
  const image = contenu.imageUrl ?? IMAGE_PAR_CATEGORIE[contenu.categorie];

  const corps = (
    <>
      <span className={styles.categorie}>{categorie}</span>

      <span className={vedette ? `${styles.titre} ${styles.titreVedette}` : styles.titre}>
        {contenu.titre}
      </span>

      <span className={styles.chapeau}>{contenu.chapeau}</span>

      <span className={styles.meta}>
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
      </span>

      {/*
        La pastille n'apparaît que sur ce qui est FERMÉ À CE LECTEUR. Un
        adhérent ne voit aucun cadenas, parce que `peutLire` est vrai pour lui —
        et c'est la base qui l'a dit.
      */}
      {contenu.peutLire ? null : (
        <span className={styles.reserve}>
          <span className={styles.cadenas} aria-hidden="true">
            🔒
          </span>
          {traduire(langue, 'v2.assoReserve')}
        </span>
      )}

      <span className={styles.lire}>
        {traduire(langue, 'v2.assoLire')}
        <span className={styles.fleche} aria-hidden="true">
          →
        </span>
      </span>
    </>
  );

  const lien = `/${langue}/association/${contenu.slug}`;

  if (vedette) {
    return (
      <a className={styles.carteVedette} href={lien}>
        <span className={styles.vedetteVisuel}>
          <img
            src={image}
            alt={contenu.titre}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </span>
        <span className={styles.vedetteCorps}>{corps}</span>
      </a>
    );
  }

  return (
    <a className={styles.carte} href={lien}>
      <span className={styles.carteVisuel}>
        <img
          src={image}
          alt={contenu.titre}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </span>
      <span className={styles.carteCorps}>{corps}</span>
    </a>
  );
}

export default async function PageAssociation({ params }: Parametres) {
  const langue = langueValide((await params).langue);
  const presentation = lirePresentationAssociation(langue);

  // Un visiteur non connecté est le chemin nominal : `identifierAppelant` rend
  // `null`, et la base rend alors le verdict `preview` sur ce qui est réservé.
  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );

  let contenus;
  try {
    contenus = await lireContenusAssociatifs(appelant?.id ?? null, { langue });
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  const [premier, ...suite] = contenus;

  return (
    <>
      <div className={boutique.banniere} data-banniere>
        <div className={boutique.banniereInterieur}>
          <span className={boutique.oeil}>{presentation.oeil}</span>
          <h1 className={boutique.banniereTitre}>{presentation.titre}</h1>
          <p className={boutique.banniereTexte}>{presentation.chapeau}</p>
        </div>
      </div>

      {/* ── La présentation, versionnée ─────────────────────────────────── */}
      <div className={boutique.page}>
        {/*
          Le logo porte déjà le nom et la devise, mais en pixels. La devise est
          donc RÉPÉTÉE en dessous, en texte : elle est ainsi traduite, agrandie
          avec le reste de la page, et lue par un lecteur d'écran.

          `width` et `height` sont ceux du fichier : ils réservent la place
          avant que l'image arrive, ce qui évite que le texte saute sous les
          yeux d'un lecteur sur réseau lent.
        */}
        <div className={styles.identite}>
          <img
            className={styles.logo}
            src={`/images/association/${LOGO_ASSOCIATION.fichier}`}
            alt={presentation.logoAlt}
            width={LOGO_ASSOCIATION.largeur}
            height={LOGO_ASSOCIATION.hauteur}
          />
          <p className={styles.devise}>{presentation.devise}</p>
        </div>

        <div className={styles.presentation}>
          {presentation.sections.map((section) => (
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

        {/*
          ── La vidéo de présentation ─────────────────────────────────────

          `preload="none"` : rien ne descend tant que le visiteur n'a pas
          appuyé. §5.1 — une part importante du public est sur réseau mobile
          lent, et une vidéo qui se charge d'elle-même dépense un forfait que
          personne n'a engagé.

          `playsInline` : sans lui, Safari sur iPhone passe en plein écran dès
          la lecture et arrache le visiteur à la page.
        */}
        <figure className={styles.video}>
          <video
            className={styles.lecteur}
            controls
            preload="none"
            playsInline
            poster={`/images/association/${VIDEO_PRESENTATION.affiche}`}
          >
            <source
              src={`/images/association/${VIDEO_PRESENTATION.fichier}`}
              type="video/mp4"
            />
          </video>
          <figcaption className={styles.videoLegende}>{presentation.videoLegende}</figcaption>
        </figure>

        {/* ── L'appel à l'adhésion ─────────────────────────────────────── */}
        <div className={styles.mur}>
          <h2 className={styles.murTitre}>{presentation.appel.titre}</h2>
          <p className={styles.murTexte}>{presentation.appel.texte}</p>
          <p className={styles.murActions}>
            {/*
              Le lien mène au TUNNEL, avec le domaine dans l'adresse. Aucun
              montant n'est écrit ici : les formules et leurs prix viennent de
              la base, et le tunnel les lit à la zone d'encaissement réelle.
            */}
            <a
              className={styles.bouton}
              href={`/${langue}/abonnement/souscrire?domaine=association`}
            >
              {presentation.appel.action}
            </a>
          </p>
        </div>

        {/* ── Les contenus, publiés depuis l'administration ─────────────── */}
        <h2 className={styles.sectionTitre}>{traduire(langue, 'v2.assoContenusTitre')}</h2>
        <p className={styles.sectionTexte}>{traduire(langue, 'v2.assoContenusTexte')}</p>

        {contenus.length === 0 ? (
          <p className={boutique.compte}>{traduire(langue, 'v2.assoVide')}</p>
        ) : (
          <ul className={styles.liste}>
            {premier ? (
              <li className={styles.vedette}>
                <CarteContenu langue={langue} contenu={premier} vedette />
              </li>
            ) : null}

            {suite.map((contenu, rang) => (
              <li key={contenu.slug}>
                <Revele rang={rang}>
                  <CarteContenu langue={langue} contenu={contenu} />
                </Revele>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
