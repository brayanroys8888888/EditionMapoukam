import type { Metadata } from 'next';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import { listerCommandes } from '@/lib/admin/service';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';

/**
 * LES COMMANDES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN ACHETEUR ANONYMISÉ RESTE ANONYME, Y COMPRIS ICI.                     │
 * │                                                                          │
 * │ `acheteur_anonymise` est rendu par la base pour les comptes effacés au   │
 * │ titre du droit à l'oubli. La commande, elle, survit — elle est une pièce │
 * │ comptable. L'écran affiche donc la commande sans son adresse : la        │
 * │ remonter d'un journal ou d'une facture reviendrait à défaire             │
 * │ l'anonymisation depuis l'écran qui la présente.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES MONTANTS SONT FORMATÉS PAR LE SERVEUR, DEVISE PAR DEVISE.           │
 * │                                                                          │
 * │ Une liste peut mêler des euros et des francs CFA — le second n'a pas de  │
 * │ sous-unité. Un formatage unique diviserait les deux par cent, et le      │
 * │ tableau afficherait des montants faux d'un facteur cent une ligne sur    │
 * │ deux.                                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Une ligne rendue par `admin_lister_commandes`. */
interface LigneCommande {
  id: string;
  email: string | null;
  montant_total: number;
  devise: string;
  zone: string;
  statut: 'en_attente' | 'paye' | 'echoue' | 'rembourse';
  cree_le: string;
  acheteur_anonymise: boolean;
  nb_lignes: number;
}

/**
 * Les quatre statuts de `order_status`, et leur libellé.
 *
 * La table est explicite plutôt que dérivée : `paye` → `payee` n'est pas une
 * règle qu'on puisse deviner, et une chaîne de ternaires imbriqués pour la
 * reconstituer serait illisible pour économiser quatre lignes.
 */
const STATUTS = ['en_attente', 'paye', 'echoue', 'rembourse'] as const;

const LIBELLE_STATUT: Record<(typeof STATUTS)[number], CleTraduction> = {
  en_attente: 'paiement.enAttente',
  paye: 'paiement.payee',
  echoue: 'paiement.echouee',
  rembourse: 'paiement.remboursee',
};

/**
 * Les libellés de `paiement.*` sont des PHRASES — « Paiement confirmé. Les
 * contes sont dans votre bibliothèque. » Sur une pastille de filtre, seule la
 * première proposition a un sens.
 */
function libelleCourt(texte: string): string {
  return texte.split('.')[0] ?? texte;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.commandes'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminCommandes({ params, searchParams }: Parametres) {
  const langue = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;

  const brut = requete['statut'];
  const demande = Array.isArray(brut) ? brut[0] : brut;
  const statut = STATUTS.includes(demande as (typeof STATUTS)[number]) ? demande : undefined;

  const resultat = await listerCommandes({ statut: statut ?? null, page: 1, taille: 50 }).catch(
    () => null,
  );
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const commandes = resultat.donnees as unknown as LigneCommande[];

  /*
   * UN formateur par devise présente, résolu une seule fois.
   *
   * Les lire ligne par ligne ferait autant d'allers-retours en base qu'il y a
   * de commandes — sur cinquante lignes, la page attendrait pour rien.
   */
  const devises = [...new Set(commandes.map((commande) => commande.devise))];
  const formateurs = new Map(
    await Promise.all(
      devises.map(async (code) => [code, formateur(await lireDevise(code))] as const),
    ),
  );

  const base = `/${langue}/admin/commandes`;

  return (
    <GabaritAdmin
      langue={langue}
      section="/commandes"
      titre={traduire(langue, 'admin.commandes')}
      sousTitre={traduire(langue, 'admin.commandesSousTitre')}
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
              {libelleCourt(traduire(langue, LIBELLE_STATUT[valeur]))}
            </a>
          );
        })}
      </nav>

      <div className={styles.cadre}>
        {commandes.length === 0 ? (
          <p className={styles.vide}>{traduire(langue, 'admin.aucuneCommande')}</p>
        ) : (
          <table className={styles.tableau}>
            <thead>
              <tr>
                <th scope="col">{traduire(langue, 'admin.colCommande')}</th>
                <th scope="col">{traduire(langue, 'auth.email')}</th>
                <th scope="col">{traduire(langue, 'admin.colStatut')}</th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colMontant')}
                </th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colDate')}
                </th>
              </tr>
            </thead>

            <tbody>
              {commandes.map((commande) => (
                <tr key={commande.id}>
                  <td className={styles.cellulePrincipale}>{commande.id.slice(0, 8)}</td>

                  {/*
                    Un acheteur anonymisé n'a plus d'adresse à montrer : la
                    commande survit comme pièce comptable, la personne non.
                  */}
                  <td>
                    {commande.acheteur_anonymise
                      ? traduire(langue, 'admin.nonPublie')
                      : (commande.email ?? traduire(langue, 'admin.nonPublie'))}
                  </td>

                  <td>
                    <span
                      className={`${styles.etat} ${
                        commande.statut === 'paye'
                          ? styles.etatPublie
                          : commande.statut === 'en_attente'
                            ? styles.etatBrouillon
                            : styles.etatAlerte
                      }`}
                    >
                      {commande.statut}
                    </span>
                  </td>

                  <td className={styles.numerique}>
                    {formateurs.get(commande.devise)?.(commande.montant_total) ??
                      `${String(commande.montant_total)} ${commande.devise}`}
                  </td>

                  <td className={styles.numerique}>
                    {new Date(commande.cree_le).toLocaleDateString(langue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </GabaritAdmin>
  );
}
