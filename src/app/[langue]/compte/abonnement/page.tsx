import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import { abonnementCourant } from '@/lib/subscriptions/handlers';
import { identifierAppelantAvecCookies } from '@/lib/auth/session';
import { Erreur } from '@/components/etats';
import { Motif } from '@/components/motif';
import { GabaritEspace } from '@/components/espace';
import { GabaritEspaceV3, stylesEspaceV3 as e3 } from '@/components/v2/espace-v3';
import { estV3 } from '@/design/version';
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

  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  let courant;
  try {
    courant = await abonnementCourant(appelant.id, 'lecture');
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  const nomComplet = appelant.nom_complet || appelant.email.split('@')[0] || 'Utilisateur';
  const initiales = nomComplet.split(' ').filter(Boolean).map((p) => p[0]?.toUpperCase()).slice(0, 2).join('') || 'EM';
  const dateMembre = appelant.cree_le ? new Date(appelant.cree_le).toLocaleDateString(langue === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' }) : 'mars 2026';
  const langueLecture = (appelant.langue_preferee || langue).toUpperCase();
  
  // We need to fetch the library to get the counts for the header
  const { lireBibliotheque } = await import('@/lib/account/bibliotheque');
  let bibliotheque;
  try {
    bibliotheque = await lireBibliotheque(appelant.id, langue);
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }
  const nbTitres = bibliotheque.achats.length;
  const nbLivretsGratuits = bibliotheque.achats.filter((a: any) => a.source === 'offert' || a.slug.includes('livret') || a.slug.includes('gratuit')).length;

  if (!courant) {
    if (estV3()) {
      return (
        <GabaritEspaceV3
          langue={langue}
          onglet="compte/abonnement"
          email={appelant.email}
          titre={traduire(langue, 'abonnement.titre')}
          nomComplet={nomComplet}
          initiales={initiales}
          dateMembre={dateMembre}
          langueLecture={langueLecture}
          nbTitres={nbTitres}
          nbLivretsGratuits={nbLivretsGratuits}
        >
          <p className={e3.intro}>{traduire(langue, 'abonnement.aucun')}</p>

          <div className={e3.vide}>
            <p className={e3.videTitre}>{traduire(langue, 'offres.abonnementTitre')}</p>
            <p className={e3.videCorps}>{traduire(langue, 'offres.abonnementResume')}</p>

            {/*
              Vers le TUNNEL, et non vers `/offres`.

              Cet écran est atteint par quelqu'un qui cherche son abonnement et
              découvre qu'il n'en a pas : il sait déjà ce qu'il veut. Le
              renvoyer au comparatif lui ferait relire une page entière pour
              retrouver le bouton qu'il vient de chercher.
            */}
            <a className={e3.bouton} href={`/${langue}/abonnement/souscrire`}>
              {traduire(langue, 'abonnement.aucunAction')}
            </a>
          </div>
        </GabaritEspaceV3>
      );
    }

    return (
      <GabaritEspace langue={langue} onglet="compte/abonnement" email={appelant.email}>
        <h1 className={ecran.titre}>{traduire(langue, 'abonnement.titre')}</h1>
        <p className={ecran.intro}>{traduire(langue, 'abonnement.aucun')}</p>

        <div className={ecran.vide}>
          <Motif teinte="vide" place="plein" rayon="14px" className={ecran.videMotif} />

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

  /*
   * L'état lu, jamais déduit : `statutEffectif` vient de la base, comparé à
   * `app_now()`. Cet écran ne compare aucune date en TypeScript — c'est ce que
   * `frontend-architecture` interdit, et la raison pour laquelle la règle vit
   * dans `statut_effectif`.
   */

  if (estV3()) {
    return (
      <GabaritEspaceV3
        langue={langue}
        onglet="compte/abonnement"
        email={appelant.email}
        titre={traduire(langue, 'compte.abonnementEtAdhesion')}
        nomComplet={nomComplet}
        initiales={initiales}
        dateMembre={dateMembre}
        langueLecture={langueLecture}
        nbTitres={nbTitres}
        nbLivretsGratuits={nbLivretsGratuits}
      >
        <section>
          <h2 className={e3.sousTitre}>{traduire(langue, 'compte.abonnementEtAdhesion')}</h2>

          <div className={e3.grilleAbonnements}>
            {/* Carte 1 : Abonnement Lecture */}
            <div className={e3.carteAbonnementClaire}>
              <div className={e3.abonnementEnteteRow}>
                <span className={e3.kickerClair}>{traduire(langue, 'compte.lectureEnLigne')}</span>
                <span className={statut === 'actif' || statut === 'essai' ? e3.badgeActifOrange : e3.badgeInactif}>
                  {traduire(langue, `abonnement.statut_${statut}` as CleTraduction)}
                </span>
              </div>
              <h3 className={e3.titreAbonnementClair}>{traduire(langue, `abonnement.offre_${courant.offre}` as CleTraduction)}</h3>
              <p className={e3.descAbonnementClair}>
                {traduire(langue, 'abonnement.titre')} - {traduire(langue, 'abonnement.finPeriode').replace('{date}', finPeriode)}
              </p>
              <div className={e3.prixAbonnementClair}></div>
              <a className={e3.boutonSombre} href={`/${langue}/abonnement/souscrire`}>
                {traduire(langue, 'compte.gererAbonnement')}
              </a>
            </div>

            {/* Carte 2 : Adhésion Association DAVE */}
            <div className={e3.carteAbonnementSombre}>
              <div className={e3.abonnementEnteteRow}>
                <span className={e3.kickerSombre}>ASSOCIATION DAVE</span>
                <span className={e3.badgeActifOrange}>
                  {traduire(langue, 'compte.activeJusquAu').replace('{date}', '12 mars 2027')}
                </span>
              </div>
              <h3 className={e3.titreAbonnementSombre}>Adhésion annuelle</h3>
              <p className={e3.descAbonnementSombre}>
                Les contenus réservés, les ressources d'accompagnement et les invitations aux ateliers.
              </p>
              <div className={e3.prixAbonnementSombre}>10 000 FCFA / an</div>
              <a className={e3.bouton} href={`/${langue}/association`}>
                {traduire(langue, 'compte.gererAdhesion')}
              </a>
            </div>
          </div>
        </section>
      </GabaritEspaceV3>
    );
  }

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
