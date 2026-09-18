import type { Metadata } from 'next';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { listerAvis, type StatutAvis } from '@/lib/admin/service';
import { Erreur } from '@/components/etats';
import { BoutonSoumission, GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';
import { modererAvis, supprimerAvis } from './actions';

/**
 * LA FILE DE MODÉRATION DES AVIS — migration 0072.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN EST LE SEUL ENDROIT DU DÉPÔT QUI MONTRE L'ADRESSE D'UN LECTEUR │
 * │ À CÔTÉ DE SON AVIS.                                                      │
 * │                                                                          │
 * │ Le public ne voit que `auteur_affiche`, le nom que l'auteur a choisi.     │
 * │ La modération, elle, a besoin de savoir qui écrit : c'est ce qui permet   │
 * │ de reconnaître un même compte derrière deux avis, et de mesurer un abus.  │
 * │ `admin_lister_avis` est donc la seule fonction qui joigne `users`, et      │
 * │ elle n'est exécutable que par `service_role`.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DES CARTES, PAS UN TABLEAU — ET AUCUNE PAGINATION.                      │
 * │                                                                          │
 * │ Un avis fait deux mille caractères ; une cellule de tableau en montre     │
 * │ trente. Quant à la pagination, elle ferait perdre sa place à chaque       │
 * │ décision prise, puisque traiter un avis le fait sortir de la file filtrée.│
 * │ Le catalogue de cet éditeur compte dix titres : la file se mesure en      │
 * │ dizaines de lignes, pas en milliers.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Les trois états d'un avis — ce sont les onglets de la file. */
const STATUTS: readonly StatutAvis[] = ['en_attente', 'publie', 'rejete'] as const;

/*
 * Les décisions, elles, ne sont que DEUX. `admin_moderer_avis` refuse
 * `en_attente` : modérer un avis, c'est le publier ou le refuser, pas le
 * reposer sur la pile. Offrir le troisième choix dans la liste déroulante
 * promettrait un geste que la base refuse.
 */
const DECISIONS: readonly StatutAvis[] = ['publie', 'rejete'] as const;

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

function statutValide(valeur: string | undefined): StatutAvis | undefined {
  return STATUTS.find((statut) => statut === valeur);
}

/** Une ligne rendue par `admin_lister_avis`. */
interface LigneAvis {
  id: string;
  book_id: string;
  livre_titre: string;
  livre_slug: string;
  user_id: string;
  auteur_affiche: string;
  auteur_email: string | null;
  note: number;
  texte: string;
  statut: StatutAvis;
  cree_le: string;
  maj_le: string;
  modere_le: string | null;
  motif_rejet: string | null;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.avis'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminAvis({ params, searchParams }: Parametres) {
  const { langue, administrateur } = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;
  const erreur = premier(requete['erreur']);

  /*
   * Un `statut` inconnu dans l'URL n'est pas une erreur : il ne filtre rien, et
   * la file entière s'affiche. Refuser la page apprendrait à qui bricole l'URL
   * quelles valeurs existent, pour un écran qui n'en tire aucun bénéfice.
   */
  const statut = statutValide(premier(requete['statut']));

  const resultat = await listerAvis(statut === undefined ? {} : { statut }).catch(() => null);
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const avis = resultat.donnees as unknown as LigneAvis[];
  const base = `/${langue}/admin/avis`;

  return (
    <GabaritAdmin
      langue={langue}
      administrateur={administrateur}
      section="/avis"
      titre={traduire(langue, 'admin.avis')}
      sousTitre={traduire(langue, 'admin.avisSousTitre')}
    >
      {erreur ? (
        <p className={styles.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {requete['modere'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.avisModere')}</p>
      ) : null}
      {requete['supprime'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.avisSupprime')}</p>
      ) : null}

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
              {traduire(langue, `admin.avisStatut_${valeur}` as CleTraduction)}
            </a>
          );
        })}
      </nav>

      <div className={styles.cadre}>
        {avis.length === 0 ? (
          <p className={styles.vide}>{traduire(langue, 'admin.avisAucun')}</p>
        ) : (
          <div className={styles.versions}>
            {avis.map((ligne) => (
              <article className={styles.version} key={ligne.id}>
                <header className={styles.versionEntete}>
                  <span className={styles.versionLangue}>{ligne.livre_titre}</span>

                  <span
                    className={`${styles.etat} ${
                      ligne.statut === 'publie'
                        ? styles.etatPublie
                        : ligne.statut === 'rejete'
                          ? styles.etatAlerte
                          : styles.etatBrouillon
                    }`}
                  >
                    {traduire(langue, `admin.avisStatut_${ligne.statut}` as CleTraduction)}
                  </span>

                  <span className={styles.etat}>
                    {traduire(langue, 'admin.avisNote')} {ligne.note}/5
                  </span>

                  <span className={styles.versionFichiers}>
                    {ligne.auteur_affiche}
                    {/*
                      L'adresse est une donnée de modération, pas un ornement :
                      elle ne quitte jamais cet écran, et le public ne connaît
                      de l'auteur que le nom qu'il s'est donné.
                    */}
                    {ligne.auteur_email ? ` · ${ligne.auteur_email}` : ''}
                    {' · '}
                    {traduire(langue, 'admin.avisEcritLe')}{' '}
                    {new Date(ligne.cree_le).toLocaleDateString(langue)}
                    {ligne.modere_le
                      ? ` · ${traduire(langue, 'admin.avisModereLe')} ${new Date(
                          ligne.modere_le,
                        ).toLocaleDateString(langue)}`
                      : ''}
                  </span>
                </header>

                <p className={styles.aide}>{ligne.texte}</p>

                <form className={styles.formulaire} action={modererAvis.bind(null, langue)}>
                  <input type="hidden" name="id" value={ligne.id} />
                  {/*
                    Le filtre courant repart avec la décision : traiter un avis
                    le fait sortir de la file « en attente », et l'éditeur doit
                    retrouver la suivante, pas la liste complète.
                  */}
                  {statut ? <input type="hidden" name="filtre" value={statut} /> : null}

                  <div className={styles.rangee}>
                    <div className={styles.champ}>
                      <label className={styles.libelle} htmlFor={`decision-${ligne.id}`}>
                        {traduire(langue, 'admin.avisDecision')}
                      </label>
                      <select
                        className={styles.saisie}
                        id={`decision-${ligne.id}`}
                        name="decision"
                        defaultValue={ligne.statut === 'en_attente' ? 'publie' : ligne.statut}
                      >
                        {DECISIONS.map((valeur) => (
                          <option key={valeur} value={valeur}>
                            {traduire(langue, `admin.avisStatut_${valeur}` as CleTraduction)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.champ}>
                      <label className={styles.libelle} htmlFor={`motif-${ligne.id}`}>
                        {traduire(langue, 'admin.avisMotif')}
                      </label>
                      <input
                        className={styles.saisie}
                        id={`motif-${ligne.id}`}
                        name="motif"
                        maxLength={500}
                        defaultValue={ligne.motif_rejet ?? ''}
                        aria-describedby="avis-motif-aide"
                      />
                    </div>
                  </div>

                  <div className={styles.boutons}>
                    <BoutonSoumission variante="secondaire">
                      {traduire(langue, 'admin.avisAppliquer')}
                    </BoutonSoumission>
                  </div>
                </form>

                <div className={styles.boutons}>
                  <form className={styles.formulaireNu} action={supprimerAvis.bind(null, langue)}>
                    <input type="hidden" name="id" value={ligne.id} />
                    {statut ? <input type="hidden" name="filtre" value={statut} /> : null}
                    <BoutonSoumission variante="danger">
                      {traduire(langue, 'admin.avisSupprimer')}
                    </BoutonSoumission>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className={styles.aide} id="avis-motif-aide">
          {traduire(langue, 'admin.avisMotifAide')}
        </p>
        <p className={styles.aide}>{traduire(langue, 'admin.avisSupprimerAide')}</p>
      </div>
    </GabaritAdmin>
  );
}
