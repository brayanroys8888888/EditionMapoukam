import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { langueValide, traduire } from '@/i18n';
import { lireOffres } from '@/lib/offers/service';
import { Erreur } from '@/components/etats';
import styles from '@/components/offres/offres.module.css';

/**
 * Les deux formules — §4.1 F4, et §D des maquettes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUS LES MONTANTS VIENNENT DU SERVEUR, SANS EXCEPTION.                  │
 * │                                                                          │
 * │ `lireOffres` est le module qu'emploie `/api/offers`. Aucun nombre n'est  │
 * │ écrit ici : les maquettes portaient 6,90 € et 3,90 €, valeurs inventées  │
 * │ par l'outil de maquettage, et les recopier aurait créé une seconde       │
 * │ grille tarifaire — celle que le client lit avant de payer l'autre.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN EST LE PREMIER OÙ LA RÈGLE MÉTIER CENTRALE SE LIT.            │
 * │                                                                          │
 * │ L'abonnement donne la LECTURE EN LIGNE, jamais le téléchargement.        │
 * │ L'achat donne le FICHIER, sans limite de durée. La page ne se contente   │
 * │ donc pas d'énumérer ce que chaque formule apporte : elle nomme aussi ce  │
 * │ que l'abonnement N'apporte PAS, parce que c'est la confusion qui produit │
 * │ des réclamations à chaque expiration.                                    │
 * │                                                                          │
 * │ C'est aussi pourquoi les deux cartes ont le MÊME poids visuel : mettre   │
 * │ l'abonnement en avant ajouterait une pression commerciale sur la         │
 * │ formule qui déçoit ensuite.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'offres.titrePage'),
    description: traduire(langue, 'offres.introPage'),
  };
}

/** Une ligne du tableau comparatif. */
function LigneComparatif({
  intitule,
  abonnement,
  achat,
}: {
  intitule: string;
  abonnement: { texte: string; positif: boolean };
  achat: { texte: string; positif: boolean };
}): ReactNode {
  return (
    <tr>
      {/* `scope="row"` : sans lui, un lecteur d'écran annonce « Oui » sans
          jamais dire de quoi. */}
      <th scope="row">{intitule}</th>
      <td className={abonnement.positif ? styles.positif : styles.restrictif}>
        {abonnement.texte}
      </td>
      <td className={achat.positif ? styles.positif : styles.restrictif}>{achat.texte}</td>
    </tr>
  );
}

export default async function PageOffres({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  let offres;
  try {
    // Zone d'AFFICHAGE seulement. La zone d'encaissement est déterminée au
    // paiement, depuis le pays réel du moyen de paiement, et elle seule est
    // enregistrée sur la commande.
    offres = await lireOffres('international');
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  const { abonnement, achat_unite: achat } = offres;

  /*
   * La variante de LANCEMENT — pilotée par un réglage serveur,
   * `business_settings.abonnement_ouvert`, et JAMAIS par un compteur de titres
   * calculé ici. Le seuil de trente à quarante titres de §3.3 est une décision
   * commerciale, pas une règle de code.
   */
  const lancement = !abonnement.ouvert;

  // La formule d'entrée : c'est l'ordre que rend `/api/offers`. La page
  // affiche le prix d'entrée, et la note dit l'autre périodicité.
  const principale = abonnement.offres[0] ?? null;
  const secondaire = abonnement.offres[1] ?? null;

  const intro = traduire(langue, 'offres.comparatifIntro').split(/<lire>|<garder>/);

  return (
    <div className={styles.page}>
      <h1 className={styles.titre}>{traduire(langue, 'offres.titrePage')}</h1>
      <p className={styles.intro}>{traduire(langue, 'offres.introPage')}</p>

      <div className={lancement ? `${styles.cartes} ${styles.cartesLancement}` : styles.cartes}>
        {/* ── L'abonnement, ou l'encart « Bientôt » ─────────────────────── */}
        {lancement ? (
          <section className={styles.bientot}>
            <div className={styles.bientotEntete}>
              <span className={styles.bientotPastille}>{traduire(langue, 'offres.bientot')}</span>
              <h2 className={styles.bientotTitre}>
                {traduire(langue, 'offres.abonnementFermeTitre')}
              </h2>
            </div>
            <p className={styles.bientotCorps}>
              {traduire(langue, 'offres.abonnementFermeCorps')}
            </p>
          </section>
        ) : (
          <section className={styles.carte}>
            <div>
              <h2 className={styles.carteTitre}>{traduire(langue, 'offres.abonnementTitre')}</h2>
              <p className={styles.carteSousTitre}>
                {traduire(langue, 'offres.abonnementSousTitre')}
              </p>
            </div>

            {principale ? (
              <div>
                <p className={styles.prix}>
                  {principale.affichage}{' '}
                  <span className={styles.prixUnite}>
                    {traduire(langue, 'offres.abonnementParPeriode').replace(
                      '{periode}',
                      principale.periode,
                    )}
                  </span>
                </p>

                {/*
                 * La seconde périodicité est une NOTE, pas une bascule.
                 *
                 * La maquette pose deux boutons « Mensuel / Annuel » qui
                 * réécrivent trois valeurs de la carte. Cela suppose du
                 * JavaScript pour un choix que la page de souscription
                 * redemande de toute façon — et l'écran perdrait sa moitié
                 * annuelle sans JavaScript, ce qui est la condition réelle
                 * d'une partie du public (§5.1).
                 */}
                {secondaire ? (
                  <p className={styles.prixNote}>
                    {secondaire.affichage}{' '}
                    {traduire(langue, 'offres.abonnementParPeriode').replace(
                      '{periode}',
                      secondaire.periode,
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div>
              <p className={styles.listeTitre}>
                {traduire(langue, 'offres.abonnementCeQuIlDonne')}
              </p>
              <ul className={styles.liste}>
                <li>
                  <span className={styles.coche} aria-hidden="true">
                    ✓
                  </span>
                  {traduire(langue, 'offres.abonnementDonne1')}
                </li>
                <li>
                  <span className={styles.coche} aria-hidden="true">
                    ✓
                  </span>
                  {traduire(langue, 'offres.abonnementDonne2')}
                </li>
                <li>
                  <span className={styles.coche} aria-hidden="true">
                    ✓
                  </span>
                  {traduire(langue, 'offres.abonnementDonne3')}
                </li>
              </ul>
            </div>

            {/*
              CE QUE L'ABONNEMENT NE DONNE PAS.

              Énoncé aussi visiblement que ce qu'il donne, et au même endroit
              de la carte que sur l'achat. `donne_telechargement` est rendu
              explicitement par l'API — toujours `false` — précisément pour que
              cette phrase ne dépende pas de la mémoire de celui qui écrit
              l'écran.
            */}
            <div>
              <p className={styles.listeTitre}>
                {traduire(langue, 'offres.abonnementCeQuIlNeDonnePas')}
              </p>
              <ul className={styles.liste}>
                <li className={styles.ligneNegative}>
                  <span className={styles.tiret} aria-hidden="true">
                    —
                  </span>
                  {traduire(langue, 'offres.abonnementPasTelechargement')}
                </li>
              </ul>
            </div>

            <div className={styles.zoneBouton}>
              {/*
                LE BOUTON MÈNE AU TUNNEL, ET NON À « MON ABONNEMENT ».

                Il menait à `/compte/abonnement`, qui répondait « vous n'avez
                pas d'abonnement » et renvoyait ici : une boucle fermée sur
                elle-même, où le bouton le plus visible de la page ne menait
                nulle part. Le tunnel, lui, sait quoi faire de quelqu'un qui est
                déjà abonné — il le lui dit et l'envoie à son compte.
              */}
              <a className={styles.boutonPrimaire} href={`/${langue}/abonnement/souscrire`}>
                {abonnement.jours_essai > 0
                  ? traduire(langue, 'offres.abonnementCommencerEssai').replace(
                      '{jours}',
                      String(abonnement.jours_essai),
                    )
                  : traduire(langue, 'offres.abonnementSouscrire')}
              </a>

              {abonnement.jours_essai > 0 ? (
                <p className={styles.noteBouton}>
                  {traduire(langue, 'offres.abonnementEssaiNote').replace(
                    '{jours}',
                    String(abonnement.jours_essai),
                  )}
                </p>
              ) : null}
            </div>
          </section>
        )}

        {/* ── L'achat à l'unité ─────────────────────────────────────────── */}
        <section className={styles.carte}>
          <div>
            <h2 className={styles.carteTitre}>{traduire(langue, 'offres.achatTitre')}</h2>
            <p className={styles.carteSousTitre}>{traduire(langue, 'offres.achatSousTitre')}</p>
          </div>

          <p className={styles.prix}>
            {achat.affichage}{' '}
            <span className={styles.prixUnite}>{traduire(langue, 'offres.achatUnite')}</span>
          </p>

          <div>
            <p className={styles.listeTitre}>{traduire(langue, 'offres.achatDonne')}</p>
            <ul className={styles.liste}>
              <li>
                <span className={styles.coche} aria-hidden="true">
                  ✓
                </span>
                {traduire(langue, 'offres.achatDonne1')}
              </li>
              <li>
                <span className={styles.coche} aria-hidden="true">
                  ✓
                </span>
                {traduire(langue, 'offres.achatDonne2')}
              </li>
              <li>
                <span className={styles.coche} aria-hidden="true">
                  ✓
                </span>
                {traduire(langue, 'offres.achatDonne3')}
              </li>
            </ul>
          </div>

          <div className={styles.zoneBouton}>
            <a className={styles.boutonSecondaire} href={`/${langue}/catalogue`}>
              {traduire(langue, 'offres.achatParcourir')}
            </a>
            <p className={styles.noteBouton}>{traduire(langue, 'offres.achatNote')}</p>
          </div>
        </section>
      </div>

      {/* ── Le comparatif ────────────────────────────────────────────────── */}
      {/*
        Masqué au lancement : comparer deux formules dont une seule est
        souscriptible est une colonne de promesses, pas une comparaison.
      */}
      {lancement ? null : (
        <section className={styles.comparatif}>
          <h2 className={styles.comparatifTitre}>{traduire(langue, 'offres.comparatif')}</h2>

          <p className={styles.comparatifIntro}>
            {intro[0]}
            <strong>{traduire(langue, 'offres.comparatifLire')}</strong>
            {intro[1]}
            <strong>{traduire(langue, 'offres.comparatifGarder')}</strong>
            {intro[2]}
          </p>

          <div className={styles.comparatifCadre}>
            <table className={styles.tableau}>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">{traduire(langue, 'offres.comparatif')}</span>
                  </th>
                  <th scope="col" className={styles.colonneOffre}>
                    {traduire(langue, 'offres.colonneAbonnement')}
                  </th>
                  <th scope="col" className={styles.colonneOffre}>
                    {traduire(langue, 'offres.colonneAchat')}
                  </th>
                </tr>
              </thead>

              <tbody>
                <LigneComparatif
                  intitule={traduire(langue, 'offres.ligneLecture')}
                  abonnement={{ texte: traduire(langue, 'offres.oui'), positif: true }}
                  achat={{
                    texte: traduire(langue, 'offres.ligneLectureAchat'),
                    positif: false,
                  }}
                />

                <LigneComparatif
                  intitule={traduire(langue, 'offres.ligneReprise')}
                  abonnement={{ texte: traduire(langue, 'offres.oui'), positif: true }}
                  achat={{ texte: traduire(langue, 'offres.oui'), positif: true }}
                />

                <LigneComparatif
                  intitule={traduire(langue, 'offres.ligneNouveautes')}
                  abonnement={{
                    texte: traduire(langue, 'offres.ligneNouveautesAbonnement'),
                    positif: true,
                  }}
                  achat={{
                    texte: traduire(langue, 'offres.ligneNouveautesAchat'),
                    positif: false,
                  }}
                />

                {/*
                  LA LIGNE QUI COMPTE.

                  Les deux valeurs sont LUES depuis l'API — `donne_telechargement`
                  vaut `false` pour l'abonnement et `true` pour l'achat — et non
                  écrites ici. C'est le serveur qui l'affirme, et c'est lui qui
                  appliquera la règle au moment du téléchargement.
                */}
                <LigneComparatif
                  intitule={traduire(langue, 'offres.ligneTelechargement')}
                  abonnement={{
                    texte: traduire(
                      langue,
                      abonnement.donne_telechargement ? 'offres.oui' : 'offres.non',
                    ),
                    positif: abonnement.donne_telechargement,
                  }}
                  achat={{
                    texte: achat.donne_telechargement
                      ? traduire(langue, 'offres.ligneTelechargementAchat')
                      : traduire(langue, 'offres.non'),
                    positif: achat.donne_telechargement,
                  }}
                />

                <LigneComparatif
                  intitule={traduire(langue, 'offres.ligneArret')}
                  abonnement={{
                    texte: traduire(langue, 'offres.ligneArretAbonnement'),
                    positif: false,
                  }}
                  achat={{ texte: traduire(langue, 'offres.ligneArretAchat'), positif: true }}
                />
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
