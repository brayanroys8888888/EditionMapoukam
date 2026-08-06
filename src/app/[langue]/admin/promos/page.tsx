import type { Metadata } from 'next';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { listerPromos } from '@/lib/admin/service';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';
import { creerPromo } from './actions';

/**
 * LES CODES PROMO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « ACTIF » EST UNE COLONNE, PAS UNE DÉDUCTION.                           │
 * │                                                                          │
 * │ Un code peut être marqué actif tout en étant échu, ou épuisé. Cet écran  │
 * │ montre les trois faits SÉPARÉMENT — le drapeau, l'échéance, le compteur  │
 * │ d'usage — et n'en fabrique pas un quatrième qui les résumerait.          │
 * │                                                                          │
 * │ Parce que ce quatrième-là serait une règle métier, et que la règle qui   │
 * │ décide si un code s'applique vit dans la fonction d'encaissement. Deux   │
 * │ définitions du mot « utilisable » divergeraient le jour où l'une des     │
 * │ deux change, et c'est l'écran qui a l'air d'avoir raison.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE REMISE EN MONTANT SE FORMATE DANS SA DEVISE, PAS EN CENTIMES.       │
 * │                                                                          │
 * │ Le franc CFA n'a pas de sous-unité : diviser par cent afficherait des    │
 * │ remises fausses d'un facteur cent. Le formateur est donc résolu devise   │
 * │ par devise, comme sur les commandes et les abonnements.                  │
 * │                                                                          │
 * │ Une remise en POURCENTAGE, elle, n'a pas de devise — la base rend        │
 * │ `valeur` en points de pourcentage, et il n'y a rien à convertir.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const TYPES = ['pourcentage', 'montant'] as const;
const DEVISES = ['EUR', 'XAF', 'XOF'] as const;
const ZONES = ['international', 'afrique'] as const;

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

/** Une ligne rendue par `admin_lister_promos`. */
interface LignePromo {
  id: string;
  code: string;
  type: 'montant' | 'pourcentage';
  valeur: number;
  devise: string | null;
  zone: string;
  expire_le: string | null;
  actif: boolean;
  usage_max: number | null;
  usage_count: number;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.promos'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminPromos({ params, searchParams }: Parametres) {
  const langue = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;
  const erreur = premier(requete['erreur']);

  const resultat = await listerPromos({ page: 1, taille: 50 }).catch(() => null);
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const promos = resultat.donnees as unknown as LignePromo[];

  const devises = [
    ...new Set(
      promos
        .filter((promo) => promo.type === 'montant' && promo.devise !== null)
        .map((promo) => promo.devise as string),
    ),
  ];
  const formateurs = new Map(
    await Promise.all(
      devises.map(async (code) => [code, formateur(await lireDevise(code))] as const),
    ),
  );

  const remise = (promo: LignePromo): string => {
    if (promo.type === 'pourcentage') return `${String(promo.valeur)} %`;
    if (!promo.devise) return String(promo.valeur);
    return (
      formateurs.get(promo.devise)?.(promo.valeur) ??
      `${String(promo.valeur)} ${promo.devise}`
    );
  };

  return (
    <GabaritAdmin
      langue={langue}
      section="/promos"
      titre={traduire(langue, 'admin.promos')}
      sousTitre={traduire(langue, 'admin.promosSousTitre')}
    >
      {erreur ? (
        <p className={styles.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {requete['cree'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.promoCree')}</p>
      ) : null}

      <div className={styles.cadre}>
        {promos.length === 0 ? (
          <p className={styles.vide}>{traduire(langue, 'admin.aucunePromo')}</p>
        ) : (
          <table className={styles.tableau}>
            <thead>
              <tr>
                <th scope="col">{traduire(langue, 'admin.colCode')}</th>
                <th scope="col">{traduire(langue, 'admin.colStatut')}</th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colRemise')}
                </th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colUsage')}
                </th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colExpire')}
                </th>
              </tr>
            </thead>

            <tbody>
              {promos.map((promo) => (
                <tr key={promo.id}>
                  <td className={styles.cellulePrincipale}>{promo.code}</td>

                  <td>
                    <span
                      className={`${styles.etat} ${
                        promo.actif ? styles.etatPublie : styles.etatBrouillon
                      }`}
                    >
                      {traduire(langue, promo.actif ? 'admin.promoActif' : 'admin.promoInactif')}
                    </span>
                  </td>

                  <td className={styles.numerique}>{remise(promo)}</td>

                  <td className={styles.numerique}>
                    {promo.usage_count} /{' '}
                    {promo.usage_max ?? traduire(langue, 'admin.usageIllimite')}
                  </td>

                  <td className={styles.numerique}>
                    {promo.expire_le
                      ? new Date(promo.expire_le).toLocaleDateString(langue)
                      : traduire(langue, 'admin.sansExpiration')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Créer un code ────────────────────────────────────────────────── */}
      {/*
        ┌────────────────────────────────────────────────────────────────────┐
        │ UN CODE SE CRÉE, IL NE SE MODIFIE PAS DEPUIS CET ÉCRAN.            │
        │                                                                     │
        │ `admin_enregistrer_promo` sait faire les deux — elle écrit ou       │
        │ remplace la ligne du code donné. Mais un code déjà distribué a été   │
        │ imprimé, dicté, promis : en changer la valeur ferait varier une      │
        │ remise que des clients tiennent pour acquise, sans que rien ne le    │
        │ dise. Le désactiver est le geste honnête, et il reste à écrire.      │
        └────────────────────────────────────────────────────────────────────┘
      */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>{traduire(langue, 'admin.promoCreerTitre')}</h2>

        <div className={styles.cadre}>
          <form className={styles.formulaire} action={creerPromo.bind(null, langue)}>
            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="promo-code">
                  {traduire(langue, 'admin.promoCode')}
                </label>
                <input
                  className={styles.saisie}
                  id="promo-code"
                  name="code"
                  minLength={3}
                  maxLength={32}
                  // Le même motif que le schéma Zod de la route, qui reste seul
                  // juge : celui-ci évite un aller-retour, il ne décide rien.
                  pattern="[A-Za-z0-9]+"
                  required
                  aria-describedby="promo-code-aide"
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="promo-type">
                  {traduire(langue, 'admin.promoType')}
                </label>
                <select
                  className={styles.saisie}
                  id="promo-type"
                  name="type"
                  defaultValue="pourcentage"
                >
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {traduire(langue, `admin.promoType_${type}` as CleTraduction)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="promo-valeur">
                  {traduire(langue, 'admin.promoValeur')}
                </label>
                <input
                  className={styles.saisie}
                  id="promo-valeur"
                  name="valeur"
                  type="number"
                  min={1}
                  step={1}
                  required
                  aria-describedby="promo-valeur-aide"
                />
              </div>
            </div>

            <p className={styles.aide} id="promo-code-aide">
              {traduire(langue, 'admin.promoCodeAide')}
            </p>
            <p className={styles.aide} id="promo-valeur-aide">
              {traduire(langue, 'admin.promoValeurAide')}
            </p>

            {/*
              ┌──────────────────────────────────────────────────────────────┐
              │ DEVISE ET ZONE SONT LÀ POUR LE MONTANT FIXE, ET LUI SEUL.   │
              │                                                              │
              │ La base les exige toutes DEUX pour un montant, et les refuse │
              │ toutes deux pour un pourcentage. Les masquer selon le type    │
              │ aurait demandé du JavaScript client — ce back-office n'en a   │
              │ aucun — et un champ masqué reste un champ rempli : c'est      │
              │ l'action serveur qui ne les envoie pas pour un pourcentage.   │
              │                                                              │
              │ Ils restent donc visibles, avec la phrase qui dit quand ils   │
              │ comptent. Un champ qui disparaît sans explication apprend     │
              │ moins qu'un champ qui dit à quoi il sert.                     │
              └──────────────────────────────────────────────────────────────┘
            */}
            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="promo-devise">
                  {traduire(langue, 'admin.promoDevise')}
                </label>
                <select className={styles.saisie} id="promo-devise" name="devise" defaultValue="EUR">
                  {DEVISES.map((devise) => (
                    <option key={devise} value={devise}>
                      {devise}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="promo-zone">
                  {traduire(langue, 'admin.promoZone')}
                </label>
                <select
                  className={styles.saisie}
                  id="promo-zone"
                  name="zone"
                  defaultValue="international"
                >
                  {ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {traduire(langue, `admin.conteZone_${zone}` as CleTraduction)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className={styles.aide}>{traduire(langue, 'admin.promoPorteeAide')}</p>

            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="promo-expire">
                  {traduire(langue, 'admin.promoExpire')}
                </label>
                <input
                  className={styles.saisie}
                  id="promo-expire"
                  name="expire_le"
                  type="date"
                  aria-describedby="promo-expire-aide"
                />
                <p className={styles.aide} id="promo-expire-aide">
                  {traduire(langue, 'admin.promoExpireAide')}
                </p>
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="promo-usage">
                  {traduire(langue, 'admin.promoUsageMax')}
                </label>
                <input
                  className={styles.saisie}
                  id="promo-usage"
                  name="usage_max"
                  type="number"
                  min={1}
                  step={1}
                  aria-describedby="promo-usage-aide"
                />
                <p className={styles.aide} id="promo-usage-aide">
                  {traduire(langue, 'admin.promoUsageMaxAide')}
                </p>
              </div>
            </div>

            <ul className={styles.interrupteurs}>
              <li className={styles.interrupteur}>
                {/* Le témoin de MÊME NOM, posé avant la case : une case décochée
                    n'est pas envoyée par le navigateur, et le serveur lirait
                    « actif » là où l'éditeur a décoché. */}
                <input type="hidden" name="actif" value="non" />
                <input
                  className={styles.interrupteurCase}
                  id="promo-actif"
                  name="actif"
                  type="checkbox"
                  value="oui"
                  defaultChecked
                />
                <label className={styles.interrupteurNom} htmlFor="promo-actif">
                  {traduire(langue, 'admin.promoActifCreation')}
                </label>
              </li>
            </ul>

            <button type="submit" className={styles.boutonPrimaire}>
              {traduire(langue, 'admin.promoCreer')}
            </button>
          </form>
        </div>
      </section>
    </GabaritAdmin>
  );
}
