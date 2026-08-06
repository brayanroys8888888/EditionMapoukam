import type { Metadata } from 'next';

import { langueValide, traduire, type CleTraduction } from '@/i18n';
import { listerAbonnements } from '@/lib/admin/service';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';

/**
 * LES ABONNEMENTS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST `statut_observe` QUI EST AFFICHÉ, JAMAIS `statut`.                │
 * │                                                                          │
 * │ `statut` est ce que le prestataire a rapporté la dernière fois. Il ne    │
 * │ vieillit pas tout seul : un abonnement annulé dont la période payée est  │
 * │ échue reste `annule` en base, alors qu'il n'ouvre plus rien.             │
 * │                                                                          │
 * │ `statut_observe` est calculé par `statut_effectif` EN BASE, en repliant  │
 * │ les dates contre `app_now()` — la même horloge injectable que le reste   │
 * │ du projet. Il porte en plus `anomalie` : période payée échue sans        │
 * │ qu'aucun événement ne soit arrivé, c'est-à-dire presque toujours un      │
 * │ webhook perdu.                                                           │
 * │                                                                          │
 * │ Recalculer ici « expiré si `fin_periode` est passée » serait la seconde  │
 * │ définition de l'état d'un abonnement, et la seule que personne ne        │
 * │ testerait. C'est ce que CLAUDE.md interdit à l'interface, et c'est le    │
 * │ bug classique de ce type de plateforme.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les libellés sont ceux de l'écran du lecteur (`abonnement.statut_*`) : un
 * administrateur qui lit « Situation à vérifier » voit exactement le mot que
 * la personne au bout du fil a sous les yeux.
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Une ligne rendue par `admin_lister_abonnements`. */
interface LigneAbonnement {
  id: string;
  user_id: string;
  email: string | null;
  offre: string;
  statut: string;
  statut_observe: 'essai' | 'actif' | 'annule' | 'impaye' | 'expire' | 'anomalie';
  debut_periode: string | null;
  fin_periode: string | null;
  zone: string;
  devise: string;
  montant: number;
}

/** Les statuts RAPPORTÉS, seuls filtrables : la base filtre sur la colonne. */
const STATUTS = ['essai', 'actif', 'annule', 'impaye', 'expire'] as const;

const LIBELLE_OBSERVE: Record<LigneAbonnement['statut_observe'], CleTraduction> = {
  essai: 'abonnement.statut_essai',
  actif: 'abonnement.statut_actif',
  annule: 'abonnement.statut_annule',
  impaye: 'abonnement.statut_impaye',
  expire: 'abonnement.statut_expire',
  anomalie: 'abonnement.statut_anomalie',
};

/**
 * Les trois teintes de l'écran, et ce qu'elles disent.
 *
 * Vert : l'accès est ouvert. Ambre : il se referme ou attend un paiement.
 * Rouge : il est fermé, ou l'état est incompréhensible et demande une main
 * humaine — `anomalie` mérite le rouge non parce qu'elle est grave, mais
 * parce qu'elle est la seule ligne sur laquelle il y a quelque chose à faire.
 *
 * Le type de retour admet `undefined` : les classes d'un module CSS sont
 * indexées, et le mode strict refuse de promettre qu'une clé existe.
 */
function teinte(observe: LigneAbonnement['statut_observe']): string | undefined {
  if (observe === 'actif' || observe === 'essai') return styles.etatPublie;
  if (observe === 'annule' || observe === 'impaye') return styles.etatBrouillon;
  return styles.etatAlerte;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.abonnements'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminAbonnements({ params, searchParams }: Parametres) {
  const langue = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;

  const brut = requete['statut'];
  const demande = Array.isArray(brut) ? brut[0] : brut;
  const statut = STATUTS.includes(demande as (typeof STATUTS)[number]) ? demande : undefined;

  const resultat = await listerAbonnements({
    statut: statut ?? null,
    page: 1,
    taille: 50,
  }).catch(() => null);
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const abonnements = resultat.donnees as unknown as LigneAbonnement[];

  // Un formateur par devise présente, comme sur l'écran des commandes : une
  // liste peut mêler des euros et des francs CFA, qui n'ont pas de sous-unité.
  const devises = [...new Set(abonnements.map((abonnement) => abonnement.devise))];
  const formateurs = new Map(
    await Promise.all(
      devises.map(async (code) => [code, formateur(await lireDevise(code))] as const),
    ),
  );

  const base = `/${langue}/admin/abonnements`;

  return (
    <GabaritAdmin
      langue={langue}
      section="/abonnements"
      titre={traduire(langue, 'admin.abonnements')}
      sousTitre={traduire(langue, 'admin.abonnementsSousTitre')}
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
              {traduire(langue, LIBELLE_OBSERVE[valeur])}
            </a>
          );
        })}
      </nav>

      <div className={styles.cadre}>
        {abonnements.length === 0 ? (
          <p className={styles.vide}>{traduire(langue, 'admin.aucunAbonnement')}</p>
        ) : (
          <table className={styles.tableau}>
            <thead>
              <tr>
                <th scope="col">{traduire(langue, 'auth.email')}</th>
                <th scope="col">{traduire(langue, 'admin.colOffre')}</th>
                <th scope="col">{traduire(langue, 'admin.colStatut')}</th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colMontant')}
                </th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colPeriode')}
                </th>
              </tr>
            </thead>

            <tbody>
              {abonnements.map((abonnement) => (
                <tr key={abonnement.id}>
                  <td className={styles.cellulePrincipale}>
                    {abonnement.email ?? traduire(langue, 'admin.nonPublie')}
                  </td>

                  <td>{abonnement.offre}</td>

                  <td>
                    <span className={`${styles.etat} ${teinte(abonnement.statut_observe)}`}>
                      {traduire(langue, LIBELLE_OBSERVE[abonnement.statut_observe])}
                    </span>
                  </td>

                  <td className={styles.numerique}>
                    {formateurs.get(abonnement.devise)?.(abonnement.montant) ??
                      `${String(abonnement.montant)} ${abonnement.devise}`}
                  </td>

                  <td className={styles.numerique}>
                    {abonnement.fin_periode
                      ? new Date(abonnement.fin_periode).toLocaleDateString(langue)
                      : '—'}
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
