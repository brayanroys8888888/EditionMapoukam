import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { FicheLivre } from '@/domain/catalog/types';
import { teintesRegion } from '@/components/catalogue';
import { Couverture, SubstitutCouverture } from '@/components/catalogue/couverture';
import { Motif } from '@/components/motif';
import styles from './fiche.module.css';

/**
 * FICHE D'UN CONTE — §4.1 F3, et §C des maquettes.
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
 * │                                                                          │
 * │ Un test d'architecture échoue si un composant de ce dossier compare      │
 * │ `reason` à proximité d'un téléchargement.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUTE LA PAGE PORTE LA COULEUR DE LA TRADITION DU CONTE.                │
 * │                                                                          │
 * │ Les quatre variables `--carte-*` sont posées une fois, sur le conteneur  │
 * │ de page, par `teintesRegion`. Aucun bloc ne choisit sa couleur : ils la  │
 * │ lisent tous. C'est ce qui garantit qu'un conte du Sahel ne présente      │
 * │ jamais un bouton vert d'Afrique de l'Ouest.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════════════════════════
// FIL D'ARIANE
// ═══════════════════════════════════════════════════════════════════════════

export function FilAriane({
  langue,
  fiche,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
}): ReactNode {
  return (
    <nav className={styles.ariane} aria-label={traduire(langue, 'catalogue.titre')}>
      <a href={`/${langue}/catalogue`}>{traduire(langue, 'navigation.catalogue')}</a>

      {fiche.region ? (
        <>
          <span aria-hidden="true">›</span>
          {/*
           * La tradition est le seul lien coloré du fil, et c'est délibéré :
           * c'est le filtre qu'un lecteur venu d'un conte veut le plus
           * souvent poser ensuite.
           */}
          <a className={styles.arianeRegion} href={`/${langue}/catalogue?region=${fiche.region}`}>
            {traduire(langue, `regions.${fiche.region}`)}
          </a>
        </>
      ) : null}

      <span aria-hidden="true">›</span>
      {/* Le titre courant n'est pas un lien : il mènerait à la page où l'on est. */}
      <span className={styles.arianeCourant} aria-current="page">
        {fiche.titre}
      </span>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COLONNE GAUCHE — COUVERTURE ET EXTRAIT
// ═══════════════════════════════════════════════════════════════════════════

export function ColonneCouverture({
  langue,
  fiche,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
}): ReactNode {
  return (
    <div className={styles.colonneGauche}>
      {fiche.couverture ? (
        // La taille « fiche » (800 px) est ICI légitime : une seule image par
        // page, et c'est l'argument de vente principal de l'écran. La grille,
        // elle, n'a droit qu'à la vignette.
        <Couverture
          langue={langue}
          url={fiche.couverture.fiche}
          largeur={800}
          hauteur={1200}
          tailles="(max-width: 820px) 90vw, 380px"
          region={fiche.region}
          // Le titre est écrit en `h1` juste à côté : le répéter dans l'`alt`
          // ferait entendre deux fois la même phrase.
          alt=""
          classeImage={styles.couverture}
        />
      ) : (
        <SubstitutCouverture langue={langue} region={fiche.region} />
      )}

      {/*
       * Le bouton d'extrait ne paraît QUE pour qui n'a pas encore le droit de
       * lire en entier : proposer « lire l'extrait » à un abonné, c'est lui
       * proposer moins que ce qu'il a déjà payé.
       */}
      {!fiche.acces.canRead && fiche.pages_extrait > 0 ? (
        <a className={styles.boutonTradition} href={`/${langue}/lire/${fiche.slug}`}>
          {traduire(langue, 'fiche.lireExtraitPages').replace(
            '{pages}',
            String(fiche.pages_extrait),
          )}
        </a>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EN-TÊTE DE LA COLONNE DROITE
// ═══════════════════════════════════════════════════════════════════════════

export function EnteteFiche({
  langue,
  fiche,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
}): ReactNode {
  return (
    <header>
      {/*
       * La pastille dit l'ORIGINE ÉDITORIALE — « conte akan — Ghana » — quand
       * elle existe, et la région sinon. Les deux champs sont distincts :
       * `origine_culturelle` porte la finesse, `region` porte la couleur.
       */}
      {fiche.region ? (
        <p className={styles.pastilleOrigine}>
          <span className={styles.puceOrigine} aria-hidden="true" />
          {fiche.origine_culturelle ?? traduire(langue, `regions.${fiche.region}`)}
        </p>
      ) : null}

      <h1 className={styles.titre}>{fiche.titre}</h1>

      <p className={styles.metaLigne}>
        <span>
          {traduire(langue, 'fiche.auteur')} <strong>{fiche.auteur}</strong>
        </span>

        {fiche.illustrateur ? (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {traduire(langue, 'fiche.illustrateur')} <strong>{fiche.illustrateur}</strong>
            </span>
          </>
        ) : null}

        {fiche.nb_pages !== null ? (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {traduire(langue, 'catalogue.nbPages').replace('{pages}', String(fiche.nb_pages))}
            </span>
          </>
        ) : null}
      </p>

      {/*
       * DEUX pastilles d'âge, et non une tranche.
       *
       * C'est la distinction utile aux parents, et elle n'est pas cosmétique :
       * un conte s'écoute des années avant de se lire seul. `age_min` porte
       * l'écoute, `age_max` la lecture autonome — les deux valeurs de la base,
       * jamais un écart inventé ici.
       */}
      {fiche.age_min !== null || fiche.age_max !== null ? (
        <div className={styles.ages}>
          {fiche.age_min !== null ? (
            <p className={`${styles.age} ${styles.ageEcoute}`}>
              <span className={styles.pastilleRonde} aria-hidden="true" />
              {traduire(langue, 'fiche.ageEcoute').replace('{age}', String(fiche.age_min))}
            </p>
          ) : null}

          {fiche.age_max !== null ? (
            <p className={`${styles.age} ${styles.ageSeul}`}>
              <span className={styles.pastilleCarree} aria-hidden="true" />
              {traduire(langue, 'fiche.ageSeul').replace('{age}', String(fiche.age_max))}
            </p>
          ) : null}
        </div>
      ) : null}

      {fiche.resume ? <p className={styles.resume}>{fiche.resume}</p> : null}
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOC D'ACTION — LES TROIS VARIANTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ce que le lecteur peut faire, et ce qu'on lui explique de ce qu'il ne peut pas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CAS QUI COMPTE : L'ABONNÉ.                                           │
 * │                                                                          │
 * │ Il a `canRead: true` et `canDownload: false`. Aucun bouton de            │
 * │ téléchargement ne doit paraître — et surtout, l'écran doit DIRE pourquoi │
 * │ et comment l'obtenir. Sans cette phrase, l'absence du bouton se lit      │
 * │ comme une panne, et le client écrit au support au lieu d'acheter.        │
 * │                                                                          │
 * │ La maquette porte les deux boutons côte à côte dans ce cas — « Lire en   │
 * │ ligne » ET « Acheter pour télécharger ». La séparation lecture /         │
 * │ téléchargement y est donc déjà tenue, et il ne faut surtout pas la       │
 * │ simplifier en reconstruisant le bloc.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ActionsFiche({
  langue,
  fiche,
  actionAjout,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
  /**
   * Ajout au panier — une Server Action, jamais un lien.
   *
   * Un `GET` qui modifie un panier est rejoué par le moindre préchargement de
   * navigateur, et par tout robot qui suit les liens de la page.
   */
  actionAjout?: (donnees: FormData) => void | Promise<void>;
}): ReactNode {
  const { canRead, canDownload } = fiche.acces;
  const achetable = Boolean(fiche.prix) && !canDownload && actionAjout !== undefined;

  return (
    <section className={styles.action} aria-label={traduire(langue, 'acces.lireEnLigne')}>
      {/* ── L'étiquette, quand il y a un droit à annoncer ────────────────── */}
      {canDownload ? (
        <p className={styles.actionEtiquette}>
          <span className={styles.puceOrigine} aria-hidden="true" />
          {traduire(langue, 'fiche.dansVotreBibliotheque')}
        </p>
      ) : canRead && !fiche.gratuit ? (
        <p className={styles.actionEtiquette}>
          <span className={styles.puceOrigine} aria-hidden="true" />
          {traduire(langue, 'fiche.inclusDansAbonnement')}
        </p>
      ) : null}

      {/* ── Les boutons ─────────────────────────────────────────────────── */}
      <div className={canRead ? styles.actionBoutons : styles.actionLigne}>
        {canRead ? (
          <a className={styles.boutonPrimaire} href={`/${langue}/lire/${fiche.slug}`}>
            {traduire(langue, 'fiche.lireEnLigne')}
          </a>
        ) : achetable && fiche.prix ? (
          // Pour un visiteur, l'ACHAT est l'action principale : c'est lui qui
          // porte le jaune. La lecture de l'extrait vit dans la colonne
          // gauche, sous la couverture.
          <form action={actionAjout}>
            <button type="submit" className={styles.boutonPrimaire}>
              {traduire(langue, 'fiche.acheterMontant').replace(
                '{montant}',
                fiche.prix.affichage,
              )}
            </button>
          </form>
        ) : (
          <a className={styles.boutonPrimaire} href={`/${langue}/lire/${fiche.slug}`}>
            {traduire(langue, 'fiche.lireExtrait')}
          </a>
        )}

        {/*
         * Le second bouton n'est JAMAIS jaune : deux boutons jaunes côte à
         * côte, c'est deux actions principales, c'est-à-dire aucune.
         */}
        {canDownload ? (
          <a className={styles.boutonTradition} href={`/${langue}/compte/bibliotheque`}>
            {traduire(langue, 'fiche.telecharger')}
          </a>
        ) : canRead && achetable && fiche.prix ? (
          <form action={actionAjout}>
            <button type="submit" className={styles.boutonTradition}>
              {traduire(langue, 'fiche.acheterPourTelecharger').replace(
                '{montant}',
                fiche.prix.affichage,
              )}
            </button>
          </form>
        ) : null}

        {/* Le visiteur : ce que l'achat lui donne, à droite du bouton. */}
        {!canRead && achetable ? (
          <p className={styles.actionDetail}>{traduire(langue, 'fiche.telechargementAGarder')}</p>
        ) : null}
      </div>

      {/* ── La note qui suit ────────────────────────────────────────────── */}
      {canDownload ? (
        <p className={styles.actionNote}>{traduire(langue, 'fiche.retelechargeable')}</p>
      ) : canRead ? (
        <p className={styles.actionNote}>{traduire(langue, 'fiche.repriseLecture')}</p>
      ) : (
        <p className={styles.actionNote}>
          <a className={styles.lienTradition} href={`/${langue}/offres`}>
            {traduire(langue, 'fiche.ouAvecAbonnement')}
          </a>
        </p>
      )}

      {/*
        L'EXPLICATION DE CE QUI MANQUE.

        Elle ne paraît que pour qui lit sans pouvoir conserver — un abonné, ou
        un lecteur d'un titre gratuit — et jamais pour qui détient déjà le
        fichier. Proposer d'acheter à quelqu'un qui a acheté est le contresens
        que la troisième ligne du catalogue existe déjà pour éviter.
      */}
      {canRead && !canDownload && fiche.disponible_achat ? (
        <p className={styles.actionExplication}>
          {traduire(langue, 'fiche.telechargementParAchat')}
        </p>
      ) : null}

      {fiche.achat_hors_zone ? (
        <p className={styles.actionExplication}>{traduire(langue, 'acces.horsZone')}</p>
      ) : null}

      {/*
        « Bientôt dans l'abonnement » — piloté par `abonnement_a_partir_du`,
        calculé en base. La date est FORMATÉE ici, jamais calculée : la fenêtre
        dépend d'un réglage que l'administration déplace à la seconde et
        rétroactivement.
      */}
      {fiche.abonnement_a_partir_du ? (
        <p className={styles.actionNote}>
          {traduire(langue, 'fiche.bientotAbonnement').replace(
            '{date}',
            new Date(fiche.abonnement_a_partir_du).toLocaleDateString(langue),
          )}
        </p>
      ) : null}

      {!canRead && !fiche.prix && !fiche.achat_hors_zone ? (
        <p className={styles.actionNote}>{traduire(langue, 'fiche.indisponible')}</p>
      ) : null}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BANDEAU D'EXTRAIT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rappelle que la lecture en cours est partielle.
 *
 * Le nombre de pages vient de `pages_extrait` et de `nb_pages`, tous deux
 * rendus par l'API : l'écran ne compte rien lui-même.
 */
export function BandeauExtrait({
  langue,
  fiche,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
}): ReactNode {
  if (fiche.acces.canRead || fiche.nb_pages === null) return null;

  return (
    <p className={styles.bandeauExtrait}>
      {traduire(langue, 'fiche.extraitSeul').replace('{pages}', String(fiche.nb_pages))}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCART DE PROVENANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * « D'où vient ce conte » — le différenciateur éditorial de la plateforme.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL N'APPARAÎT QUE SI LE TEXTE EXISTE.                                   │
 * │                                                                          │
 * │ La maquette porte aussi un encart « Les mots du conte » — un glossaire   │
 * │ de quatre entrées. Aucun champ ne le porte en base : le construire       │
 * │ demanderait d'inventer un contenu éditorial, ce qui n'est pas le rôle    │
 * │ d'un écran. Il est donc absent, et il le restera tant que le modèle de   │
 * │ données ne le portera pas.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function EncartProvenance({
  langue,
  fiche,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
}): ReactNode {
  const themes = fiche.themes.length > 0 ? fiche.themes.join(' · ') : null;
  if (!fiche.origine_culturelle && !themes) return null;

  return (
    <div className={styles.encarts}>
      {fiche.origine_culturelle ? (
        <section className={styles.encart}>
          {/* L'ornement en tête d'encart : 56 px, découpé par l'`overflow` du
              parent — d'où le rayon nul. */}
          <Motif region={fiche.region} place="encart" rayon="0" />

          <div className={styles.encartCorps}>
            <h2 className={styles.encartTitre}>{traduire(langue, 'fiche.provenance')}</h2>
            <p className={styles.encartTexte}>{fiche.origine_culturelle}</p>
          </div>
        </section>
      ) : null}

      {themes ? (
        <section className={`${styles.encart} ${styles.encartNeutre}`}>
          <div className={styles.encartCorps}>
            <h2 className={styles.encartTitre}>{traduire(langue, 'fiche.details')}</h2>

            <dl className={styles.encartListe}>
              <div className={styles.encartEntree}>
                <dt className={styles.encartTerme}>{traduire(langue, 'fiche.themes')}</dt>
                <dd className={styles.encartDefinition}>{themes}</dd>
              </div>

              {fiche.langues.length > 0 ? (
                <div className={styles.encartEntree}>
                  <dt className={styles.encartTerme}>{traduire(langue, 'fiche.langues')}</dt>
                  <dd className={styles.encartDefinition}>
                    {fiche.langues
                      .map((code) => traduire(langue, code === 'fr' ? 'langue.fr' : 'langue.en'))
                      .join(', ')}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DANS LA MÊME TRADITION
// ═══════════════════════════════════════════════════════════════════════════

export function Suggestions({
  langue,
  fiche,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
}): ReactNode {
  if (fiche.suggestions.length === 0) return null;

  return (
    <section className={styles.suggestions}>
      <div className={styles.suggestionsEntete}>
        <h2 className={styles.suggestionsTitre}>{traduire(langue, 'fiche.suggestions')}</h2>

        {fiche.region ? (
          <a
            className={styles.suggestionsLien}
            href={`/${langue}/catalogue?region=${fiche.region}`}
          >
            {traduire(langue, 'fiche.suggestionsToute')}
          </a>
        ) : null}
      </div>

      <ul className={styles.suggestionsGrille}>
        {fiche.suggestions.map((suggestion) => (
          <li key={suggestion.id}>
            {/*
             * Les suggestions partagent la tradition du conte courant — c'est
             * ce que la section annonce. Elles héritent donc de ses teintes,
             * posées sur le conteneur de page.
             */}
            <a className={styles.suggestion} href={`/${langue}/contes/${suggestion.slug}`}>
              {suggestion.couverture_url ? (
                <img
                  src={suggestion.couverture_url}
                  width={200}
                  height={300}
                  loading="lazy"
                  decoding="async"
                  alt=""
                  className={styles.suggestionImage}
                />
              ) : null}

              <span className={styles.suggestionTexte}>
                <span className={styles.suggestionTitre}>{suggestion.titre}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LA PAGE ENTIÈRE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assemble les blocs, et pose LA couleur de la page.
 *
 * `teintesRegion` n'est appelée qu'ICI : tous les blocs lisent les quatre
 * variables qu'elle pose. Un bloc qui les poserait à son tour pourrait
 * diverger — et c'est exactement ce qui produit une fiche à deux couleurs.
 */
export function PageFicheLivre({
  langue,
  fiche,
  actionAjout,
  children,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
  actionAjout?: (donnees: FormData) => void | Promise<void>;
  /** Les données structurées, injectées par la route. */
  children?: ReactNode;
}): ReactNode {
  return (
    <div className={styles.page} style={teintesRegion(fiche.region)}>
      {children}

      <FilAriane langue={langue} fiche={fiche} />

      <div className={styles.colonnes}>
        <ColonneCouverture langue={langue} fiche={fiche} />

        <div className={styles.colonneDroite}>
          <EnteteFiche langue={langue} fiche={fiche} />
          <BandeauExtrait langue={langue} fiche={fiche} />
          <ActionsFiche langue={langue} fiche={fiche} actionAjout={actionAjout} />
        </div>
      </div>

      <EncartProvenance langue={langue} fiche={fiche} />
      <Suggestions langue={langue} fiche={fiche} />

      <a className={styles.retour} href={`/${langue}/catalogue`}>
        {traduire(langue, 'fiche.retourCatalogue')}
      </a>
    </div>
  );
}
