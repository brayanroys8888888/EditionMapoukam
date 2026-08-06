import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { identifierAppelant } from '@/lib/auth/session';
import { abonnementCourant } from '@/lib/subscriptions/handlers';
import { preparerSouscription } from '@/lib/subscriptions/souscription';
import { lireOffres } from '@/lib/offers/service';
import { estMoyenPaiement, type MoyenPaiement } from '@/domain/payments/moyens';
import { champsEnDefaut } from '@/lib/tunnel/coordonnees';
import { Erreur } from '@/components/etats';
import {
  BandeauSimulation,
  ChampsCoordonnees,
  ChoixMoyens,
  FilEtapes,
  stylesTunnel as tunnel,
} from '@/components/tunnel';
import ecran from '@/components/ecran/ecran.module.css';
import { souscrire } from '../actions';

/**
 * TUNNEL D'ABONNEMENT — le chaînon qui manquait.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE PARCOURS N'EXISTAIT PAS, ET LA BOUCLE ÉTAIT FERMÉE SUR ELLE-MÊME.    │
 * │                                                                          │
 * │ `/offres` proposait « S'abonner » et menait à `/compte/abonnement`, qui  │
 * │ répondait « vous n'avez pas d'abonnement » et proposait de retourner à   │
 * │ `/offres`. `POST /api/subscriptions` existait depuis l'étape 10 et       │
 * │ n'était appelé par aucun écran.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUATRE ÉTATS SUR UNE SEULE ADRESSE, ET L'ORDRE DES TESTS COMPTE.        │
 * │                                                                          │
 * │   * `?fait=1` — la CONFIRMATION, qui relit l'abonnement en base ;        │
 * │   * abonnement déjà vivant — un cul-de-sac poli vers `/compte` ;         │
 * │   * sans `offre` — le choix de la formule ;                             │
 * │   * avec `offre`, puis `moyen` — le paiement.                           │
 * │                                                                          │
 * │ Le doublon vivant est testé AVANT le choix de la formule : proposer de   │
 * │ souscrire à quelqu'un qui est déjà abonné le mènerait à un 409 après     │
 * │ avoir rempli tout un formulaire.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUS LES MONTANTS VIENNENT DU SERVEUR, PAR LA ZONE D'ENCAISSEMENT.      │
 * │                                                                          │
 * │ `lireOffres` est le module qu'emploie `/api/offers`, et la zone vient de │
 * │ `preparerSouscription` — celle du pays du moyen de paiement (§3.3), pas  │
 * │ celle de l'affichage. C'est donc le montant qui sera réellement          │
 * │ prélevé qui est écrit sur le bouton.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type Offre = 'mensuel' | 'annuel';

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'souscription.titre'),
    robots: { index: false, follow: false },
  };
}

export default async function PageSouscrire({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  let courant;
  let preparation;
  let offres;
  try {
    courant = await abonnementCourant(appelant.id);
    preparation = await preparerSouscription({
      userId: appelant.id,
      email: appelant.email,
    });
    offres = await lireOffres(preparation.zone);
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  const base = `/${langue}/abonnement/souscrire`;
  const vivant = courant !== null && courant.statut !== 'expire';

  // ── La confirmation, relue en base ──────────────────────────────────────
  if (premier(requete['fait'])) {
    return (
      <div className={ecran.pageEtroite}>
        <FilEtapes langue={langue} parcours="abonnement" etape={3} />

        <h1 className={ecran.titre}>
          {traduire(langue, vivant ? 'souscription.confirmeTitre' : 'souscription.echoueTitre')}
        </h1>

        <section className={ecran.panneau}>
          <p className={ecran.panneauTexteFort}>
            {traduire(langue, vivant ? 'souscription.confirmeCorps' : 'souscription.echoueCorps')}
          </p>

          {vivant ? (
            <a className={ecran.boutonPrimaire} href={`/${langue}/compte/abonnement`}>
              {traduire(langue, 'souscription.versMonAbonnement')}
            </a>
          ) : (
            <a className={ecran.boutonPrimaire} href={base}>
              {traduire(langue, 'souscription.reessayer')}
            </a>
          )}
        </section>

        {/*
          LE RAPPEL SURVIT À LA CONFIRMATION, et c'est voulu : c'est au moment
          où l'on vient de payer qu'on va chercher le bouton de téléchargement.
        */}
        {vivant ? (
          <p className={`${ecran.panneau} ${ecran.panneauAttention} ${ecran.section}`}>
            <span className={ecran.panneauTexte}>
              {traduire(langue, 'souscription.rappelTelechargement')}
            </span>
          </p>
        ) : null}
      </div>
    );
  }

  // ── Déjà abonné : un cul-de-sac, mais poli ──────────────────────────────
  if (vivant) {
    return (
      <div className={ecran.pageEtroite}>
        <h1 className={ecran.titre}>{traduire(langue, 'souscription.titre')}</h1>

        <section className={ecran.panneau}>
          <p className={ecran.panneauTexteFort}>{traduire(langue, 'souscription.dejaAbonne')}</p>

          <a className={ecran.boutonPrimaire} href={`/${langue}/compte/abonnement`}>
            {traduire(langue, 'souscription.versMonAbonnement')}
          </a>
        </section>
      </div>
    );
  }

  const offreDemandee = premier(requete['offre']);
  const offre: Offre | null =
    offreDemandee === 'mensuel' || offreDemandee === 'annuel' ? offreDemandee : null;

  const erreur = premier(requete['erreur']);

  // ── Étape 1 : la formule ────────────────────────────────────────────────
  if (offre === null) {
    return (
      <div className={ecran.pageEtroite}>
        <FilEtapes langue={langue} parcours="abonnement" etape={1} />

        <h1 className={ecran.titre}>{traduire(langue, 'souscription.titre')}</h1>
        <p className={ecran.intro}>{traduire(langue, 'souscription.intro')}</p>

        {erreur ? (
          <p className={ecran.alerte} role="alert">
            {messageErreur(langue, erreur)}
          </p>
        ) : null}

        <h2 className={tunnel.sectionTitre}>{traduire(langue, 'souscription.formuleTitre')}</h2>

        <ul className={tunnel.moyens}>
          {offres.abonnement.offres.map((formule) => (
            <li key={formule.code} className={tunnel.moyen}>
              <a className={tunnel.moyenLien} href={`${base}?offre=${formule.code}`}>
                <span className={tunnel.moyenNom}>
                  {traduire(langue, `souscription.${formule.code}` as CleTraduction)}
                </span>
                <span className={tunnel.moyenNote}>
                  {/*
                    Le montant est celui que le serveur a mis en forme. Le franc
                    CFA n'a pas de sous-unité : recomposer ce nombre ici
                    multiplierait l'erreur par cent sur une zone entière.
                  */}
                  {formule.affichage}{' '}
                  {traduire(
                    langue,
                    formule.code === 'mensuel' ? 'souscription.parMois' : 'souscription.parAn',
                  )}
                </span>
                <span className={tunnel.moyenChoisir} aria-hidden="true">
                  {traduire(langue, 'moyens.choisir')}
                </span>
              </a>
            </li>
          ))}
        </ul>

        {preparation.joursEssai > 0 ? (
          <p className={tunnel.mention}>
            {traduire(langue, 'souscription.essaiNote').replace(
              '{jours}',
              String(preparation.joursEssai),
            )}
          </p>
        ) : null}

        <p className={tunnel.mention}>{traduire(langue, 'souscription.sansEngagement')}</p>

        {/*
          CE QUE L'ABONNEMENT NE DONNE PAS, ÉNONCÉ AVANT DE PAYER.

          L'abonnement ouvre la LECTURE EN LIGNE, jamais le téléchargement.
          C'est la confusion la plus coûteuse du domaine, et le seul moment où
          la lire évite une réclamation est celui-ci.
        */}
        <p className={`${ecran.panneau} ${ecran.panneauAttention} ${ecran.section}`}>
          <span className={ecran.panneauTexte}>
            {traduire(langue, 'souscription.rappelTelechargement')}
          </span>
        </p>
      </div>
    );
  }

  // ── Étape 2 : le paiement ───────────────────────────────────────────────
  const moyenDemande = premier(requete['moyen']);
  const moyen: MoyenPaiement | null = estMoyenPaiement(moyenDemande) ? moyenDemande : null;
  const enDefaut = champsEnDefaut(premier(requete['champs']));

  const formule = offres.abonnement.offres.find((valeur) => valeur.code === offre);

  return (
    <div className={ecran.pageEtroite}>
      <FilEtapes langue={langue} parcours="abonnement" etape={2} />

      <h1 className={ecran.titre}>{traduire(langue, 'souscription.titre')}</h1>

      <BandeauSimulation langue={langue} />

      {erreur ? (
        <p className={ecran.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {/* ── La formule retenue, et le moyen d'en changer ──────────────────── */}
      <dl className={ecran.totaux}>
        <div className={ecran.totalFinal}>
          <dt>{traduire(langue, `souscription.${offre}` as CleTraduction)}</dt>
          <dd>{formule?.affichage ?? ''}</dd>
        </div>
      </dl>

      <p className={ecran.intro}>
        <a className={ecran.boutonDiscret} href={base}>
          {traduire(langue, 'souscription.formuleTitre')}
        </a>
      </p>

      {moyen === null ? (
        <ChoixMoyens
          langue={langue}
          lienDuMoyen={(valeur) => `${base}?offre=${offre}&moyen=${valeur}`}
        />
      ) : (
        <>
          <p className={ecran.intro}>
            {traduire(langue, `moyens.${moyen}` as CleTraduction)}{' '}
            <a className={ecran.boutonDiscret} href={`${base}?offre=${offre}`}>
              {traduire(langue, 'moyens.changer')}
            </a>
          </p>

          <form action={souscrire.bind(null, langue, 'reussi')}>
            <input type="hidden" name="offre" value={offre} />
            <input type="hidden" name="moyen" value={moyen} />

            <ChampsCoordonnees
              langue={langue}
              moyen={moyen}
              emailDefaut={appelant.email}
              enDefaut={enDefaut}
            />

            <button type="submit" className={ecran.boutonPrimaire}>
              {traduire(langue, 'souscription.souscrire')}
            </button>
          </form>

          {preparation.joursEssai > 0 ? (
            <p className={tunnel.mention}>
              {traduire(langue, 'souscription.essaiNote').replace(
                '{jours}',
                String(preparation.joursEssai),
              )}
            </p>
          ) : null}

          <section className={tunnel.simulation}>
            <h2 className={tunnel.simulationTitre}>{traduire(langue, 'simulation.titre')}</h2>
            <p className={tunnel.simulationCorps}>{traduire(langue, 'simulation.corps')}</p>

            <div className={tunnel.simulationBoutons}>
              {/*
                Un seul bouton d'échec, et pas d'abandon : un prestataire dont
                le PREMIER prélèvement échoue n'envoie rien du tout — aucun
                abonnement n'a été créé chez lui. L'abandon d'une souscription
                est donc indiscernable de son échec, et lui donner un second
                bouton laisserait croire à deux issues distinctes.
              */}
              <form action={souscrire.bind(null, langue, 'echoue')}>
                <input type="hidden" name="offre" value={offre} />
                <button type="submit" className={ecran.boutonSecondaire}>
                  {traduire(langue, 'simulation.echouer')}
                </button>
              </form>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
