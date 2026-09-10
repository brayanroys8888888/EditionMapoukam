import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { apercu } from '@/lib/orders/orders';
import { identifierAppelantAvecCookies } from '@/lib/auth/session';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { FilEtapes, stylesTunnel as tunnel } from '@/components/tunnel';
import {
  CarteTunnelV3,
  CoquilleTunnelV3,
  stylesTunnelV3 as t3,
} from '@/components/v2/tunnel-v3';
import { estV3 } from '@/design/version';
import ecran from '@/components/ecran/ecran.module.css';
import { commander, retirerDuPanier } from '../actions';

/**
 * RÉCAPITULATIF — le dernier écran avant qu'une commande existe.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UNE ÉTAPE DE PLUS.                                             │
 * │                                                                          │
 * │ Le panier menait directement au règlement : presser « Commander »        │
 * │ écrivait une commande, et l'on découvrait le montant définitif sur       │
 * │ l'écran de paiement. Une commande écrite ne se dé-crée pas — elle a un   │
 * │ identifiant, elle apparaît dans l'administration, un webhook peut        │
 * │ arriver dessus. Elle mérite un geste délibéré.                          │
 * │                                                                          │
 * │ Cet écran ne demande rien de neuf : il montre ce qui va être facturé, ce │
 * │ que l'achat donne, et il attend.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TOTAL EST RELU, JAMAIS TRANSPORTÉ DEPUIS LE PANIER.                  │
 * │                                                                          │
 * │ `apercu` est le module qu'emploie `PUT /api/orders`. Passer le montant   │
 * │ par l'URL aurait fait de cet écran une seconde autorité sur le prix, et  │
 * │ un panier modifié dans un autre onglet aurait été facturé au montant de  │
 * │ celui-ci.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'recapitulatif.titre'),
    // Un récapitulatif de panier n'a rien à faire dans un moteur de recherche.
    robots: { index: false, follow: false },
  };
}

export default async function PageConfirmationPanier({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  const codePromo = premier(requete['promo']) ?? null;

  let vue;
  let formater;
  try {
    vue = await apercu(appelant, { zoneAffichee: 'international', codePromo });
    if (vue) formater = formateur(await lireDevise(vue.total.devise));
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  // Un panier vidé entre-temps — dans un autre onglet, ou par une commande déjà
  // passée — ramène au panier, qui sait, lui, quoi proposer. Rester ici
  // afficherait un récapitulatif de rien avec un bouton pour le payer.
  if (!vue || vue.total.lignes.length === 0) redirect(`/${langue}/panier`);

  const afficher = formater ?? ((montant: number) => String(montant));
  const erreur = premier(requete['erreur']);
  const aConfirmer = premier(requete['a_confirmer']);

  /*
   * Sous Organic, l'étape 2 prend la coquille du règlement — même fil, mêmes
   * cartes, même récapitulatif à droite. Les données sont identiques d'un
   * rendu à l'autre : le total vient du serveur dans les deux cas.
   */
  if (estV3()) {
    return (
      <CoquilleTunnelV3
        langue={langue}
        parcours="achat"
        etape={1}
        titre={traduire(langue, 'recapitulatif.titre')}
        alerte={erreur ? messageErreur(langue, erreur) : null}
        colonne={
          <aside className={t3.recap}>
            <h2 className={t3.recapTitre}>{traduire(langue, 'paiement.recapTitre')}</h2>

            <dl className={t3.totaux}>
              <div className={t3.totalLigne}>
                <dt>{traduire(langue, 'panier.sousTotal')}</dt>
                <dd>{afficher(vue.total.sousTotal)}</dd>
              </div>

              {vue.total.remise > 0 ? (
                <div className={t3.totalLigne}>
                  <dt>{traduire(langue, 'panier.remise')}</dt>
                  <dd>−{afficher(vue.total.remise)}</dd>
                </div>
              ) : null}

              <div className={t3.totalFinal}>
                <dt>{traduire(langue, 'panier.total')}</dt>
                <dd className={t3.totalMontant}>{afficher(vue.total.total)}</dd>
              </div>
            </dl>

            {/*
              LA DIVERGENCE DE ZONE EST DITE ICI, et c'est le bon endroit.
              D4 point 5 : « aucun montant n'est jamais modifié silencieusement ».
              Le pays du moyen de paiement change la grille ; c'est à l'instant
              de confirmer qu'il faut le lire, pas trois écrans plus tôt.
            */}
            {vue.zoneDivergente ? (
              <p className={t3.recapAttente}>{traduire(langue, 'panier.zoneDivergente')}</p>
            ) : null}

            <form action={commander.bind(null, langue)}>
              {codePromo ? <input type="hidden" name="code_promo" value={codePromo} /> : null}

              {/*
                `total_confirme` ne sert QU'À COMPARER, jamais à facturer : un
                total qui ne correspond pas au calcul du serveur fait échouer la
                commande, il ne la modifie pas.
              */}
              {aConfirmer ? (
                <input type="hidden" name="total_confirme" value={aConfirmer} />
              ) : null}

              <button type="submit" className={t3.payer}>
                {traduire(langue, 'recapitulatif.payer')}
              </button>
            </form>

            <p className={t3.recapMention}>{traduire(langue, 'recapitulatif.sansExpedition')}</p>
          </aside>
        }
        enfants={
          <>
            <CarteTunnelV3
              titre={traduire(langue, 'recapitulatif.articlesTitre')}
              enfants={
                <ul className={t3.lignes}>
                  {vue.total.lignes.map((ligne) => (
                    <li key={`${ligne.bookId}:${ligne.langue}`} className={t3.ligne}>
                      <span className={t3.ligneTexte}>
                        <span className={t3.ligneTitre}>{ligne.titre}</span>
                        <span className={t3.ligneMeta}>{ligne.langue.toUpperCase()}</span>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
                        <span className={t3.lignePrix}>{afficher(ligne.prixUnitaire)}</span>
                        <form action={retirerDuPanier.bind(null, langue, ligne.bookId)}>
                          <button type="submit" className={t3.boutonDiscret} style={{ fontSize: '13px', cursor: 'pointer' }}>
                            {traduire(langue, 'panier.retirer')}
                          </button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              }
            />

            {/* ── Code promo ──────────────────────────────────────────── */}
            <CarteTunnelV3
              titre={traduire(langue, 'panier.codePromo')}
              enfants={
                <form method="get" action={`/${langue}/panier/confirmation`}>
                  <input
                    className={t3.saisie}
                    id="code-promo"
                    name="promo"
                    defaultValue={codePromo ?? ''}
                    aria-label={traduire(langue, 'panier.codePromo')}
                  />

                  {vue.refusPromo ? (
                    <p className={t3.recapAttente} role="alert">
                      {traduire(
                        langue,
                        `panier.refus_promo_${vue.refusPromo}` as CleTraduction,
                      )}
                    </p>
                  ) : null}

                  <button type="submit" className={t3.boutonSecondaire}>
                    {traduire(langue, 'panier.codePromoAppliquer')}
                  </button>
                </form>
              }
            />

            {/*
              CE QUE L'ACHAT DONNE, ÉNONCÉ AVANT DE PAYER ET NON APRÈS.

              L'achat donne le FICHIER ; l'abonnement ne l'a jamais donné.
              C'est la confusion la plus coûteuse du domaine, et le seul moment
              où la lire change quelque chose est celui-ci.
            */}
            <CarteTunnelV3
              titre={traduire(langue, 'recapitulatif.donneTitre')}
              enfants={
                <ul className={t3.lignes}>
                  {(['donne1', 'donne2', 'donne3'] as const).map((cle) => (
                    <li key={cle} className={t3.ligne}>
                      <span className={t3.ligneTexte}>
                        {traduire(langue, `recapitulatif.${cle}` as CleTraduction)}
                      </span>
                    </li>
                  ))}
                </ul>
              }
            />

            <a className={t3.boutonDiscret} href={`/${langue}/panier`}>
              {traduire(langue, 'recapitulatif.modifier')}
            </a>
          </>
        }
      />
    );
  }

  return (
    <div className={ecran.pageEtroite}>
      <FilEtapes langue={langue} parcours="achat" etape={1} />

      <h1 className={ecran.titre}>{traduire(langue, 'recapitulatif.titre')}</h1>
      <p className={ecran.intro}>{traduire(langue, 'recapitulatif.intro')}</p>

      {erreur ? (
        <p className={ecran.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {/* ── Ce qui est commandé ──────────────────────────────────────────── */}
      <h2 className={ecran.sousTitre}>{traduire(langue, 'recapitulatif.articlesTitre')}</h2>

      <ul className={ecran.lignes}>
        {vue.total.lignes.map((ligne) => (
          <li key={`${ligne.bookId}:${ligne.langue}`} className={ecran.ligne}>
            <span className={ecran.ligneTitre}>{ligne.titre}</span>
            <span className={ecran.ligneCote}>
              <span className={ecran.montant}>{afficher(ligne.prixUnitaire)}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* ── Totaux ───────────────────────────────────────────────────────── */}
      <dl className={ecran.totaux}>
        <div className={ecran.totalLigne}>
          <dt>{traduire(langue, 'panier.sousTotal')}</dt>
          <dd>{afficher(vue.total.sousTotal)}</dd>
        </div>

        {vue.total.remise > 0 ? (
          <div className={ecran.totalLigne}>
            <dt>{traduire(langue, 'panier.remise')}</dt>
            <dd>−{afficher(vue.total.remise)}</dd>
          </div>
        ) : null}

        <div className={ecran.totalFinal}>
          <dt>{traduire(langue, 'panier.total')}</dt>
          <dd>{afficher(vue.total.total)}</dd>
        </div>
      </dl>

      {/*
        LA DIVERGENCE DE ZONE EST DITE ICI AUSSI, ET C'EST LE BON ENDROIT.

        D4 point 5 : « aucun montant n'est jamais modifié silencieusement ». Le
        pays du moyen de paiement change la grille ; c'est à l'instant de
        confirmer qu'il faut le lire, pas trois écrans plus tôt.
      */}
      {vue.zoneDivergente ? (
        <p className={`${ecran.panneau} ${ecran.panneauAttention} ${ecran.section}`}>
          <span className={ecran.panneauTexte}>{traduire(langue, 'panier.zoneDivergente')}</span>
        </p>
      ) : null}

      {/* ── Ce que l'achat donne ─────────────────────────────────────────── */}
      {/*
        ÉNONCÉ AVANT DE PAYER, ET NON APRÈS.

        L'achat donne le FICHIER ; l'abonnement ne l'a jamais donné. C'est la
        confusion la plus coûteuse du domaine, et le seul moment où la lire
        change quelque chose est celui-ci.
      */}
      <section className={`${ecran.panneau} ${ecran.section}`}>
        <h2 className={ecran.panneauTitre}>{traduire(langue, 'recapitulatif.donneTitre')}</h2>

        <ul className={ecran.definitions} style={{ width: '100%' }}>
          {(['donne1', 'donne2', 'donne3'] as const).map((cle) => (
            <li key={cle} className={ecran.definition}>
              <span className={ecran.valeur}>
                {traduire(langue, `recapitulatif.${cle}` as CleTraduction)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className={tunnel.mention}>{traduire(langue, 'recapitulatif.sansExpedition')}</p>

      {/* ── Confirmer ────────────────────────────────────────────────────── */}
      <div className={tunnel.actions}>
        <form action={commander.bind(null, langue)}>
          {codePromo ? <input type="hidden" name="code_promo" value={codePromo} /> : null}

          {/*
            `total_confirme` ne sert QU'À COMPARER, jamais à facturer : un total
            qui ne correspond pas au calcul du serveur fait échouer la commande,
            il ne la modifie pas. Il n'est transmis que lorsque le serveur a
            demandé une confirmation explicite.
          */}
          {aConfirmer ? <input type="hidden" name="total_confirme" value={aConfirmer} /> : null}

          <button type="submit" className={ecran.boutonPrimaire}>
            {traduire(langue, 'recapitulatif.payer')}
          </button>
        </form>

        <a className={ecran.boutonDiscret} href={`/${langue}/panier`}>
          {traduire(langue, 'recapitulatif.modifier')}
        </a>
      </div>
    </div>
  );
}
