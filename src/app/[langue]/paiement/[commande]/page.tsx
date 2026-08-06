import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import { identifierAppelant } from '@/lib/auth/session';
import { lireCommandeDe } from '@/lib/orders/lecture';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { estMoyenPaiement, type MoyenPaiement } from '@/domain/payments/moyens';
import { champsEnDefaut } from '@/lib/tunnel/coordonnees';
import {
  BandeauSimulation,
  ChampsCoordonnees,
  ChoixMoyens,
  FilEtapes,
  stylesTunnel as tunnel,
} from '@/components/tunnel';
import ecran from '@/components/ecran/ecran.module.css';
import { reglerCommande } from '../../panier/actions';

/**
 * Règlement d'une commande — SIMULÉ, et l'écran le dit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN NUMÉRO DE CARTE N'EST DEMANDÉ, ET AUCUN NE LE SERA.               │
 * │                                                                          │
 * │ La règle n'a pas bougé, sa portée s'est précisée. L'écran demande         │
 * │ désormais un moyen de paiement et des coordonnées — parce qu'un tunnel   │
 * │ sans ces deux choses ne se démontre pas — mais le NUMÉRO DE CARTE reste  │
 * │ hors d'ici, et pour de bon : les prestataires réels imposent des champs  │
 * │ hébergés chez eux, précisément pour que le numéro ne touche jamais le    │
 * │ serveur du marchand. Le formulaire écrit aujourd'hui est donc celui que  │
 * │ l'intégration réelle demandera.                                          │
 * │                                                                          │
 * │ Le Mobile Money, lui, fonctionne bien par NUMÉRO DE TÉLÉPHONE : l'API de │
 * │ l'opérateur pousse une confirmation sur le combiné. Le demander est      │
 * │ exact, et ce champ survivra tel quel à l'intégration.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE STATUT AFFICHÉ EST RELU EN BASE, JAMAIS DÉDUIT DE L'ACTION.          │
 * │                                                                          │
 * │ CLAUDE.md règle 5 : les webhooks sont la seule source de vérité sur      │
 * │ l'état d'un paiement, et une redirection de navigateur ne déclenche      │
 * │ jamais l'octroi d'un droit. Arriver ici après avoir cliqué « payer »     │
 * │ n'affiche donc pas « payé » : cette page interroge la commande, et       │
 * │ montre ce que la base dit.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS SOUS-ÉCRANS SUR UNE SEULE ADRESSE, DÉCIDÉS PAR `?moyen=`.         │
 * │                                                                          │
 * │   * sans `moyen` — le choix du moyen de paiement ;                       │
 * │   * avec un `moyen` connu — ses champs, et le bouton de règlement ;      │
 * │   * commande plus `en_attente` — l'issue, quel que soit `moyen`.         │
 * │                                                                          │
 * │ Le troisième cas est testé EN PREMIER : arriver sur `?moyen=carte` pour  │
 * │ une commande déjà payée doit montrer le reçu, jamais un formulaire qui   │
 * │ la ferait payer deux fois.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string; commande: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'paiement.titre'),
    robots: { index: false, follow: false },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PagePaiement({ params, searchParams }: Parametres) {
  const { langue: langueBrute, commande: identifiant } = await params;
  const langue = langueValide(langueBrute);
  const requete = await searchParams;

  if (!UUID.test(identifiant)) notFound();

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  // `lireCommandeDe` porte le filtre sur `user_id` : la commande d'autrui
  // n'est jamais chargée, et produit donc un 404 comme un identifiant inconnu
  // — jamais un 403, qui confirmerait son existence.
  const commande = await lireCommandeDe(appelant.id, identifiant);
  if (!commande) notFound();

  const afficher = formateur(await lireDevise(commande.devise));

  // ── L'issue, quand la commande n'est plus payable ───────────────────────
  if (commande.statut !== 'en_attente') {
    const payee = commande.statut === 'paye';

    return (
      <div className={ecran.pageEtroite}>
        <FilEtapes langue={langue} parcours="achat" etape={4} />

        <h1 className={ecran.titre}>{traduire(langue, 'paiement.titre')}</h1>

        <section className={ecran.panneau}>
          {/*
            Les quatre statuts de `order_status`, et rien d'inventé :
            `en_attente` est traité plus haut, restent `paye`, `echoue` et
            `rembourse`. Un abandon laisse la commande en échec — le
            prestataire ne distingue pas les deux, et l'interface non plus.
          */}
          <p className={ecran.panneauTexteFort}>
            {traduire(
              langue,
              payee
                ? 'paiement.payee'
                : commande.statut === 'rembourse'
                  ? 'paiement.remboursee'
                  : 'paiement.echouee',
            )}
          </p>

          <dl className={ecran.totaux} style={{ width: '100%', margin: 0 }}>
            <div className={ecran.totalLigne}>
              <dt>{traduire(langue, 'paiement.commande')}</dt>
              <dd>{commande.id}</dd>
            </div>

            <div className={ecran.totalFinal}>
              <dt>{traduire(langue, 'paiement.montant')}</dt>
              <dd>{afficher(commande.montant_total)}</dd>
            </div>
          </dl>

          {payee ? (
            <a className={ecran.boutonPrimaire} href={`/${langue}/compte/bibliotheque`}>
              {traduire(langue, 'paiement.versBibliotheque')}
            </a>
          ) : (
            <a className={ecran.boutonSecondaire} href={`/${langue}/panier`}>
              {traduire(langue, 'paiement.versPanier')}
            </a>
          )}
        </section>
      </div>
    );
  }

  const moyenDemande = premier(requete['moyen']);
  const moyen: MoyenPaiement | null = estMoyenPaiement(moyenDemande) ? moyenDemande : null;
  const enDefaut = champsEnDefaut(premier(requete['champs']));
  const base = `/${langue}/paiement/${commande.id}`;

  return (
    <div className={ecran.pageEtroite}>
      <FilEtapes langue={langue} parcours="achat" etape={3} />

      <h1 className={ecran.titre}>{traduire(langue, 'paiement.titre')}</h1>

      <BandeauSimulation langue={langue} />

      {/* ── Ce qui va être débité ────────────────────────────────────────── */}
      <dl className={ecran.totaux}>
        <div className={ecran.totalLigne}>
          <dt>{traduire(langue, 'paiement.commande')}</dt>
          <dd>{commande.id}</dd>
        </div>

        <div className={ecran.totalFinal}>
          <dt>{traduire(langue, 'paiement.montant')}</dt>
          <dd>{afficher(commande.montant_total)}</dd>
        </div>
      </dl>

      {moyen === null ? (
        <ChoixMoyens
          langue={langue}
          lienDuMoyen={(valeur) => `${base}?moyen=${valeur}`}
        />
      ) : (
        <>
          {/*
            Le moyen retenu, et le moyen d'en changer.

            Sans ce retour, changer d'avis obligerait à revenir en arrière dans
            l'historique du navigateur — geste que personne ne fait au milieu
            d'un paiement, et qui donne l'impression d'être enfermé.
          */}
          <p className={ecran.intro}>
            {traduire(langue, `moyens.${moyen}` as CleTraduction)}{' '}
            <a className={ecran.boutonDiscret} href={base}>
              {traduire(langue, 'moyens.changer')}
            </a>
          </p>

          <form action={reglerCommande.bind(null, langue, commande.id, 'reussi')}>
            {/* Le moyen voyage AVEC le formulaire : l'action doit savoir quels
                champs exiger, et l'URL seule ne lui parvient pas. */}
            <input type="hidden" name="moyen" value={moyen} />

            <ChampsCoordonnees
              langue={langue}
              moyen={moyen}
              emailDefaut={appelant.email}
              enDefaut={enDefaut}
            />

            {/*
              LE MONTANT EST ÉCRIT SUR LE BOUTON, ET IL VIENT DU SERVEUR.

              « Payer » seul oblige à remonter des yeux pour vérifier ce qu'on
              s'apprête à débiter, au moment précis où l'on hésite. Le montant
              affiché est celui que `formateur` a mis en forme depuis la devise
              de la commande — jamais un nombre recomposé ici.
            */}
            <button type="submit" className={ecran.boutonPrimaire}>
              {traduire(langue, 'paiement.payerMontant').replace(
                '{montant}',
                afficher(commande.montant_total),
              )}
            </button>
          </form>

          {/*
            ┌────────────────────────────────────────────────────────────────┐
            │ L'ÉCHEC ET L'ABANDON RESTENT ATTEIGNABLES, ET À L'ÉCART.      │
            │                                                                │
            │ Ne simuler que le succès laisserait sans écran les deux cas où │
            │ le client a le plus besoin d'être rassuré. Mais mêlés au       │
            │ bouton de paiement, ils se ressembleraient assez pour être     │
            │ pressés l'un pour l'autre : d'où le trait, le titre, et le     │
            │ rappel de ce qu'ils sont.                                      │
            │                                                                │
            │ Ils n'exigent AUCUNE coordonnée — un abandon n'a pas à passer  │
            │ la validation d'un formulaire qu'on abandonne justement.       │
            └────────────────────────────────────────────────────────────────┘
          */}
          <section className={tunnel.simulation}>
            <h2 className={tunnel.simulationTitre}>{traduire(langue, 'simulation.titre')}</h2>
            <p className={tunnel.simulationCorps}>{traduire(langue, 'simulation.corps')}</p>

            <div className={tunnel.simulationBoutons}>
              <form action={reglerCommande.bind(null, langue, commande.id, 'echoue')}>
                <button type="submit" className={ecran.boutonSecondaire}>
                  {traduire(langue, 'simulation.echouer')}
                </button>
              </form>

              <form action={reglerCommande.bind(null, langue, commande.id, 'abandonne')}>
                <button type="submit" className={ecran.boutonDiscret}>
                  {traduire(langue, 'simulation.abandonner')}
                </button>
              </form>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
