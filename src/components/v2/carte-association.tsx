import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import type { ContenuAssociatif } from '@/lib/association/service';

import styles from './association.module.css';

/**
 * LA CARTE D'UN CONTENU ASSOCIATIF, ÉCRITE UNE SEULE FOIS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI ELLE A QUITTÉ L'ÉCRAN DE LISTE.                                │
 * │                                                                          │
 * │ Elle y vivait en fonction locale, ce qui allait tant qu'un seul écran    │
 * │ affichait des cartes. L'écran de détail en affiche désormais lui aussi,  │
 * │ sous « À lire ensuite » — et la recopier aurait donné deux cartes qui    │
 * │ se ressemblent le jour de leur écriture, puis divergent à la première    │
 * │ retouche faite d'un seul côté.                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * L'image par défaut d'un contenu qui n'en porte pas, par catégorie.
 *
 * C'est un REPLI décoratif, pas une donnée : la base porte `image_url`, et
 * cette table ne sert qu'à ce qu'une carte sans image ne laisse pas un trou.
 * Elle est ici plutôt que dans trois fichiers — l'écran de liste, l'écran
 * Organic et l'écran de détail — parce qu'une catégorie ajoutée d'un seul
 * côté ferait trois listes qui ne montrent pas la même chose.
 */
export const IMAGE_PAR_CATEGORIE: Record<ContenuAssociatif['categorie'], string> = {
  'vie-associative': '/images/blog-4.png',
  actions: '/images/blog-4.png',
  accompagnement: '/images/blog-1.png',
  pedagogie: '/images/blog-2.png',
  culture: '/images/blog-3.png',
  'besoins-specifiques': '/images/blog-1.png',
};

/** L'image à servir pour un contenu : la sienne, ou le repli de sa catégorie. */
export function imageDuContenu(contenu: {
  imageUrl: string | null;
  categorie: ContenuAssociatif['categorie'];
}): string {
  return contenu.imageUrl ?? IMAGE_PAR_CATEGORIE[contenu.categorie];
}

export function CarteContenu({
  langue,
  contenu,
  vedette = false,
}: {
  langue: LangueInterface;
  contenu: ContenuAssociatif;
  vedette?: boolean;
}): ReactNode {
  const categorie = traduire(langue, `v2.cat_${contenu.categorie}` as CleTraduction);
  const image = imageDuContenu(contenu);

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
          {/*
           * `alt=""` : le titre est écrit dans le corps de la carte, et la
           * carte entière est le lien. Répéter le titre dans l'image ferait
           * annoncer « image, Le Lion et le Baobab — lien, Le Lion et le
           * Baobab » sur chaque vignette de la liste.
           */}
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
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
        {/* Décorative, pour la même raison que la carte vedette ci-dessus. */}
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </span>
      <span className={styles.carteCorps}>{corps}</span>
    </a>
  );
}
