import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, traduire } from '@/i18n';
import { identifierAppelantAvecCookies } from '@/lib/auth/session';
import { GabaritEspace } from '@/components/espace';
import { GabaritEspaceV3, stylesEspaceV3 as e3 } from '@/components/v2/espace-v3';
import { estV3 } from '@/design/version';
import ecran from '@/components/ecran/ecran.module.css';

/**
 * Espace personnel — le sommaire.
 *
 * L'en-tête de l'application pointe ici pour tout compte connecté : sans cette
 * page, « Mon compte » aurait mené à un 404 depuis chaque écran du site.
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES DEUX SECTIONS NE SONT PLUS RÉPÉTÉES ICI.                            │
 * │                                                                          │
 * │ `GabaritEspace` porte déjà la navigation de l'espace personnel — « Ma    │
 * │ bibliothèque », « Mon abonnement », « Paramètres » — en colonne, à       │
 * │ gauche, avec l'onglet courant marqué. Cette page les redonnait en        │
 * │ boutons, sous un titre « Mon compte » qui répétait celui de l'écran.     │
 * │                                                                          │
 * │ Deux chemins vers la même page ne rassurent pas : ils font douter        │
 * │ qu'ils mènent au même endroit. La navigation reste à un seul endroit.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { enregistrerProfil } from './actions';

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return { title: traduire(langue, 'compte.titre') };
}

export default async function PageCompte({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  /*
   * Sous Organic, l'écran passe sous le gabarit refondu : en-tête d'identité,
   * onglets en rangée, panneaux arrondis. Le CONTENU ne bouge pas — les deux
   * mêmes lignes, dont celle qui dit ce qu'on ne demande pas.
   */
  const nomComplet = appelant.nom_complet || 'Utilisateur';
  const initiales =
    nomComplet
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase())
      .slice(0, 2)
      .join('') || 'EM';
  const dateMembre = appelant.cree_le
    ? new Date(appelant.cree_le).toLocaleDateString(langue === 'fr' ? 'fr-FR' : 'en-US', {
        month: 'long',
        year: 'numeric',
      })
    : 'mars 2026';
  const langueLecture = (appelant.langue_preferee || langue).toUpperCase();

  const { lireBibliotheque } = await import('@/lib/account/bibliotheque');
  let bibliotheque;
  try {
    bibliotheque = await lireBibliotheque(appelant.id, langue);
  } catch {
    bibliotheque = { achats: [] };
  }
  const nbTitres = bibliotheque.achats.length;
  const nbLivretsGratuits = bibliotheque.achats.filter((a: any) => a.source === 'offert' || a.slug.includes('livret') || a.slug.includes('gratuit')).length;

  if (estV3()) {
    return (
      <GabaritEspaceV3
        langue={langue}
        onglet="compte"
        email={appelant.email}
        titre={traduire(langue, 'compte.parametres')}
        nomComplet={nomComplet}
        initiales={initiales}
        dateMembre={dateMembre}
        langueLecture={langueLecture}
        nbTitres={nbTitres}
        nbLivretsGratuits={nbLivretsGratuits}
      >
        <section className={e3.panneau}>
          <h2 className={e3.panneauTitre}>{traduire(langue, 'compte.parametres')}</h2>
          <p className={e3.intro}>{traduire(langue, 'compte.parametresIntro')}</p>

          <form action={enregistrerProfil.bind(null, langue)} className={e3.formulaire}>
            <div className={e3.champGroupe}>
              <label className={e3.champLibelle} htmlFor="nomComplet">
                {traduire(langue, 'compte.nomComplet')}
              </label>
              <input
                id="nomComplet"
                name="nom_complet"
                className={e3.champSaisie}
                type="text"
                defaultValue={nomComplet}
              />
            </div>

            <div className={e3.champGroupe}>
              <label className={e3.champLibelle} htmlFor="adresseEmail">
                {traduire(langue, 'compte.adresseEmail')}
              </label>
              <input
                id="adresseEmail"
                name="email"
                className={e3.champSaisie}
                type="email"
                defaultValue={appelant.email}
                disabled
                readOnly
                style={{ opacity: 0.7, cursor: 'not-allowed' }}
              />
            </div>

            <div className={e3.champGroupe}>
              <label className={e3.champLibelle} htmlFor="telephone">
                {traduire(langue, 'compte.telephone')}
              </label>
              <input
                id="telephone"
                name="telephone"
                className={e3.champSaisie}
                type="tel"
                defaultValue={appelant.telephone ?? ''}
              />
            </div>

            <div className={e3.champGroupe}>
              <span className={e3.champLibelle}>{traduire(langue, 'compte.langueLecture')}</span>
              <div className={e3.optionsPilules}>
                <button type="button" className={`${e3.piluleChoix} ${e3.piluleChoixActive}`}>
                  Français
                </button>
                <button type="button" className={e3.piluleChoix}>
                  English
                </button>
              </div>
            </div>

            <label className={e3.caseCocherLabel}>
              <input type="checkbox" style={{ width: '18px', height: '18px', accentColor: 'var(--action)' }} />
              <span>{traduire(langue, 'compte.recevoirNouveautes')}</span>
            </label>

            <div className={e3.actionsFormulaire}>
              <button type="submit" className={e3.bouton}>
                {traduire(langue, 'compte.enregistrer')}
              </button>
              <a className={e3.boutonContour} href={`/${langue}/mot-de-passe-oublie`}>
                {traduire(langue, 'compte.changerMotDePasse')}
              </a>
            </div>

            {/* Compliance notice per Règle 7 */}
            <div className={e3.definitions} style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--bordure)' }}>
              <div className={e3.definition}>
                <dt className={e3.terme}>{traduire(langue, 'compte.donneesTerme')}</dt>
                <dd className={e3.valeur}>{traduire(langue, 'auth.aucuneDonneeEnfant')}</dd>
              </div>
            </div>
          </form>
        </section>
      </GabaritEspaceV3>
    );
  }

  return (
    <GabaritEspace langue={langue} onglet="compte" email={appelant.email}>
      <h1 className={ecran.titre}>{traduire(langue, 'compte.parametres')}</h1>
      <p className={ecran.intro}>{traduire(langue, 'compte.parametresIntro')}</p>

      <section className={`${ecran.panneau} ${ecran.section}`}>
        <dl className={`${ecran.definitions} ${ecran.definitionsPleines}`}>
          <div className={ecran.definition}>
            <dt className={ecran.terme}>{traduire(langue, 'auth.email')}</dt>
            <dd className={ecran.valeur}>{appelant.email}</dd>
          </div>

          {/*
            ┌──────────────────────────────────────────────────────────────┐
            │ CE QUE CET ÉCRAN NE DEMANDE PAS, ET NE DEMANDERA JAMAIS.    │
            │                                                              │
            │ Aucun prénom d'enfant, aucun âge, aucune date de naissance,  │
            │ aucun profil enfant. Le compte appartient à l'adulte. C'est   │
            │ une exigence de conformité, pas une préférence — et la dire  │
            │ ici évite qu'on l'ajoute « pour personnaliser l'accueil ».   │
            └──────────────────────────────────────────────────────────────┘
          */}
          <div className={ecran.definition}>
            <dt className={ecran.terme}>{traduire(langue, 'compte.donneesTerme')}</dt>
            <dd className={ecran.valeur}>{traduire(langue, 'auth.aucuneDonneeEnfant')}</dd>
          </div>
        </dl>
      </section>

    </GabaritEspace>
  );
}
