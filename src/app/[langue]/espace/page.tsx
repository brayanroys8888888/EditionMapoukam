import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, traduire } from '@/i18n';
import { identifierAppelantAvecCookies, nomUtilisateurEffectif } from '@/lib/auth/session';
import { lireEspaceAdherent, verdictEspaceAdherent } from '@/lib/association/service';
import { Erreur } from '@/components/etats';
import { EspaceAdherent, type DonneesEspace } from '@/components/v2/espace-adherent';

/**
 * L'ESPACE ADHÉRENT — A1 et A3 du document du 28 septembre 2026.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA RÈGLE D'ENTRÉE EST LUE, JAMAIS DÉDUITE ICI.                          │
 * │                                                                          │
 * │ `association_acces_espace` rend l'un de quatre verdicts, en lisant       │
 * │ `statut_effectif` — qui lit lui-même la période de grâce configurée.     │
 * │ Cette page TRADUIT un verdict en destination ; elle ne compare ni date   │
 * │ ni statut. Une comparaison faite ici répondrait selon l'horloge du       │
 * │ serveur de rendu, et ignorerait le temps déplacé par la console de       │
 * │ simulation.                                                              │
 * │                                                                          │
 * │ `frontend-architecture` l'impose, et c'est la même règle que partout :   │
 * │ l'écran lit un verdict, il ne le calcule pas.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUATRE VERDICTS, TROIS DESTINATIONS.                                    │
 * │                                                                          │
 * │  · pas connecté        → connexion, avec RETOUR ici ensuite ;            │
 * │  · `sans_adhesion`     → les offres, adhésion mise en avant ;            │
 * │  · `ferme`             → les offres, pour renouveler ;                   │
 * │  · `ouvert`            → l'espace ;                                      │
 * │  · `impaye_tolere`     → l'espace, AVEC son bandeau.                     │
 * │                                                                          │
 * │ Les deux derniers mènent au même écran, et c'est voulu : un impayé de    │
 * │ trois jours a payé son année. Le renvoyer aux offres lui ferait croire   │
 * │ qu'il a tout perdu, alors qu'il lui reste quelques jours pour régler.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'v2.espaceTitre'),
    // L'espace est réservé : il n'a rien à faire dans un moteur de recherche,
    // et son adresse ne doit pas circuler comme une page publique.
    robots: { index: false, follow: false },
  };
}

export default async function PageEspaceAdherent({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );

  /*
   * Le retour est porté par l'adresse de connexion : sans lui, un adhérent
   * qui se connecte depuis ici retomberait sur l'accueil et devrait
   * retrouver son chemin.
   */
  if (!appelant) {
    redirect(`/${langue}/connexion?suite=${encodeURIComponent(`/${langue}/espace`)}`);
  }

  const acces = await verdictEspaceAdherent(appelant.id).catch(() => null);
  if (acces === null) return <Erreur langue={langue} code="erreur_interne" />;

  if (acces.verdict === 'sans_adhesion' || acces.verdict === 'ferme') {
    /*
     * Les deux mènent aux offres, mais pas avec le même message : l'un n'a
     * jamais adhéré, l'autre a laissé son adhésion se fermer. `motif` porte
     * la nuance jusqu'à la page, qui choisit sa phrase.
     */
    redirect(`/${langue}/offres?motif=${acces.verdict === 'ferme' ? 'renouveler' : 'espace'}`);
  }

  const donnees = (await lireEspaceAdherent(appelant.id, { langue }).catch(
    () => null,
  )) as DonneesEspace | null;
  if (donnees === null) return <Erreur langue={langue} code="erreur_interne" />;

  /*
   * LE PRÉNOM, et non le nom complet : « Bonjour Awa » se lit mieux que
   * « Bonjour Awa Mbarga », et l'espace est un lieu familier. `split` sur
   * l'espace suffit — un nom en un seul mot reste lui-même.
   */
  const nom = nomUtilisateurEffectif(appelant.nom_complet, appelant.id);
  const prenom = nom.split(' ')[0] ?? nom;

  return (
    <EspaceAdherent
      langue={langue}
      prenom={prenom}
      donnees={donnees}
      impaye={acces.verdict === 'impaye_tolere'}
      finPeriode={acces.finPeriode}
      finGrace={acces.finGrace}
    />
  );
}
