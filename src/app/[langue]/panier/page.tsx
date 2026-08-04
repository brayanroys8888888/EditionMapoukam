import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { apercu } from '@/lib/orders/orders';
import { identifierAppelant } from '@/lib/auth/session';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { Motif } from '@/components/motif';
import ecran from '@/components/ecran/ecran.module.css';
import { commander, retirerDuPanier } from './actions';

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

  const appelant = await identifierAppelant(
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

  const erreur = premier(requete['erreur']);
  const aConfirmer = premier(requete['a_confirmer']);

  // Panier vide : un cul-de-sac sans issue serait un écran mort.
  if (!vue || vue.total.lignes.length === 0) {
    return (
      <div className={ecran.pageEtroite}>
        <h1 className={ecran.titre}>{traduire(langue, 'panier.titre')}</h1>
        <p className={ecran.intro}>{traduire(langue, 'panier.vide')}</p>

        {/* Jamais un cul-de-sac : dire ce qui manque, et donner une action. */}
        <div className={ecran.vide}>
          <Motif region="vide" place="plein" rayon="14px" className={ecran.videMotif} />

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

  return (
    <div className={ecran.pageEtroite}>
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
          {traduire(langue, 'panier.commander')}
        </button>
      </form>
    </div>
  );
}
