import type { Metadata } from 'next';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { listerOffres } from '@/lib/admin/service';
import { formateur, lireDevise } from '@/lib/money/affichage';
import { Erreur } from '@/components/etats';
import { BoutonSoumission, GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';
import { changerVente, creerOffre, poserPrix, supprimerOffre } from './actions';

/**
 * LES OFFRES D'ABONNEMENT — §4.3 F12 bis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN VEND DES DROITS. IL N'EN DÉFINIT AUCUN.                       │
 * │                                                                          │
 * │ Une offre porte un DOMAINE, et le domaine dit ce qu'elle ouvre :          │
 * │ `lecture` la lecture en ligne du catalogue, `association` les contenus    │
 * │ réservés de l'espace associatif. Ce que chacun ouvre est écrit UNE fois,  │
 * │ dans `abonnement_ouvre_droit` (migration 0067), et c'est de là que vient  │
 * │ l'étanchéité de §3.6 — pas d'une phrase de cet écran.                    │
 * │                                                                          │
 * │ Conséquence : créer une offre `association` n'ouvre rien de nouveau. Elle │
 * │ met en vente un droit qui existait déjà, sans ligne de code de plus.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « CE QUI MANQUE » EST LU, PAS CALCULÉ ICI.                              │
 * │                                                                          │
 * │ `admin_lister_offres` rend `manques` : les zones sans prix. L'écran       │
 * │ pourrait comparer la liste des zones à celle des prix et arriver au même  │
 * │ résultat — pour un temps. C'est exactement ce que fait                    │
 * │ `manques_pour_publication` pour les titres, et pour la même raison :      │
 * │ un manque calculé deux fois finit par se contredire, et c'est l'écran     │
 * │ qui a l'air d'avoir raison.                                              │
 * │                                                                          │
 * │ Le refus d'activer une offre sans prix vit dans la même fonction. L'écran │
 * │ n'empêche pas le geste : il montre le manque, et la base tranche.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const DOMAINES = ['lecture', 'association'] as const;
const PERIODES = ['mensuel', 'annuel'] as const;
const ZONES = ['international', 'afrique'] as const;
const DEVISES = ['EUR', 'XAF', 'XOF'] as const;

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

/** Un prix d'offre, tel que `admin_lister_offres` l'assemble en JSON. */
interface PrixOffre {
  montant: number;
  devise: string;
}

/** Une ligne rendue par `admin_lister_offres`. */
interface LigneOffre {
  id: string;
  code: string;
  domaine: 'lecture' | 'association';
  periode: 'mensuel' | 'annuel';
  libelle_fr: string;
  libelle_en: string;
  descriptif_fr: string | null;
  descriptif_en: string | null;
  actif: boolean;
  ordre: number;
  prix: Record<string, PrixOffre>;
  manques: string[];
  abonnements: number | string;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.offres'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminOffres({ params, searchParams }: Parametres) {
  const { langue, administrateur } = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;
  const erreur = premier(requete['erreur']);

  const resultat = await listerOffres().catch(() => null);
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const offres = resultat.donnees as unknown as LigneOffre[];

  /*
   * Un formateur PAR DEVISE, résolu depuis la base.
   *
   * Le franc CFA n'a pas de sous-unité : diviser par cent afficherait des
   * montants faux d'un facteur cent. C'est la même précaution que sur les
   * commandes, les abonnements et les promos — et elle ne se devine pas de la
   * zone, puisque la zone `afrique` couvre XAF et XOF.
   */
  const devises = [
    ...new Set(offres.flatMap((offre) => Object.values(offre.prix).map((prix) => prix.devise))),
  ];
  const formateurs = new Map(
    await Promise.all(
      devises.map(async (code) => [code, formateur(await lireDevise(code))] as const),
    ),
  );

  const montant = (prix: PrixOffre): string =>
    formateurs.get(prix.devise)?.(prix.montant) ?? `${String(prix.montant)} ${prix.devise}`;

  return (
    <GabaritAdmin
      langue={langue}
      administrateur={administrateur}
      section="/offres"
      titre={traduire(langue, 'admin.offres')}
      sousTitre={traduire(langue, 'admin.offresSousTitre')}
    >
      {erreur ? (
        <p className={styles.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {requete['cree'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.offreCreee')}</p>
      ) : null}
      {requete['maj'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.offreModifiee')}</p>
      ) : null}
      {requete['prix'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.offrePrixPose')}</p>
      ) : null}
      {requete['supprime'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.offreSupprimee')}</p>
      ) : null}

      <div className={styles.cadre}>
        {offres.length === 0 ? (
          <p className={styles.vide}>{traduire(langue, 'admin.aucuneOffre')}</p>
        ) : (
          <table className={styles.tableau}>
            <thead>
              <tr>
                <th scope="col">{traduire(langue, 'admin.colCode')}</th>
                <th scope="col">{traduire(langue, 'admin.colDomaine')}</th>
                <th scope="col">{traduire(langue, 'admin.offrePeriode')}</th>
                <th scope="col">{traduire(langue, 'admin.colStatut')}</th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colPrix')}
                </th>
                <th scope="col">{traduire(langue, 'admin.colManques')}</th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colAbonnements')}
                </th>
                <th scope="col">{traduire(langue, 'admin.colActions')}</th>
              </tr>
            </thead>

            <tbody>
              {offres.map((offre) => {
                const contrats = Number(offre.abonnements);

                return (
                  <tr key={offre.id}>
                    <td className={styles.cellulePrincipale}>
                      {offre.libelle_fr}
                      <br />
                      <span className={styles.note}>{offre.code}</span>
                    </td>

                    <td>
                      {traduire(langue, `admin.offreDomaine_${offre.domaine}` as CleTraduction)}
                    </td>

                    <td>
                      {traduire(langue, `admin.offrePeriode_${offre.periode}` as CleTraduction)}
                    </td>

                    <td>
                      <span
                        className={`${styles.etat} ${
                          offre.actif ? styles.etatPublie : styles.etatBrouillon
                        }`}
                      >
                        {traduire(langue, offre.actif ? 'admin.offreActive' : 'admin.offreInactive')}
                      </span>
                    </td>

                    <td className={styles.numerique}>
                      {ZONES.filter((zone) => offre.prix[zone] !== undefined).map((zone) => (
                        <span key={zone} style={{ display: 'block' }}>
                          {/* Le prix, PUIS la zone : c'est le montant qu'on
                              cherche du regard dans une colonne de chiffres. */}
                          {montant(offre.prix[zone] as PrixOffre)}{' '}
                          <span className={styles.note}>
                            {traduire(langue, `admin.conteZone_${zone}` as CleTraduction)}
                          </span>
                        </span>
                      ))}

                      {Object.keys(offre.prix).length === 0 ? (
                        <span className={styles.note}>
                          {traduire(langue, 'admin.offreSansPrix')}
                        </span>
                      ) : null}
                    </td>

                    <td>
                      {offre.manques.length === 0 ? (
                        <span className={styles.note}>{traduire(langue, 'admin.offreComplete')}</span>
                      ) : (
                        <span className={styles.manque}>
                          {traduire(langue, 'admin.offreManqueZone').replace(
                            '{zones}',
                            offre.manques
                              .map((zone) =>
                                traduire(langue, `admin.conteZone_${zone}` as CleTraduction),
                              )
                              .join(', '),
                          )}
                        </span>
                      )}
                    </td>

                    <td className={styles.numerique}>{contrats}</td>

                    <td>
                      <div className={styles.boutons}>
                        {/*
                          L'état VOULU part dans le formulaire, jamais « bascule » :
                          deux onglets ouverts sur cette liste inverseraient sinon
                          deux fois un drapeau touché une seule fois.
                        */}
                        <form className={styles.formulaireNu} action={changerVente.bind(null, langue)}>
                          <input type="hidden" name="id" value={offre.id} />
                          <input type="hidden" name="actif" value={offre.actif ? 'non' : 'oui'} />
                          <BoutonSoumission variante="discret">
                            {traduire(
                              langue,
                              offre.actif ? 'admin.offreDesactiver' : 'admin.offreActiver',
                            )}
                          </BoutonSoumission>
                        </form>

                        {/*
                          Le bouton de suppression est ÉTEINT dès qu'un contrat
                          s'y rattache. La base refuserait de toute façon — c'est
                          elle qui décide — mais proposer un geste qu'on sait
                          voué à l'échec revient à faire perdre un aller-retour.
                        */}
                        <form
                          className={styles.formulaireNu}
                          action={supprimerOffre.bind(null, langue)}
                        >
                          <input type="hidden" name="id" value={offre.id} />
                          <BoutonSoumission variante="danger" disabled={contrats > 0}>
                            {traduire(langue, 'admin.offreSupprimer')}
                          </BoutonSoumission>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <p className={styles.aide}>{traduire(langue, 'admin.offreSuppressionAide')}</p>
      </div>

      {/* ── Poser un prix ────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>{traduire(langue, 'admin.offrePrixTitre')}</h2>

        <div className={styles.cadre}>
          <form className={styles.formulaire} action={poserPrix.bind(null, langue)}>
            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="prix-offre">
                  {traduire(langue, 'admin.offrePrixOffre')}
                </label>
                <select className={styles.saisie} id="prix-offre" name="id" required>
                  {offres.map((offre) => (
                    <option key={offre.id} value={offre.id}>
                      {offre.libelle_fr} ({offre.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="prix-zone">
                  {traduire(langue, 'admin.colZone')}
                </label>
                <select
                  className={styles.saisie}
                  id="prix-zone"
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

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="prix-montant">
                  {traduire(langue, 'admin.offrePrixMontant')}
                </label>
                <input
                  className={styles.saisie}
                  id="prix-montant"
                  name="montant"
                  type="number"
                  min={1}
                  step={1}
                  required
                  aria-describedby="prix-aide"
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="prix-devise">
                  {traduire(langue, 'admin.colDevise')}
                </label>
                <select className={styles.saisie} id="prix-devise" name="devise" defaultValue="EUR">
                  {DEVISES.map((devise) => (
                    <option key={devise} value={devise}>
                      {devise}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className={styles.aide} id="prix-aide">
              {traduire(langue, 'admin.offrePrixAide')}
            </p>

            <BoutonSoumission disabled={offres.length === 0}>
              {traduire(langue, 'admin.offrePrixPoser')}
            </BoutonSoumission>
          </form>
        </div>
      </section>

      {/* ── Créer une offre ──────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>{traduire(langue, 'admin.offreCreerTitre')}</h2>

        <div className={styles.cadre}>
          <form className={styles.formulaire} action={creerOffre.bind(null, langue)}>
            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="offre-code">
                  {traduire(langue, 'admin.offreCode')}
                </label>
                <input
                  className={styles.saisie}
                  id="offre-code"
                  name="code"
                  minLength={3}
                  maxLength={48}
                  // Le même motif que la contrainte de la table et que le schéma
                  // Zod de la route, qui restent seuls juges : celui-ci épargne
                  // un aller-retour, il ne décide rien.
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  required
                  aria-describedby="offre-code-aide"
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="offre-domaine">
                  {traduire(langue, 'admin.offreDomaine')}
                </label>
                <select
                  className={styles.saisie}
                  id="offre-domaine"
                  name="domaine"
                  defaultValue="lecture"
                  aria-describedby="offre-domaine-aide"
                >
                  {DOMAINES.map((domaine) => (
                    <option key={domaine} value={domaine}>
                      {traduire(langue, `admin.offreDomaine_${domaine}` as CleTraduction)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="offre-periode">
                  {traduire(langue, 'admin.offrePeriode')}
                </label>
                <select
                  className={styles.saisie}
                  id="offre-periode"
                  name="periode"
                  defaultValue="mensuel"
                  aria-describedby="offre-periode-aide"
                >
                  {PERIODES.map((periode) => (
                    <option key={periode} value={periode}>
                      {traduire(langue, `admin.offrePeriode_${periode}` as CleTraduction)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className={styles.aide} id="offre-code-aide">
              {traduire(langue, 'admin.offreCodeAide')}
            </p>
            <p className={styles.aide} id="offre-domaine-aide">
              {traduire(langue, 'admin.offreDomaineAide')}
            </p>
            <p className={styles.aide} id="offre-periode-aide">
              {traduire(langue, 'admin.offrePeriodeAide')}
            </p>

            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="offre-libelle-fr">
                  {traduire(langue, 'admin.offreLibelleFr')}
                </label>
                <input
                  className={styles.saisie}
                  id="offre-libelle-fr"
                  name="libelle_fr"
                  maxLength={120}
                  required
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="offre-libelle-en">
                  {traduire(langue, 'admin.offreLibelleEn')}
                </label>
                {/*
                  L'anglais est EXIGÉ à la création, comme le français.
                  L'interface a deux langues et une clé manquante s'y replie sur
                  le français : une offre sans libellé anglais s'afficherait en
                  français au milieu d'un tunnel anglais, sans que rien ne le
                  signale à l'éditeur.
                */}
                <input
                  className={styles.saisie}
                  id="offre-libelle-en"
                  name="libelle_en"
                  maxLength={120}
                  required
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="offre-ordre">
                  {traduire(langue, 'admin.offreOrdre')}
                </label>
                <input
                  className={styles.saisie}
                  id="offre-ordre"
                  name="ordre"
                  type="number"
                  min={0}
                  max={999}
                  step={1}
                  defaultValue={0}
                  aria-describedby="offre-ordre-aide"
                />
              </div>
            </div>

            <p className={styles.aide} id="offre-ordre-aide">
              {traduire(langue, 'admin.offreOrdreAide')}
            </p>

            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="offre-descriptif-fr">
                  {traduire(langue, 'admin.offreDescriptifFr')}
                </label>
                <textarea
                  className={styles.zoneTexte}
                  id="offre-descriptif-fr"
                  name="descriptif_fr"
                  maxLength={400}
                  rows={3}
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="offre-descriptif-en">
                  {traduire(langue, 'admin.offreDescriptifEn')}
                </label>
                <textarea
                  className={styles.zoneTexte}
                  id="offre-descriptif-en"
                  name="descriptif_en"
                  maxLength={400}
                  rows={3}
                />
              </div>
            </div>

            <BoutonSoumission>{traduire(langue, 'admin.offreCreer')}</BoutonSoumission>
          </form>
        </div>
      </section>
    </GabaritAdmin>
  );
}
