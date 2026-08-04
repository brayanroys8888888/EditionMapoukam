import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { langueValide, traduire } from '@/i18n';
import { identifierAppelant } from '@/lib/auth/session';
import { lireCommandeDe } from '@/lib/orders/lecture';
import { formateur, lireDevise } from '@/lib/money/affichage';
import ecran from '@/components/ecran/ecran.module.css';
import { reglerCommande } from '../../panier/actions';

/**
 * Règlement d'une commande — SIMULÉ, et l'écran le dit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN NUMÉRO DE CARTE N'EST DEMANDÉ, ET AUCUN NE LE SERA.               │
 * │                                                                          │
 * │ Un faux formulaire de paiement — même en démonstration, même sans        │
 * │ enregistrer quoi que ce soit — apprend aux gens à saisir leurs           │
 * │ coordonnées bancaires sur un écran qui n'encaisse rien. Trois boutons    │
 * │ nommés valent mieux, et ne trompent personne.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE STATUT AFFICHÉ EST RELU EN BASE, JAMAIS DÉDUIT DE L'ACTION.          │
 * │                                                                          │
 * │ CLAUDE.md règle 5 : les webhooks sont la seule source de vérité sur      │
 * │ l'état d'un paiement, et une redirection de navigateur ne déclenche      │
 * │ jamais l'octroi d'un droit. Arriver ici après avoir cliqué « réussi »    │
 * │ n'affiche donc pas « payé » : cette page interroge la commande, et       │
 * │ montre « en cours de confirmation » tant que le webhook n'a pas abouti.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string; commande: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return { title: traduire(langue, 'paiement.titre') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PagePaiement({ params }: Parametres) {
  const { langue: langueBrute, commande: identifiant } = await params;
  const langue = langueValide(langueBrute);

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
  const enAttente = commande.statut === 'en_attente';

  return (
    <div className={ecran.pageEtroite}>
      <h1 className={ecran.titre}>{traduire(langue, 'paiement.titre')}</h1>
      <p className={ecran.intro}>{traduire(langue, 'paiement.banniereCorps')}</p>

      {/*
        LA MENTION DE SIMULATION, EN TÊTE ET SANS AMBIGUÏTÉ.

        Elle n'est pas une note de bas de page : c'est la première chose que
        lit quelqu'un qui croit être en train de payer. En crème plutôt qu'en
        rouge — rien n'a échoué, il s'agit de dire ce qui se passe réellement.
      */}
      <section className={`${ecran.panneau} ${ecran.panneauAttention} ${ecran.section}`}>
        <h2 className={ecran.panneauTitre}>{traduire(langue, 'paiement.banniereTitre')}</h2>

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
      </section>

      {enAttente ? (
        <div className={ecran.formulaire}>
          {/*
            Trois issues, parce qu'un prestataire réel en produit trois. Ne
            simuler que le succès laisserait l'échec et l'abandon sans écran —
            c'est-à-dire les deux cas où le client a besoin d'être rassuré.

            Chacune émet un VRAI événement signé vers le VRAI gestionnaire de
            webhooks : seul l'émetteur est simulé.
          */}
          <form action={reglerCommande.bind(null, langue, commande.id, 'reussi')}>
            <button type="submit" className={ecran.boutonPrimaire}>
              {traduire(langue, 'paiement.reussir')}
            </button>
          </form>

          <form action={reglerCommande.bind(null, langue, commande.id, 'echoue')}>
            <button type="submit" className={ecran.boutonSecondaire}>
              {traduire(langue, 'paiement.echouer')}
            </button>
          </form>

          <form action={reglerCommande.bind(null, langue, commande.id, 'abandonne')}>
            <button type="submit" className={ecran.boutonDiscret}>
              {traduire(langue, 'paiement.abandonner')}
            </button>
          </form>

          <p className={ecran.aide}>{traduire(langue, 'paiement.enAttente')}</p>
        </div>
      ) : (
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
              commande.statut === 'paye'
                ? 'paiement.payee'
                : commande.statut === 'rembourse'
                  ? 'paiement.remboursee'
                  : 'paiement.echouee',
            )}
          </p>

          {commande.statut === 'paye' ? (
            <a className={ecran.boutonPrimaire} href={`/${langue}/compte/bibliotheque`}>
              {traduire(langue, 'paiement.versBibliotheque')}
            </a>
          ) : (
            <a className={ecran.boutonSecondaire} href={`/${langue}/panier`}>
              {traduire(langue, 'paiement.versPanier')}
            </a>
          )}
        </section>
      )}
    </div>
  );
}
