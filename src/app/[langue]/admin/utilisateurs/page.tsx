import type { Metadata } from 'next';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import { listerUtilisateurs } from '@/lib/admin/service';
import { Erreur } from '@/components/etats';
import { GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';

/**
 * LES COMPTES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN COMPTE ANONYMISÉ N'A PLUS DE NOM NI D'ADRESSE — Y COMPRIS ICI.       │
 * │                                                                          │
 * │ La base rend `anonymise` pour les comptes effacés au titre du droit à    │
 * │ l'oubli. Leurs commandes survivent : ce sont des pièces comptables. La   │
 * │ personne, non. Afficher son adresse depuis l'écran d'administration      │
 * │ reviendrait à défaire l'anonymisation par l'écran qui la présente —      │
 * │ c'est exactement ce que fait déjà l'écran des commandes, et pour la      │
 * │ même raison.                                                             │
 * │                                                                          │
 * │ La recherche, elle, ne porte pas non plus sur ces comptes : c'est la     │
 * │ fonction SQL qui les écarte, pas cet écran.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE DONNÉE D'ENFANT NE PEUT APPARAÎTRE ICI, PARCE QU'IL N'Y EN A PAS.│
 * │                                                                          │
 * │ Le schéma n'en porte aucune (CLAUDE.md règle 7). Le sous-titre le dit à  │
 * │ l'écran plutôt qu'en commentaire : c'est une promesse faite au public,   │
 * │ et l'administration est justement l'endroit où l'on vérifierait qu'elle  │
 * │ est tenue.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Une ligne rendue par `admin_lister_utilisateurs`. */
interface LigneUtilisateur {
  id: string;
  email: string | null;
  nom_complet: string | null;
  role: 'user' | 'admin';
  statut: 'actif' | 'suspendu' | 'anonymise';
  cree_le: string;
  anonymise: boolean;
  nb_commandes: number;
  nb_droits: number;
}

const STATUTS = ['actif', 'suspendu', 'anonymise'] as const;

const LIBELLE_STATUT: Record<(typeof STATUTS)[number], CleTraduction> = {
  actif: 'admin.compte_actif',
  suspendu: 'admin.compte_suspendu',
  anonymise: 'admin.compte_anonymise',
};

const LIBELLE_ROLE: Record<LigneUtilisateur['role'], CleTraduction> = {
  user: 'admin.role_user',
  admin: 'admin.role_admin',
};

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.utilisateurs'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminUtilisateurs({ params, searchParams }: Parametres) {
  const langue = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;

  const brut = requete['statut'];
  const demande = Array.isArray(brut) ? brut[0] : brut;
  const statut = STATUTS.includes(demande as (typeof STATUTS)[number]) ? demande : undefined;

  const resultat = await listerUtilisateurs({
    recherche: null,
    statut: statut ?? null,
    page: 1,
    taille: 50,
  }).catch(() => null);
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const comptes = resultat.donnees as unknown as LigneUtilisateur[];
  const base = `/${langue}/admin/utilisateurs`;

  return (
    <GabaritAdmin
      langue={langue}
      section="/utilisateurs"
      titre={traduire(langue, 'admin.utilisateurs')}
      sousTitre={traduire(langue, 'admin.utilisateursSousTitre')}
    >
      <nav className={styles.filtres} aria-label={traduire(langue, 'admin.colStatut')}>
        <a
          className={statut ? styles.filtre : `${styles.filtre} ${styles.filtreActif}`}
          href={base}
          aria-current={statut ? undefined : 'true'}
        >
          {traduire(langue, 'admin.tousLesStatuts')}
        </a>

        {STATUTS.map((valeur) => {
          const actif = statut === valeur;
          return (
            <a
              key={valeur}
              className={actif ? `${styles.filtre} ${styles.filtreActif}` : styles.filtre}
              href={`${base}?statut=${valeur}`}
              aria-current={actif ? 'true' : undefined}
            >
              {traduire(langue, LIBELLE_STATUT[valeur])}
            </a>
          );
        })}
      </nav>

      <div className={styles.cadre}>
        {comptes.length === 0 ? (
          <p className={styles.vide}>{traduire(langue, 'admin.aucunUtilisateur')}</p>
        ) : (
          <table className={styles.tableau}>
            <thead>
              <tr>
                <th scope="col">{traduire(langue, 'auth.email')}</th>
                <th scope="col">{traduire(langue, 'admin.colNom')}</th>
                <th scope="col">{traduire(langue, 'admin.colRole')}</th>
                <th scope="col">{traduire(langue, 'admin.colStatut')}</th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colCommandes')}
                </th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colDroits')}
                </th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colInscrit')}
                </th>
              </tr>
            </thead>

            <tbody>
              {comptes.map((compte) => (
                <tr key={compte.id}>
                  {/*
                    Ni adresse ni nom pour un compte anonymisé : la commande
                    survit comme pièce comptable, la personne non.
                  */}
                  <td className={styles.cellulePrincipale}>
                    {compte.anonymise
                      ? traduire(langue, 'admin.compte_anonymise')
                      : (compte.email ?? traduire(langue, 'admin.nonPublie'))}
                  </td>

                  <td>
                    {compte.anonymise
                      ? '—'
                      : (compte.nom_complet ?? traduire(langue, 'admin.nonPublie'))}
                  </td>

                  <td>{traduire(langue, LIBELLE_ROLE[compte.role])}</td>

                  <td>
                    <span
                      className={`${styles.etat} ${
                        compte.statut === 'actif'
                          ? styles.etatPublie
                          : compte.statut === 'suspendu'
                            ? styles.etatAlerte
                            : styles.etatBrouillon
                      }`}
                    >
                      {traduire(langue, LIBELLE_STATUT[compte.statut])}
                    </span>
                  </td>

                  <td className={styles.numerique}>{compte.nb_commandes}</td>
                  <td className={styles.numerique}>{compte.nb_droits}</td>
                  <td className={styles.numerique}>
                    {new Date(compte.cree_le).toLocaleDateString(langue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className={styles.note}>{traduire(langue, 'admin.anonymiseNote')}</p>
    </GabaritAdmin>
  );
}
