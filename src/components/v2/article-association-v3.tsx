import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import type {
  ContenuAssociatif,
  ContenuAssociatifDetaille,
} from '@/lib/association/service';
import { CarteContenu, imageDuContenu } from './carte-association';
import styles from './article-association-v3.module.css';

/**
 * L'ARTICLE DE L'ESPACE ADHÉRENT, EN V3.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI CHANGE EST LA FORME. LE DROIT, LUI, NE PASSE PAS PAR ICI.        │
 * │                                                                          │
 * │ `blocs` vaut `null` dès que `can_read` est faux — la BASE le décide,    │
 * │ et la colonne `corps` n'est de toute façon accordée ni à `anon` ni à     │
 * │ `authenticated` (§ privilège absent). Ce composant ne compare aucun      │
 * │ droit : il rend ce qu'on lui donne, et le mur quand on ne lui donne      │
 * │ rien. Un composant qui déciderait lui-même serait un second mur, et      │
 * │ celui-là se contournerait avec la vue « source ».                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MUR VIENT APRÈS LE TITRE ET LE CHAPEAU, JAMAIS À LEUR PLACE.         │
 * │                                                                          │
 * │ Le lecteur doit savoir ce qu'il n'a pas encore lu avant qu'on lui        │
 * │ propose d'adhérer. Un mur posé à la place du titre demande de payer      │
 * │ pour quelque chose qu'on ne lui a pas nommé.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ArticleAssociationV3({
  langue,
  contenu,
  aLireEnsuite,
}: {
  langue: LangueInterface;
  contenu: ContenuAssociatifDetaille;
  aLireEnsuite: ContenuAssociatif[];
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);
  const categorie = t(`v2.cat_${contenu.categorie}` as CleTraduction);

  return (
    <div className={styles.page}>
      {/* ── La bande de tête ─────────────────────────────────────────────── */}
      <section className={styles.bande}>
        <div className={styles.bandeContenu}>
          <a className={styles.retour} href={`/${langue}/association`}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            {t('v2.assoRetour')}
          </a>

          <span className={styles.categorie}>{categorie}</span>

          <h1 className={styles.titre}>{contenu.titre}</h1>

          {contenu.chapeau ? <p className={styles.chapeau}>{contenu.chapeau}</p> : null}

          <p className={styles.meta}>
            {contenu.publieLe ? (
              <time dateTime={contenu.publieLe.slice(0, 10)}>
                {new Date(contenu.publieLe).toLocaleDateString(langue, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  /*
                   * `UTC` explicite : sans lui, une date à minuit recule d'un
                   * jour pour tout lecteur à l'ouest de Greenwich — et une
                   * bonne part du public l'est.
                   */
                  timeZone: 'UTC',
                })}
              </time>
            ) : null}

            {contenu.minutes ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{t('v2.assoMinutes').replace('{minutes}', String(contenu.minutes))}</span>
              </>
            ) : null}

            {contenu.blocs ? null : (
              <>
                <span aria-hidden="true">·</span>
                <span className={styles.reserve}>{t('v2.assoReserve')}</span>
              </>
            )}
          </p>
        </div>
      </section>

      <article className={styles.article}>
        {/*
          La photo est DÉCORATIVE : son texte de remplacement est vide, et
          c'est voulu. Le titre juste au-dessus dit déjà de quoi l'article
          parle ; décrire l'image répéterait le titre à qui écoute la page.

          Le repli par catégorie vient de la même table que les vignettes de
          la liste : la carte et l'article ne peuvent donc pas montrer deux
          images différentes pour un même contenu.
        */}
        <img
          className={styles.photo}
          src={imageDuContenu(contenu)}
          alt=""
          loading="eager"
          decoding="async"
        />

        {contenu.blocs ? (
          <div className={styles.corps}>
            {contenu.blocs.map((bloc, rang) => {
              /*
                LA CLÉ EST LE RANG, ET C'EST L'UN DES RARES CAS OÙ IL LE FAUT.

                Deux paragraphes peuvent porter le même texte — une reprise,
                un refrain — et deux intertitres aussi. Une clé tirée du
                contenu en ferait des doublons que React refuserait de rendre.
                Les blocs ne sont ni réordonnés ni filtrés à l'affichage : le
                rang est donc stable tant que la page vit.
              */
              const cle = `${bloc.type}-${String(rang)}`;

              switch (bloc.type) {
                case 'intertitre':
                  return <h2 key={cle}>{bloc.texte}</h2>;

                case 'paragraphe':
                  return <p key={cle}>{bloc.texte}</p>;

                case 'liste':
                  return (
                    <ul key={cle}>
                      {bloc.elements.map((element) => (
                        <li key={element}>{element}</li>
                      ))}
                    </ul>
                  );

                case 'citation':
                  return (
                    <blockquote key={cle} className={styles.citation}>
                      {bloc.texte}
                    </blockquote>
                  );

                case 'photo':
                  return (
                    /*
                      `figure` et non un `div` : une image et sa légende sont
                      une unité, et c'est ce que le balisage doit dire à qui
                      écoute la page. Sans légende, pas de `figcaption` vide.
                    */
                    <figure key={cle} className={styles.figure}>
                      <img src={bloc.url} alt="" loading="lazy" decoding="async" />
                      {bloc.legende ? <figcaption>{bloc.legende}</figcaption> : null}
                    </figure>
                  );
              }
            })}
          </div>
        ) : (
          <div className={styles.mur}>
            <h2 className={styles.murTitre}>{t('v2.assoMurTitre')}</h2>
            <p className={styles.murTexte}>{t('v2.assoMurTexte')}</p>
            {/*
              DEUX ACTIONS, et la seconde n'est pas un ornement : un adhérent
              déjà inscrit qui tombe sur ce mur n'a pas besoin d'adhérer, il a
              besoin de se connecter. Sans ce lien, il repartirait en croyant
              devoir payer une seconde fois.
            */}
            <p className={styles.murActions}>
              <a className={styles.murBouton} href={`/${langue}/offres`}>
                {t('v2.assoMurAdherer')}
              </a>
              <a className={styles.murLien} href={`/${langue}/connexion`}>
                {t('v2.assoMurConnexion')}
              </a>
            </p>
          </div>
        )}
      </article>

      {aLireEnsuite.length > 0 ? (
        <section className={styles.suite}>
          <div className={styles.suiteContenu}>
            <h2 className={styles.suiteTitre}>{t('v2.assoSuiteTitre')}</h2>
            <div className={styles.suiteGrille}>
              {aLireEnsuite.map((voisin) => (
                <CarteContenu key={voisin.slug} langue={langue} contenu={voisin} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
