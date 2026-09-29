import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { LOGO_ASSOCIATION } from '@/content/association';
import styles from './espace-adherent.module.css';

/**
 * L'ESPACE ADHÉRENT — A3 du document du 28 septembre 2026.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE COMPOSANT NE DÉCIDE D'AUCUN DROIT.                                   │
 * │                                                                          │
 * │ La page l'a déjà fait : elle n'arrive ici qu'avec un verdict `ouvert`    │
 * │ ou `impaye_tolere`. Ce qu'on lui donne, il l'affiche — et la fonction    │
 * │ qui le nourrit ne rend ni l'adresse d'un PDF ni celle d'une vidéo, si    │
 * │ bien qu'aucune ressource réservée ne peut fuir par le rendu.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export interface DonneesEspace {
  mot: { texte: string; signature: string } | null;
  rubriques: { type: string; nb: number }[] | null;
  a_la_une: {
    slug: string;
    titre: string;
    chapeau: string;
    type: string;
    image_url: string | null;
    texte_alternatif: string;
    publie_le: string;
    minutes: number | null;
  } | null;
  contenus: {
    slug: string;
    titre: string;
    chapeau: string;
    type: string;
    image_url: string | null;
    texte_alternatif: string;
    publie_le: string;
    minutes: number | null;
    pdf_pages: number | null;
    video_minutes: number | null;
    recent: boolean;
  }[];
  agenda: {
    id: string;
    type: string;
    titre: string;
    debut_le: string;
    lieu: string | null;
    places: number;
    restantes: number;
    inscrit: boolean;
  }[];
  campagne: {
    intitule: string;
    objectif_kits: number;
    total: number;
    regions: { region: string; kits: number }[];
  } | null;
  fiches: { slug: string; titre: string; pdf_pages: number | null; publie_le: string }[];
  replays: {
    slug: string;
    titre: string;
    image_url: string | null;
    video_minutes: number | null;
    publie_le: string;
  }[];
  prochaine_publication: string | null;
}

const POUR_CENT = 100;

export function EspaceAdherent({
  langue,
  prenom,
  donnees,
  impaye,
  finPeriode,
  finGrace,
}: {
  langue: LangueInterface;
  prenom: string;
  donnees: DonneesEspace;
  /** Le paiement n'a pas abouti, mais la grâce court encore. */
  impaye: boolean;
  finPeriode: string | null;
  finGrace: string | null;
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);

  const date = (iso: string | null): string =>
    iso
      ? new Date(iso).toLocaleDateString(langue, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          // `UTC` explicite : sans lui, une date à minuit recule d'un jour
          // pour tout lecteur à l'ouest de Greenwich.
          timeZone: 'UTC',
        })
      : '—';

  const jour = (iso: string): string =>
    new Date(iso).toLocaleDateString(langue, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  const lien = (slug: string): string => `/${langue}/association/${slug}`;

  return (
    <div className={styles.page}>
      {/* ── L'impayé, dit AVANT tout le reste ─────────────────────────── */}
      {impaye ? (
        /*
         * Il est en tête, et il porte une DATE : « votre paiement n'a pas
         * abouti » sans échéance ne dit pas combien de temps il reste, et ne
         * fait donc rien arriver. C'est la même leçon que le bandeau des
         * impayés de l'administration.
         */
        <div className={styles.bandeauImpaye} role="alert">
          <p className={styles.bandeauImpayeTitre}>{t('v2.espaceImpayeTitre')}</p>
          <p className={styles.bandeauImpayeTexte}>
            {t('v2.espaceImpayeTexte').replace('{date}', date(finGrace))}
          </p>
          <a className={styles.bandeauImpayeBouton} href={`/${langue}/compte`}>
            {t('v2.espaceImpayeBouton')}
          </a>
        </div>
      ) : null}

      {/* ── L'en-tête ─────────────────────────────────────────────────── */}
      <header className={styles.entete}>
        {/*
          Le chemin se compose comme sur la page publique : `LOGO_ASSOCIATION`
          porte le NOM du fichier et ses dimensions natives, pas une adresse.
          Les deux écrans montrent donc la même image, et un renommage n'en
          casse qu'un seul endroit.
        */}
        <img
          className={styles.logo}
          src={`/images/association/${LOGO_ASSOCIATION.fichier}`}
          alt=""
          width={56}
          height={56}
          loading="eager"
          decoding="async"
        />

        <div>
          <p className={styles.oeil}>{t('v2.espaceOeil')}</p>
          <h1 className={styles.bonjour}>
            {t('v2.espaceBonjour').replace('{prenom}', prenom)}
          </h1>
          <p className={styles.accueil}>{t('v2.espaceAccueil')}</p>
        </div>

        <div className={styles.pastilles}>
          <span className={styles.pastille}>
            <span className={styles.pastillePoint} aria-hidden="true" />
            {t('v2.espaceActiveJusquau').replace('{date}', date(finPeriode))}
          </span>

          {/*
            « Prochaine publication » ne s'affiche QUE si une date existe. Une
            pastille « aucune » annoncerait aux adhérents que rien n'est
            prévu — ce qui est vrai, mais ce n'est pas à eux de le savoir.
          */}
          {donnees.prochaine_publication ? (
            <span className={styles.pastille}>
              {t('v2.espaceProchaine').replace('{date}', date(donnees.prochaine_publication))}
            </span>
          ) : null}
        </div>
      </header>

      {/* ── Le mot du mois ────────────────────────────────────────────── */}
      {donnees.mot ? (
        <section className={styles.mot}>
          <p className={styles.motOeil}>{t('v2.espaceMotDuMois')}</p>
          <blockquote className={styles.motTexte}>{donnees.mot.texte}</blockquote>
          <p className={styles.motSignature}>{donnees.mot.signature}</p>
        </section>
      ) : null}

      <div className={styles.colonnes}>
        <div className={styles.principale}>
          {/* ── À la une ────────────────────────────────────────────── */}
          {donnees.a_la_une ? (
            <a className={styles.une} href={lien(donnees.a_la_une.slug)}>
              {donnees.a_la_une.image_url ? (
                <img
                  className={styles.unePhoto}
                  src={donnees.a_la_une.image_url}
                  alt={donnees.a_la_une.texte_alternatif}
                  loading="eager"
                  decoding="async"
                />
              ) : null}

              <span className={styles.uneEtiquettes}>
                <span className={styles.etiquetteUne}>{t('v2.espaceALaUne')}</span>
                <span className={styles.etiquetteType}>
                  {t(`admin.redType_${donnees.a_la_une.type}` as CleTraduction)}
                </span>
              </span>

              <span className={styles.uneTitre}>{donnees.a_la_une.titre}</span>
              <span className={styles.uneChapeau}>{donnees.a_la_une.chapeau}</span>
              <span className={styles.uneMeta}>
                {date(donnees.a_la_une.publie_le)}
                {donnees.a_la_une.minutes
                  ? ` · ${t('v2.assoMinutes').replace(
                      '{minutes}',
                      String(donnees.a_la_une.minutes),
                    )}`
                  : ''}
              </span>
            </a>
          ) : null}

          {/* ── Les derniers contenus ───────────────────────────────── */}
          <div className={styles.grille}>
            {donnees.contenus.map((contenu) => (
              <a key={contenu.slug} className={styles.carte} href={lien(contenu.slug)}>
                {contenu.image_url ? (
                  <img
                    className={styles.cartePhoto}
                    src={contenu.image_url}
                    alt={contenu.texte_alternatif}
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}

                <span className={styles.carteHaut}>
                  <span className={styles.etiquetteType}>
                    {t(`admin.redType_${contenu.type}` as CleTraduction)}
                  </span>
                  {/*
                    « RÉCENT », et non « nouveau ».

                    Le document dit « moins de 7 jours ET non ouvert ». La
                    seconde moitié demande de retenir ce que chaque adhérent a
                    lu ; elle n'existe pas. Le mot choisi est donc celui qui
                    reste vrai — « nouveau » serait faux pour qui vient de le
                    lire.
                  */}
                  {contenu.recent ? (
                    <span className={styles.etiquetteRecent}>{t('v2.espaceRecent')}</span>
                  ) : null}
                </span>

                <span className={styles.carteTitre}>{contenu.titre}</span>

                <span className={styles.carteMeta}>
                  {jour(contenu.publie_le)}
                  {contenu.type === 'fiche_pdf' && contenu.pdf_pages
                    ? ` · ${t('v2.espacePages').replace('{nb}', String(contenu.pdf_pages))}`
                    : ''}
                  {contenu.type === 'replay' && contenu.video_minutes
                    ? ` · ${t('v2.espaceDuree').replace(
                        '{minutes}',
                        String(contenu.video_minutes),
                      )}`
                    : ''}
                  {contenu.type !== 'fiche_pdf' && contenu.type !== 'replay' && contenu.minutes
                    ? ` · ${t('v2.assoMinutes').replace('{minutes}', String(contenu.minutes))}`
                    : ''}
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* ── La colonne de droite ──────────────────────────────────── */}
        <aside className={styles.cote}>
          <section className={styles.bloc}>
            <h2 className={styles.blocTitre}>{t('v2.espaceAgenda')}</h2>

            {donnees.agenda.length === 0 ? (
              <p className={styles.blocVide}>{t('v2.espaceAgendaVide')}</p>
            ) : (
              donnees.agenda.map((evenement) => (
                <div key={evenement.id} className={styles.evenement}>
                  <span className={styles.evenementDate}>{jour(evenement.debut_le)}</span>

                  <span className={styles.evenementCorps}>
                    <span className={styles.evenementType}>
                      {t(`admin.assoEvt_${evenement.type}` as CleTraduction)}
                    </span>
                    <span className={styles.evenementTitre}>{evenement.titre}</span>
                    <span className={styles.evenementLieu}>
                      {evenement.lieu ?? t('admin.assoEnLigne')}
                      {' · '}
                      {evenement.restantes > 0
                        ? t('v2.espaceRestantes').replace('{nb}', String(evenement.restantes))
                        : t('v2.espaceComplet')}
                    </span>
                  </span>

                  {/*
                    L'INSCRIPTION arrive avec les automatismes : elle demande
                    un e-mail de confirmation et un fichier calendrier, que
                    rien n'envoie encore. Un bouton qui n'inscrirait pas
                    vraiment serait pire qu'un état affiché — celui-ci dit ce
                    qui EST, et ne promet rien.
                  */}
                  <span
                    className={
                      evenement.inscrit ? styles.evenementInscrit : styles.evenementNon
                    }
                  >
                    {evenement.inscrit ? t('v2.espaceInscrit') : ''}
                  </span>
                </div>
              ))
            )}
          </section>

          {donnees.campagne ? (
            <section className={styles.campagne}>
              <p className={styles.campagneOeil}>{t('v2.espaceCampagne')}</p>
              <h2 className={styles.campagneTitre}>{donnees.campagne.intitule}</h2>

              <p className={styles.campagneTotal}>
                {donnees.campagne.total}
                <span className={styles.campagneObjectif}>
                  {' '}
                  {t('v2.espaceSurObjectif').replace(
                    '{nb}',
                    String(donnees.campagne.objectif_kits),
                  )}
                </span>
              </p>

              <span className={styles.campagneJauge} aria-hidden="true">
                <span
                  className={styles.campagneJaugeRemplie}
                  style={{
                    width: `${String(
                      donnees.campagne.objectif_kits > 0
                        ? Math.min(
                            POUR_CENT,
                            Math.round(
                              (donnees.campagne.total / donnees.campagne.objectif_kits) *
                                POUR_CENT,
                            ),
                          )
                        : 0,
                    )}%`,
                  }}
                />
              </span>

              <ul className={styles.campagneRegions}>
                {donnees.campagne.regions.map((region) => (
                  <li key={region.region}>
                    <span className={styles.campagneRegionNom}>{region.region}</span>
                    <span className={styles.campagneRegionKits}>{region.kits}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {donnees.fiches.length > 0 ? (
            <section className={styles.bloc}>
              <h2 className={styles.blocTitre}>{t('v2.espaceFiches')}</h2>

              {donnees.fiches.map((fiche) => (
                <a key={fiche.slug} className={styles.fiche} href={lien(fiche.slug)}>
                  <span className={styles.ficheTitre}>{fiche.titre}</span>
                  <span className={styles.ficheMeta}>
                    {fiche.pdf_pages
                      ? t('v2.espacePages').replace('{nb}', String(fiche.pdf_pages))
                      : ''}
                    {' · '}
                    {jour(fiche.publie_le)}
                  </span>
                </a>
              ))}
            </section>
          ) : null}
        </aside>
      </div>

      {/* ── Les replays ───────────────────────────────────────────────── */}
      {donnees.replays.length > 0 ? (
        <section className={styles.replays}>
          <h2 className={styles.blocTitre}>{t('v2.espaceReplays')}</h2>

          <div className={styles.replaysBande}>
            {donnees.replays.map((replay) => (
              <a key={replay.slug} className={styles.replay} href={lien(replay.slug)}>
                {replay.image_url ? (
                  <img
                    className={styles.replayPhoto}
                    src={replay.image_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
                <span className={styles.replayTitre}>{replay.titre}</span>
                {replay.video_minutes ? (
                  <span className={styles.replayDuree}>
                    {t('v2.espaceDuree').replace('{minutes}', String(replay.video_minutes))}
                  </span>
                ) : null}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
