import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import { abonnementCourant } from '@/lib/subscriptions/handlers';
import { identifierAppelant } from '@/lib/auth/session';
import { Erreur } from '@/components/etats';
import { Motif } from '@/components/motif';
import { GabaritEspace } from '@/components/espace';
import ecran from '@/components/ecran/ecran.module.css';

/**
 * Mon abonnement — §4.2 F7.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `statutEffectif`, JAMAIS `statut`.                                      │
 * │                                                                          │
 * │ Le second est ce que le prestataire a rapporté ; le premier replie les   │
 * │ dates et décrit la réalité. Une période échue sans événement — presque   │
 * │ toujours un webhook perdu — reste « actif » au sens rapporté, et ne      │
 * │ l'est plus au sens observé. Afficher le premier ferait promettre un      │
 * │ accès que le moteur de droits refuse déjà.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ APRÈS UNE ANNULATION, L'ÉCRAN DIT JUSQU'À QUAND.                        │
 * │                                                                          │
 * │ C'est le contresens le plus fréquent du domaine : on croit perdre son    │
 * │ accès au moment du clic, alors que la période déjà réglée court          │
 * │ toujours. Le dire évite une réclamation et un remboursement demandé      │
 * │ pour rien.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return { title: traduire(langue, 'abonnement.titre') };
}

export default async function PageAbonnement({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  let courant;
  try {
    courant = await abonnementCourant(appelant.id);
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  if (!courant) {
    return (
      <GabaritEspace langue={langue} onglet="compte/abonnement" email={appelant.email}>
        <h1 className={ecran.titre}>{traduire(langue, 'abonnement.titre')}</h1>
        <p className={ecran.intro}>{traduire(langue, 'abonnement.aucun')}</p>

        <div className={ecran.vide}>
          <Motif region="vide" place="plein" rayon="14px" className={ecran.videMotif} />

          <div className={ecran.videTexte}>
            <p className={ecran.videTitre}>{traduire(langue, 'offres.abonnementTitre')}</p>
            <p className={ecran.videCorps}>{traduire(langue, 'offres.abonnementResume')}</p>
          </div>

          {/*
            Vers le TUNNEL, et non vers `/offres`.

            Cet écran est atteint par quelqu'un qui cherche son abonnement et
            découvre qu'il n'en a pas : il sait déjà ce qu'il veut. Le renvoyer
            à la page des offres lui ferait relire un comparatif pour retrouver
            le bouton qu'il vient de chercher.
          */}
          <a className={ecran.boutonPrimaire} href={`/${langue}/abonnement/souscrire`}>
            {traduire(langue, 'abonnement.aucunAction')}
          </a>
        </div>
      </GabaritEspace>
    );
  }

  const statut = courant.statutEffectif;
  const annule = courant.statut === 'annule';
  const finPeriode = courant.finPeriode.toLocaleDateString(langue);

  return (
    <GabaritEspace langue={langue} onglet="compte/abonnement" email={appelant.email}>
      <h1 className={ecran.titre}>{traduire(langue, 'abonnement.titre')}</h1>
      <p className={ecran.intro}>
        {/*
          `anomalie` est NOMMÉE, jamais présentée comme une « erreur ».
          L'utilisateur n'y peut rien : c'est presque toujours un webhook perdu,
          et lui dire qu'il n'aura pas à repayer est ce qui évite qu'il
          s'abonne une seconde fois.
        */}
        {statut === 'anomalie'
          ? traduire(langue, 'abonnement.anomalieCorps')
          : traduire(
              langue,
              annule ? 'abonnement.finPeriodeApresAnnulation' : 'abonnement.finPeriode',
            ).replace('{date}', finPeriode)}
      </p>

      <section className={`${ecran.panneau} ${ecran.section}`}>
        <dl className={ecran.definitions} style={{ width: '100%' }}>
          <div className={ecran.definition}>
            <dt className={ecran.terme}>{traduire(langue, 'abonnement.statut')}</dt>
            <dd className={ecran.valeur}>
              {traduire(langue, `abonnement.statut_${statut}` as CleTraduction)}
            </dd>
          </div>

          <div className={ecran.definition}>
            <dt className={ecran.terme}>{traduire(langue, 'abonnement.offre')}</dt>
            <dd className={ecran.valeur}>
              {traduire(langue, `abonnement.offre_${courant.offre}` as CleTraduction)}
            </dd>
          </div>
        </dl>
      </section>

      {/*
        LE RAPPEL QUI ÉVITE LA RÉCLAMATION. Il paraît ici, sur l'écran de
        l'abonnement, et non seulement sur la page des offres : c'est au moment
        d'annuler qu'on se demande ce qu'on va perdre.

        En crème, jamais en rouge : ce n'est pas une erreur du lecteur, c'est
        une règle qu'il vaut mieux avoir lue avant qu'après.
      */}
      <section className={`${ecran.panneau} ${ecran.panneauAttention} ${ecran.section}`}>
        <p className={ecran.panneauTexte}>
          {traduire(langue, 'abonnement.rappelTelechargement')}
        </p>

        <a className={ecran.boutonSecondaire} href={`/${langue}/compte/bibliotheque`}>
          {traduire(langue, 'compte.bibliotheque')}
        </a>
      </section>
    </GabaritEspace>
  );
}
