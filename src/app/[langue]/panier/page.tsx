import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { apercu } from '@/lib/orders/orders';
import { identifierAppelantAvecCookies } from '@/lib/auth/session';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { Motif } from '@/components/motif';
import { FilEtapes } from '@/components/tunnel';
import {
  CarteTunnelV3,
  CoquilleTunnelV3,
  stylesTunnelV3 as t3,
} from '@/components/v2/tunnel-v3';
import { estV3 } from '@/design/version';
import ecran from '@/components/ecran/ecran.module.css';
import { retirerDuPanier } from './actions';

/**
 * Panier — §4.1 F6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TOTAL VIENT DU SERVEUR, JAMAIS D'UNE ADDITION.                       │
 * │                                                                          │
 * │ `apercu` est le module qu'emploie `PUT /api/orders`. Additionner les     │
 * │ `prix_unitaire` affichés donnerait un résultat juste la plupart du       │
 * │ temps — et faux dès qu'un code promo, une remise ou une zone             │
 * │ d'encaissement différente entre en jeu. C'est le piège le plus probable  │
 * │ de tout ce chantier, et un test d'architecture le garde.                 │
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
  return { title: traduire(langue, 'panier.titre') };
}

export default async function PagePanier({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  const codePromo = premier(requete['promo']) ?? null;
  const erreur = premier(requete['erreur']) ?? null;

  let vue;
  let formater;
  try {
    vue = await apercu(appelant, { zoneAffichee: 'international', codePromo });
    if (vue) formater = formateur(await lireDevise(vue.total.devise));
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  // Si le panier a des articles, aller directement au récapitulatif (Étape 1 du tunnel en 3 étapes).
  if (vue && vue.total.lignes.length > 0) {
    const params = new URLSearchParams();
    if (codePromo) params.set('promo', codePromo);
    if (erreur) params.set('erreur', erreur);
    const qs = params.toString();
    redirect(`/${langue}/panier/confirmation${qs ? `?${qs}` : ''}`);
  }

  // Panier vide : un cul-de-sac sans issue serait un écran mort.
  if (!vue || vue.total.lignes.length === 0) {
    /*
     * Le panier VIDE a sa propre sortie, et il faut donc le traiter ici : la
     * branche Organic plus bas ne serait jamais atteinte, et c'est exactement
     * l'écran par lequel on passe en premier quand on clique sur la pastille
     * sans avoir rien ajouté.
     */
    if (estV3()) {
      return (
        <CoquilleTunnelV3
          langue={langue}
          parcours="achat"
          etape={1}
          titre={traduire(langue, 'panier.titre')}
          enfants={
            <CarteTunnelV3
              enfants={
                <>
                  <p className={t3.recapTitre}>{traduire(langue, 'panier.vide')}</p>
                  <p className={t3.recapMention}>{traduire(langue, 'offres.achatResume')}</p>

                  {/* Jamais un cul-de-sac : dire ce qui manque, et donner une
                      action. Elle mène au RAYON, d'où l'on ajoute des titres. */}
                  <a className={t3.payer} href={`/${langue}/contes`}>
                    {traduire(langue, 'panier.videAction')}
                  </a>
                </>
              }
            />
          }
        />
      );
    }

    return (
      <div className={ecran.pageEtroite}>
        <h1 className={ecran.titre}>{traduire(langue, 'panier.titre')}</h1>

        {/*
          Pas d'introduction ici : elle disait « Votre panier est vide », et
          l'encart juste en dessous le redit mot pour mot. La phrase lue deux
          fois à trois centimètres d'intervalle ne rassure pas, elle donne
          l'impression d'un écran monté deux fois.
        */}

        {/* Jamais un cul-de-sac : dire ce qui manque, et donner une action. */}
        <div className={ecran.vide}>
          <Motif teinte="vide" place="plein" rayon="14px" className={ecran.videMotif} />

          <div className={ecran.videTexte}>
            <p className={ecran.videTitre}>{traduire(langue, 'panier.vide')}</p>
            <p className={ecran.videCorps}>{traduire(langue, 'offres.achatResume')}</p>
          </div>

          <a className={ecran.boutonPrimaire} href={`/${langue}/catalogue`}>
            {traduire(langue, 'panier.videAction')}
          </a>
        </div>
      </div>
    );
  }

  const afficher = formater ?? ((montant: number) => String(montant));

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ SOUS ORGANIC, LE PANIER EST LA PREMIÈRE ÉTAPE D'UN MÊME TUNNEL.       │
   * │                                                                        │
   * │ Il rendait la mise en page d'origine pendant que le règlement, deux    │
   * │ écrans plus loin, était redessiné : on changeait donc d'apparence au   │
   * │ milieu d'un achat. Les DONNÉES ne changent pas d'un rendu à l'autre —  │
   * │ mêmes lignes, mêmes refus, même total lu du serveur. Seule la coquille │
   * │ change, et elle est celle du règlement.                                │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  if (estV3()) {
    const recapitulatif = (
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
          Le lien mène au récapitulatif, jamais directement au paiement : une
          commande écrite ne se dé-crée pas, elle mérite un geste explicite.
          Un LIEN et non un formulaire, parce que la destination ne mute rien.
        */}
        <a
          className={t3.payer}
          href={`/${langue}/panier/confirmation${
            codePromo ? `?promo=${encodeURIComponent(codePromo)}` : ''
          }`}
        >
          {traduire(langue, 'panier.commander')}
        </a>

        <p className={t3.recapMention}>{traduire(langue, 'paiement.livraisonImmediate')}</p>
      </aside>
    );

    return (
      <CoquilleTunnelV3
        langue={langue}
        parcours="achat"
        etape={1}
        titre={traduire(langue, 'panier.titre')}
        alerte={erreur ? messageErreur(langue, erreur) : null}
        colonne={recapitulatif}
        enfants={
          <>
            <CarteTunnelV3
              enfants={
                <ul className={t3.lignes}>
                  {vue.total.lignes.map((ligne) => (
                    <li key={`${ligne.bookId}:${ligne.langue}`} className={t3.ligne}>
                      <span className={t3.ligneTexte}>
                        <span className={t3.ligneTitre}>{ligne.titre}</span>
                        <span className={t3.ligneMeta}>{ligne.langue.toUpperCase()}</span>
                      </span>

                      <span className={t3.lignePrix}>{afficher(ligne.prixUnitaire)}</span>

                      {/*
                        Retirer une ligne est une Server Action, jamais un
                        lien : un `GET` qui modifie un panier est rejoué par le
                        moindre préchargement, et par tout robot qui suit les
                        liens de la page.
                      */}
                      <form action={retirerDuPanier.bind(null, langue, ligne.bookId)}>
                        <button type="submit" className={t3.boutonDiscret}>
                          {traduire(langue, 'panier.retirer')}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              }
            />

            {/* ── Lignes refusées ─────────────────────────────────────── */}
            {vue.refusees.length > 0 ? (
              <CarteTunnelV3
                titre={traduire(langue, 'panier.refuseesTitre')}
                enfants={
                  <ul className={t3.lignes}>
                    {vue.refusees.map((refus) => (
                      <li key={refus.bookId} className={t3.ligne}>
                        <span className={t3.ligneTexte}>
                          <span className={t3.ligneTitre}>{refus.titre}</span>
                          {/*
                            QUATRE MOTIFS, QUATRE MESSAGES. Un titre écarté en
                            silence est perçu comme une panne.
                          */}
                          <span className={t3.ligneMeta}>
                            {traduire(langue, `panier.refus_${refus.raison}` as CleTraduction)}
                          </span>
                        </span>

                        {/*
                          `deja_possede` propose d'aller LIRE le titre, jamais
                          de le retirer : on ne renvoie pas quelqu'un vers une
                          corbeille pour lui apprendre qu'il possède déjà ce
                          qu'il voulait acheter.
                        */}
                        {refus.raison === 'deja_possede' ? (
                          <a
                            className={t3.boutonDiscret}
                            href={`/${langue}/compte/bibliotheque`}
                          >
                            {traduire(langue, 'panier.refus_deja_possede_action')}
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                }
              />
            ) : null}

            {/* ── Code promo ──────────────────────────────────────────── */}
            <CarteTunnelV3
              titre={traduire(langue, 'panier.codePromo')}
              enfants={
                <form method="get" action={`/${langue}/panier`}>
                  <input
                    className={t3.saisie}
                    id="code-promo"
                    name="promo"
                    defaultValue={codePromo ?? ''}
                    aria-label={traduire(langue, 'panier.codePromo')}
                  />

                  {/*
                    UN CODE ÉCARTÉ EST DIT, JAMAIS SILENCIEUX : un code ignoré
                    sans explication est perçu comme une panne, et le client
                    conclut que la remise annoncée n'existe pas.
                  */}
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

            {vue.zoneDivergente ? (
              <p className={t3.recapAttente}>{traduire(langue, 'panier.zoneDivergente')}</p>
            ) : null}
          </>
        }
      />
    );
  }

  return (
    <div className={ecran.pageEtroite}>
      <FilEtapes langue={langue} parcours="achat" etape={1} />

      <h1 className={ecran.titre}>{traduire(langue, 'panier.titre')}</h1>
      <p className={ecran.intro}>{traduire(langue, 'offres.achatResume')}</p>

      {erreur ? (
        <p className={ecran.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {/* ── Lignes commandables ──────────────────────────────────────────── */}
      <ul className={ecran.lignes}>
        {vue.total.lignes.map((ligne) => (
          <li key={`${ligne.bookId}:${ligne.langue}`} className={ecran.ligne}>
            <span className={ecran.ligneTitre}>{ligne.titre}</span>

            <span className={ecran.ligneCote}>
              <span className={ecran.montant}>{afficher(ligne.prixUnitaire)}</span>
              {/*
                Retirer une ligne est une Server Action, jamais un lien : un
                `GET` qui modifie un panier est rejoué par le moindre
                préchargement de navigateur, et par tout robot qui suit les
                liens de la page.
              */}
              <form action={retirerDuPanier.bind(null, langue, ligne.bookId)}>
                <button type="submit" className={ecran.boutonDiscret}>
                  {traduire(langue, 'panier.retirer')}
                </button>
              </form>
            </span>
          </li>
        ))}
      </ul>

      {/* ── Lignes refusées ──────────────────────────────────────────────── */}
      {vue.refusees.length > 0 ? (
        <section className={`${ecran.panneau} ${ecran.panneauAttention} ${ecran.section}`}>
          <h2 className={ecran.panneauTitre}>{traduire(langue, 'panier.refuseesTitre')}</h2>

          <ul className={ecran.definitions} style={{ width: '100%' }}>
            {vue.refusees.map((refus) => (
              <li key={refus.bookId} className={ecran.definition}>
                <span className={ecran.terme}>{refus.titre}</span>

                <span className={ecran.valeur}>
                  {/*
                    QUATRE MOTIFS, QUATRE MESSAGES. Un titre écarté en silence
                    est perçu comme une panne, et un message unique laisse le
                    client sans moyen de comprendre ce qu'il doit faire.
                  */}
                  {traduire(langue, `panier.refus_${refus.raison}` as CleTraduction)}{' '}
                  {/*
                    `deja_possede` propose d'aller LIRE le titre, jamais de le
                    retirer : on ne renvoie pas quelqu'un vers une corbeille pour
                    lui apprendre qu'il possède déjà ce qu'il voulait acheter.
                  */}
                  {refus.raison === 'deja_possede' ? (
                    <a className={ecran.boutonDiscret} href={`/${langue}/compte/bibliotheque`}>
                      {traduire(langue, 'panier.refus_deja_possede_action')}
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Code promo ───────────────────────────────────────────────────── */}
      <form method="get" action={`/${langue}/panier`} className={`${ecran.formulaire} ${ecran.section}`}>
        <div className={ecran.champ}>
          <label className={ecran.libelle} htmlFor="code-promo">
            {traduire(langue, 'panier.codePromo')}
          </label>
          <input
            className={ecran.saisie}
            id="code-promo"
            name="promo"
            defaultValue={codePromo ?? ''}
          />
        </div>

        {/*
          UN CODE ÉCARTÉ EST DIT, JAMAIS SILENCIEUX. Six motifs de refus, six
          messages : un code ignoré sans explication est perçu comme une panne,
          et le client conclut que la remise annoncée n'existe pas.
        */}
        {vue.refusPromo ? (
          <p className={ecran.erreur} role="alert">
            {traduire(langue, `panier.refus_promo_${vue.refusPromo}` as CleTraduction)}
          </p>
        ) : null}

        <div className={ecran.actions}>
          <button type="submit" className={ecran.boutonSecondaire}>
            {traduire(langue, 'panier.codePromoAppliquer')}
          </button>
        </div>
      </form>

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

      {vue.zoneDivergente ? (
        <p className={`${ecran.panneau} ${ecran.panneauAttention} ${ecran.section}`}>
          <span className={ecran.panneauTexte}>{traduire(langue, 'panier.zoneDivergente')}</span>
        </p>
      ) : null}

      {/* ── Commander ────────────────────────────────────────────────────── */}
      {/*
        ┌────────────────────────────────────────────────────────────────────┐
        │ UN LIEN, ET NON PLUS UNE ACTION QUI ÉCRIT LA COMMANDE.            │
        │                                                                    │
        │ Ce bouton créait la commande directement. Il mène désormais au      │
        │ récapitulatif, qui relit le total et demande un geste explicite —   │
        │ une commande écrite ne se dé-crée pas, elle mérite d'être voulue.   │
        │                                                                    │
        │ Un lien plutôt qu'un formulaire, parce que la destination ne MUTE   │
        │ rien : c'est une lecture. Le code promo suit dans l'adresse, comme  │
        │ il suit déjà sur cet écran.                                        │
        └────────────────────────────────────────────────────────────────────┘
      */}
      <a
        className={ecran.boutonPrimaire}
        href={`/${langue}/panier/confirmation${
          codePromo ? `?promo=${encodeURIComponent(codePromo)}` : ''
        }`}
      >
        {traduire(langue, 'panier.commander')}
      </a>
    </div>
  );
}
