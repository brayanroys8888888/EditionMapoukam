import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { FicheLivre } from '@/domain/catalog/types';
import { Couverture, SubstitutCouverture } from '@/components/catalogue/couverture';
import { Revele } from './revele';
import styles from './boutique.module.css';
import accueil from './accueil.module.css';

/**
 * FICHE D'UN CONTE — DIRECTION V2.
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
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE LA V2 AJOUTE : LES QUATRE RÉPONSES, AVANT LE BOUTON.             │
 * │                                                                          │
 * │ Âge conseillé, pagination, formats du fichier, langues. Le site actuel   │
 * │ n'en donne aucune : un parent y voit un prix, un champ de quantité et    │
 * │ un bouton, puis un texte de vente qui ne parle pas du livre. C'est la    │
 * │ raison principale du « pas assez rassurant pour l'achat ».               │
 * │                                                                          │
 * │ Une case ne s'affiche QUE si la donnée existe. Une case vide serait pire │
 * │ que son absence : elle annoncerait une information manquante.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Une case des quatre réponses, omise quand la donnée manque. */
function Reponse({ intitule, valeur }: { intitule: string; valeur: string | null }): ReactNode {
  if (!valeur) return null;

  return (
    <div className={styles.reponse}>
      <span className={styles.reponseIntitule}>{intitule}</span>
      <span className={styles.reponseValeur}>{valeur}</span>
    </div>
  );
}

export function FicheV2({
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

  const age =
    fiche.age_min === null
      ? null
      : fiche.age_max === null
        ? traduire(langue, 'catalogue.trancheAgeCourteOuverte').replace(
            '{min}',
            String(fiche.age_min),
          )
        : traduire(langue, 'catalogue.trancheAgeCourte')
            .replace('{min}', String(fiche.age_min))
            .replace('{max}', String(fiche.age_max));

  return (
    <>
      <div className={styles.banniere} data-banniere>
        <div className={styles.banniereInterieur}>
          <nav className={styles.oeil} aria-label={traduire(langue, 'catalogue.titre')}>
            <a href={`/${langue}/catalogue`} style={{ color: 'inherit' }}>
              {traduire(langue, 'navigation.catalogue')}
            </a>
            {fiche.region ? (
              <>
                {' · '}
                <a href={`/${langue}/catalogue?region=${fiche.region}`} style={{ color: 'inherit' }}>
                  {traduire(langue, `regions.${fiche.region}`)}
                </a>
              </>
            ) : null}
          </nav>

          <h1 className={styles.banniereTitre}>{fiche.titre}</h1>
          <p className={styles.banniereTexte}>
            {traduire(langue, 'catalogue.parAuteur').replace('{auteur}', fiche.auteur)}
          </p>
        </div>
      </div>

      <div className={styles.page}>
        <div className={styles.fiche}>
          {/* ── Colonne visuelle ────────────────────────────────────────── */}
          <div className={styles.ficheVisuel}>
            {fiche.couverture ? (
              // La taille « fiche » (800 px) est ICI légitime : une seule
              // image par page, et c'est l'argument de vente de l'écran.
              <Couverture
                langue={langue}
                url={fiche.couverture.fiche}
                largeur={800}
                hauteur={1200}
                tailles="(max-width: 820px) 88vw, 360px"
                region={fiche.region}
                // Le titre est en `h1` juste à côté : le répéter ferait
                // entendre deux fois la même phrase.
                alt=""
                classeImage={styles.ficheCouverture}
              />
            ) : (
              <SubstitutCouverture langue={langue} region={fiche.region} />
            )}
          </div>

          {/* ── Colonne d'achat ─────────────────────────────────────────── */}
          <div>
            {fiche.region ? (
              <p className={styles.ficheOrigine}>
                <span className={styles.fichePuce} aria-hidden="true" />
                {fiche.origine_culturelle ?? traduire(langue, `regions.${fiche.region}`)}
              </p>
            ) : null}

            {fiche.resume ? <p className={styles.ficheResume}>{fiche.resume}</p> : null}

            {/* ── Les quatre réponses ───────────────────────────────────── */}
            <div className={styles.reponses}>
              <Reponse intitule={traduire(langue, 'v2.ficheAge')} valeur={age} />
              <Reponse
                intitule={traduire(langue, 'v2.fichePages')}
                valeur={fiche.nb_pages === null ? null : String(fiche.nb_pages)}
              />
              {/*
               * Les formats ne sont annoncés QUE si le titre est achetable.
               * Promettre « PDF · EPUB » sur un conte que l'abonnement seul
               * ouvre serait exactement la confusion que tout le produit
               * s'attache à éviter.
               */}
              <Reponse
                intitule={traduire(langue, 'v2.ficheFormats')}
                valeur={
                  fiche.disponible_achat ? traduire(langue, 'v2.ficheFormatsValeur') : null
                }
              />
              <Reponse
                intitule={traduire(langue, 'v2.ficheLangues')}
                valeur={
                  fiche.langues.length > 0
                    ? fiche.langues.map((code) => code.toUpperCase()).join(' · ')
                    : null
                }
              />
            </div>

            {/* ── Bloc d'achat ──────────────────────────────────────────── */}
            <section className={styles.achat} aria-label={traduire(langue, 'acces.acheter')}>
              {canDownload ? (
                <p className={styles.etiquette}>
                  <span className={styles.fichePuce} aria-hidden="true" />
                  {traduire(langue, 'fiche.dansVotreBibliotheque')}
                </p>
              ) : canRead && !fiche.gratuit ? (
                <p className={styles.etiquette}>
                  <span className={styles.fichePuce} aria-hidden="true" />
                  {traduire(langue, 'fiche.inclusDansAbonnement')}
                </p>
              ) : null}

              {fiche.prix && !canDownload ? (
                <p className={styles.achatPrix}>
                  <span className={styles.prixMontant}>{fiche.prix.affichage}</span>
                  <span className={styles.prixMention}>
                    {traduire(langue, 'accueil.achatUnite')}
                  </span>
                </p>
              ) : null}

              <div className={styles.achatActions}>
                {canRead ? (
                  <a className={accueil.boutonOcre} href={`/${langue}/lire/${fiche.slug}`}>
                    {traduire(langue, 'fiche.lireEnLigne')}
                  </a>
                ) : achetable ? (
                  <form action={actionAjout}>
                    <button type="submit" className={accueil.boutonOcre}>
                      {traduire(langue, 'fiche.ajouterAuPanier')}
                    </button>
                  </form>
                ) : null}

                {/*
                 * Le second bouton n'est JAMAIS ocre : deux boutons d'accent
                 * côte à côte, c'est deux actions principales, c'est-à-dire
                 * aucune.
                 */}
                {canDownload ? (
                  <a className={accueil.boutonContour} href={`/${langue}/compte/bibliotheque`}>
                    {traduire(langue, 'fiche.telecharger')}
                  </a>
                ) : canRead && achetable ? (
                  <form action={actionAjout}>
                    <button type="submit" className={accueil.boutonContour}>
                      {traduire(langue, 'fiche.ajouterAuPanier')}
                    </button>
                  </form>
                ) : (
                  <a className={accueil.boutonContour} href={`/${langue}/lire/${fiche.slug}`}>
                    {traduire(langue, 'fiche.lireExtrait')}
                  </a>
                )}
              </div>

              {/*
                L'EXPLICATION DE CE QUI MANQUE — la phrase la plus importante
                de l'écran. Elle ne paraît que pour qui lit sans pouvoir
                conserver. Sans elle, l'absence du bouton de téléchargement se
                lit comme une panne, et le client écrit au support au lieu
                d'acheter.
              */}
              {canRead && !canDownload && fiche.disponible_achat ? (
                <p className={styles.achatNote}>
                  {traduire(langue, 'fiche.telechargementParAchat')}
                </p>
              ) : null}

              {fiche.achat_hors_zone ? (
                <p className={styles.achatNote}>{traduire(langue, 'acces.horsZone')}</p>
              ) : null}

              {/* Trois faits, pas trois slogans. */}
              <div className={styles.confiance}>
                {(['1', '2', '3'] as const).map((rang) => (
                  <p key={rang} className={styles.confianceLigne}>
                    <span className={styles.confianceCoche} aria-hidden="true">
                      ✓
                    </span>
                    {traduire(langue, `v2.ficheConfiance${rang}` as never)}
                  </p>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* ── D'où vient ce conte ─────────────────────────────────────── */}
        {fiche.origine_culturelle ? (
          <Revele>
            <section className={styles.bloc}>
              <h2 className={styles.blocTitre}>{traduire(langue, 'fiche.provenance')}</h2>
              <p className={styles.blocTexte}>{fiche.origine_culturelle}</p>
            </section>
          </Revele>
        ) : null}

        {/* ── Dans la même tradition ──────────────────────────────────── */}
        {fiche.suggestions.length > 0 ? (
          <section className={styles.bloc}>
            <h2 className={styles.blocTitre}>{traduire(langue, 'v2.ficheSimilaires')}</h2>

            <ul className={styles.similaires}>
              {fiche.suggestions.map((suggestion, rang) => (
                <li key={suggestion.id}>
                  <Revele rang={rang}>
                    <a
                      className={styles.reponse}
                      href={`/${langue}/contes/${suggestion.slug}`}
                      style={{ display: 'block' }}
                    >
                      {/*
                        `couverture.vignette` — une URL ABSOLUE. Le champ
                        `couverture_url` voisin est un chemin de stockage, et
                        le poser ici rendrait 404 sans que la page le montre.
                      */}
                      {suggestion.couverture ? (
                        <img
                          src={suggestion.couverture.vignette}
                          width={320}
                          height={480}
                          loading="lazy"
                          decoding="async"
                          alt=""
                          style={{
                            width: '100%',
                            height: 'auto',
                            aspectRatio: '2 / 3',
                            objectFit: 'cover',
                            borderRadius: 'var(--rayon-image)',
                            display: 'block',
                            marginBottom: '12px',
                          }}
                        />
                      ) : null}
                      <span className={styles.reponseValeur}>{suggestion.titre}</span>
                    </a>
                  </Revele>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
