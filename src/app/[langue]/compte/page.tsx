import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import { identifierAppelant } from '@/lib/auth/session';
import { GabaritEspace } from '@/components/espace';
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

const SECTIONS: { chemin: string; titre: CleTraduction; corps: CleTraduction }[] = [
  {
    chemin: 'bibliotheque',
    titre: 'compte.bibliotheque',
    corps: 'compte.achatsTitre',
  },
  {
    chemin: 'abonnement',
    titre: 'compte.abonnement',
    corps: 'offres.abonnementResume',
  },
];

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return { title: traduire(langue, 'compte.titre') };
}

export default async function PageCompte({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  return (
    <GabaritEspace langue={langue} onglet="compte" email={appelant.email}>
      <h1 className={ecran.titre}>{traduire(langue, 'compte.parametres')}</h1>
      <p className={ecran.intro}>{traduire(langue, 'compte.parametresIntro')}</p>

      <section className={`${ecran.panneau} ${ecran.section}`}>
        <dl className={ecran.definitions} style={{ width: '100%' }}>
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

      <section className={ecran.section}>
        <h2 className={ecran.sousTitre}>{traduire(langue, 'compte.titre')}</h2>

        <div className={ecran.actions}>
          {SECTIONS.map((section) => (
            <a
              key={section.chemin}
              className={ecran.boutonSecondaire}
              href={`/${langue}/compte/${section.chemin}`}
            >
              {traduire(langue, section.titre)}
            </a>
          ))}
        </div>
      </section>
    </GabaritEspace>
  );
}
