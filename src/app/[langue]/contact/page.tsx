import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { IDENTITE_EDITEUR } from '@/content/editorial';
import { CorpsEditorial } from '@/components/editorial';
import { versionDesign } from '@/design/version';
import ecran from '@/components/ecran/ecran.module.css';
import boutique from '@/components/v2/boutique.module.css';
import accueil from '@/components/v2/accueil.module.css';

/**
 * CONTACT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FORMULAIRE OUVRE LE COURRIEL, IL N'ENVOIE RIEN LUI-MÊME.             │
 * │                                                                          │
 * │ Il n'y a aujourd'hui AUCUNE route qui reçoive un message de contact, et  │
 * │ aucun prestataire d'envoi : `FileMailer` écrit dans `.mails/` pour le    │
 * │ développement, et n'est pas un canal vers l'éditeur.                     │
 * │                                                                          │
 * │ Un formulaire qui dirait « message envoyé » sans que personne ne le      │
 * │ reçoive serait le pire des deux mondes : le visiteur croit avoir écrit,  │
 * │ et attend une réponse qui ne viendra jamais. `action="mailto:"` remet    │
 * │ donc le message dans SON logiciel de courrier, où il voit ce qu'il       │
 * │ envoie et garde une trace de son envoi.                                  │
 * │                                                                          │
 * │ À remplacer par une vraie route le jour où un prestataire d'envoi sera   │
 * │ branché — la mise en page, elle, ne bougera pas.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS CHAMPS, ET PAS UN DE PLUS.                                        │
 * │                                                                          │
 * │ Nom, adresse, message. Aucun champ « âge de votre enfant », aucun champ  │
 * │ « prénom de votre enfant » : c'est une exigence de conformité, et un     │
 * │ formulaire de contact est exactement l'endroit où ce genre de champ      │
 * │ s'ajoute « pour mieux conseiller ».                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'v2.contactTitre'),
    description: traduire(langue, 'v2.contactTexte'),
  };
}

export default async function PageContact({ params }: Parametres) {
  const langue = langueValide((await params).langue);
  const email = IDENTITE_EDITEUR.emailContact;

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ CETTE ROUTE ÉCLIPSE `(editorial)/[page]`, DANS LES DEUX DIRECTIONS.  │
   * │                                                                      │
   * │ Next fait toujours gagner un segment statique sur un segment          │
   * │ dynamique. Sans ce renvoi, la V1 aurait silencieusement perdu sa     │
   * │ page de contact éditoriale, remplacée par un écran conçu pour la V2 — │
   * │ exactement le genre de régression qu'un commutateur de thème est      │
   * │ censé empêcher.                                                       │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  if (versionDesign() !== 'v2') {
    return <CorpsEditorial langue={langue} slug="contact" />;
  }

  return (
    <>
      <div className={boutique.banniere} data-banniere>
        <div className={boutique.banniereInterieur}>
          <span className={boutique.oeil}>{traduire(langue, 'v2.contactOeil')}</span>
          <h1 className={boutique.banniereTitre}>{traduire(langue, 'v2.contactTitre')}</h1>
          <p className={boutique.banniereTexte}>{traduire(langue, 'v2.contactTexte')}</p>
        </div>
      </div>

      <div className={boutique.page}>
        <div className={boutique.fiche}>
          {/* ── Coordonnées ─────────────────────────────────────────────── */}
          <section>
            <h2 className={boutique.blocTitre}>{traduire(langue, 'v2.contactCoordonnees')}</h2>

            <dl className={ecran.definitions}>
              {/*
                Chaque ligne ne paraît QUE si la valeur existe. Une étiquette
                « Téléphone » suivie du vide annonce une information manquante
                au lieu de la taire.
              */}
              {IDENTITE_EDITEUR.adresse ? (
                <div className={ecran.definition}>
                  <dt className={ecran.terme}>{traduire(langue, 'v2.contactCoordonnees')}</dt>
                  <dd className={ecran.valeur}>{IDENTITE_EDITEUR.adresse}</dd>
                </div>
              ) : null}

              {IDENTITE_EDITEUR.telephone ? (
                <div className={ecran.definition}>
                  <dt className={ecran.terme}>{traduire(langue, 'v2.contactCoordonnees')}</dt>
                  <dd className={ecran.valeur}>
                    {/*
                      `tel:` sans espaces : un numéro composé au doigt sur un
                      téléphone doit être composable, et les espaces le cassent
                      sur certains combinés.
                    */}
                    <a href={`tel:${IDENTITE_EDITEUR.telephone.replace(/\s/g, '')}`}>
                      {IDENTITE_EDITEUR.telephone}
                    </a>
                  </dd>
                </div>
              ) : null}

              {email ? (
                <div className={ecran.definition}>
                  <dt className={ecran.terme}>{traduire(langue, 'auth.email')}</dt>
                  <dd className={ecran.valeur}>
                    <a href={`mailto:${email}`}>{email}</a>
                  </dd>
                </div>
              ) : null}
            </dl>

            <p className={boutique.achatNote} style={{ marginTop: '24px' }}>
              {traduire(langue, 'v2.contactReponse')}
            </p>
            <p className={boutique.achatNote} style={{ marginTop: '10px' }}>
              {traduire(langue, 'v2.contactSansCompte')}
            </p>
          </section>

          {/* ── Formulaire ──────────────────────────────────────────────── */}
          <section className={boutique.achat}>
            <h2 className={boutique.blocTitre}>{traduire(langue, 'v2.contactFormTitre')}</h2>

            <form
              className={ecran.formulaire}
              // `mailto:` avec `method="get"` : le navigateur compose le
              // message dans le logiciel de courrier du visiteur.
              action={email ? `mailto:${email}` : undefined}
              method="get"
              encType="text/plain"
            >
              <div className={ecran.champ}>
                <label className={ecran.libelle} htmlFor="contact-nom">
                  {traduire(langue, 'v2.contactNom')}
                </label>
                <input className={ecran.saisie} id="contact-nom" name="nom" required />
              </div>

              <div className={ecran.champ}>
                <label className={ecran.libelle} htmlFor="contact-email">
                  {traduire(langue, 'v2.contactEmail')}
                </label>
                <input
                  className={ecran.saisie}
                  id="contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>

              <div className={ecran.champ}>
                <label className={ecran.libelle} htmlFor="contact-message">
                  {traduire(langue, 'v2.contactMessage')}
                </label>
                <textarea
                  className={ecran.saisie}
                  id="contact-message"
                  name="message"
                  rows={6}
                  required
                />
              </div>

              <div>
                <button type="submit" className={accueil.boutonOcre}>
                  {traduire(langue, 'v2.contactEnvoyer')}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
