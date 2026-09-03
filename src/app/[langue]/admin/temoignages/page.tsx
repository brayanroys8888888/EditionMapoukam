import type { Metadata } from 'next';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { lireTemoignage, listerTemoignages } from '@/lib/admin/service';
import { Erreur } from '@/components/etats';
import { BoutonSoumission, GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';
import {
  changerPublicationTemoignage,
  creerTemoignage,
  enregistrerTemoignage,
  supprimerTemoignage,
} from './actions';

/**
 * LES TÉMOIGNAGES DE L'ACCUEIL — migration 0073.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES TROIS CITATIONS ÉTAIENT ÉCRITES EN DUR DANS `src/i18n/fr.json`.     │
 * │                                                                          │
 * │ Les changer demandait un déploiement, et rien ne les distinguait du       │
 * │ libellé d'un bouton. Elles sont maintenant du CONTENU : l'éditeur les     │
 * │ écrit, les ordonne, les publie et les retire depuis cet écran.            │
 * │                                                                          │
 * │ Un témoignage n'est pas un avis. L'avis parle d'UN TITRE, il est écrit    │
 * │ par un lecteur depuis son compte, et il passe par une file de modération  │
 * │ parce qu'il vient de quelqu'un d'autre. Le témoignage parle du SITE, il   │
 * │ est saisi ici, et on ne modère pas son propre texte.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CET ÉCRAN LIT CHAQUE TÉMOIGNAGE EN DÉTAIL.                     │
 * │                                                                          │
 * │ `admin_lister_temoignages` ne rend que le texte FRANÇAIS et la liste des  │
 * │ langues écrites. Un formulaire bâti sur cette ligne enverrait donc un      │
 * │ texte anglais vide — et le texte vide SUPPRIME la version. Le détail est   │
 * │ lu titre par titre, ce qui est tenable parce qu'ils sont trois : la page   │
 * │ d'accueil n'en affiche pas davantage.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const LANGUES = ['fr', 'en'] as const;

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

/** Une ligne rendue par `admin_lister_temoignages`. */
interface LigneTemoignage {
  id: string;
  auteur: string;
  statut: 'brouillon' | 'publie';
  ordre: number;
}

/** Le détail rendu par `admin_lire_temoignage`. */
interface DetailTemoignage {
  id: string;
  auteur: string;
  statut: 'brouillon' | 'publie';
  ordre: number;
  versions: { langue: string; texte: string; role: string | null }[];
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.temoignages'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminTemoignages({ params, searchParams }: Parametres) {
  const langue = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;
  const erreur = premier(requete['erreur']);

  const liste = await listerTemoignages().catch(() => null);
  if (!liste?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const lignes = liste.donnees as unknown as LigneTemoignage[];

  /*
   * Trois appels en parallèle, et non trois attentes en file : ils ne dépendent
   * pas les uns des autres. Un témoignage effacé entre la liste et son détail
   * rend `null` — il disparaît alors de l'écran, ce qui est exactement ce que
   * l'éditeur vient de demander depuis un autre onglet.
   */
  const details = await Promise.all(
    lignes.map(async (ligne) => {
      const detail = await lireTemoignage(ligne.id).catch(() => null);
      if (!detail?.ok || detail.donnees === null) return null;
      return detail.donnees as unknown as DetailTemoignage;
    }),
  );

  const temoignages = details.filter((detail): detail is DetailTemoignage => detail !== null);

  function version(temoignage: DetailTemoignage, code: string) {
    return temoignage.versions.find((v) => v.langue === code);
  }

  return (
    <GabaritAdmin
      langue={langue}
      section="/temoignages"
      titre={traduire(langue, 'admin.temoignages')}
      sousTitre={traduire(langue, 'admin.temoignagesSousTitre')}
    >
      {erreur ? (
        <p className={styles.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {requete['cree'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.temoignageCree')}</p>
      ) : null}
      {requete['maj'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.temoignageModifie')}</p>
      ) : null}
      {requete['publie'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.temoignagePublie')}</p>
      ) : null}
      {requete['depublie'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.temoignageDepublie')}</p>
      ) : null}
      {requete['supprime'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.temoignageSupprime')}</p>
      ) : null}

      <div className={styles.cadre}>
        {temoignages.length === 0 ? (
          <p className={styles.vide}>{traduire(langue, 'admin.temoignageAucun')}</p>
        ) : (
          <div className={styles.versions}>
            {temoignages.map((temoignage) => (
              <article className={styles.version} key={temoignage.id}>
                <header className={styles.versionEntete}>
                  <span className={styles.versionLangue}>{temoignage.auteur}</span>

                  <span
                    className={`${styles.etat} ${
                      temoignage.statut === 'publie' ? styles.etatPublie : styles.etatBrouillon
                    }`}
                  >
                    {traduire(langue, `admin.statut_${temoignage.statut}` as CleTraduction)}
                  </span>

                  <span className={styles.versionFichiers}>
                    {traduire(langue, 'admin.temoignageOrdre')} : {temoignage.ordre}
                    {' · '}
                    {traduire(langue, 'admin.colLangues')} :{' '}
                    {temoignage.versions.length > 0
                      ? temoignage.versions
                          .map((v) =>
                            v.langue === 'fr' || v.langue === 'en'
                              ? traduire(langue, `langue.${v.langue}` as CleTraduction)
                              : v.langue,
                          )
                          .join(', ')
                      : '—'}
                  </span>
                </header>

                <form
                  className={styles.formulaire}
                  action={enregistrerTemoignage.bind(null, langue)}
                >
                  <input type="hidden" name="id" value={temoignage.id} />

                  <div className={styles.rangee}>
                    <div className={styles.champ}>
                      <label className={styles.libelle} htmlFor={`auteur-${temoignage.id}`}>
                        {traduire(langue, 'admin.temoignageAuteur')}
                      </label>
                      <input
                        className={styles.saisie}
                        id={`auteur-${temoignage.id}`}
                        name="auteur"
                        maxLength={120}
                        required
                        defaultValue={temoignage.auteur}
                      />
                    </div>

                    <div className={styles.champ}>
                      <label className={styles.libelle} htmlFor={`ordre-${temoignage.id}`}>
                        {traduire(langue, 'admin.temoignageOrdre')}
                      </label>
                      <input
                        className={styles.saisie}
                        id={`ordre-${temoignage.id}`}
                        name="ordre"
                        type="number"
                        min={0}
                        max={999}
                        step={1}
                        defaultValue={temoignage.ordre}
                      />
                    </div>
                  </div>

                  {LANGUES.map((code) => (
                    <div key={code}>
                      <span className={styles.blocIntitule}>
                        {traduire(langue, `langue.${code}` as CleTraduction)}
                      </span>

                      <div className={styles.champ}>
                        <label
                          className={styles.libelle}
                          htmlFor={`texte-${code}-${temoignage.id}`}
                        >
                          {traduire(langue, 'admin.temoignageTexte')}
                        </label>
                        <textarea
                          className={styles.zoneTexte}
                          id={`texte-${code}-${temoignage.id}`}
                          name={`texte_${code}`}
                          maxLength={600}
                          rows={3}
                          defaultValue={version(temoignage, code)?.texte ?? ''}
                        />
                      </div>

                      <div className={styles.champ}>
                        <label
                          className={styles.libelle}
                          htmlFor={`role-${code}-${temoignage.id}`}
                        >
                          {traduire(langue, 'admin.temoignageRole')}
                        </label>
                        <input
                          className={styles.saisie}
                          id={`role-${code}-${temoignage.id}`}
                          name={`role_${code}`}
                          maxLength={120}
                          defaultValue={version(temoignage, code)?.role ?? ''}
                        />
                      </div>
                    </div>
                  ))}

                  <p className={styles.aide}>{traduire(langue, 'admin.temoignageTexteAide')}</p>
                  <p className={styles.aide}>{traduire(langue, 'admin.temoignageRoleAide')}</p>

                  <div className={styles.boutons}>
                    <BoutonSoumission variante="secondaire">
                      {traduire(langue, 'admin.temoignageEnregistrer')}
                    </BoutonSoumission>
                  </div>
                </form>

                <div className={styles.boutons}>
                  <form
                    className={styles.formulaireNu}
                    action={changerPublicationTemoignage.bind(null, langue)}
                  >
                    <input type="hidden" name="id" value={temoignage.id} />
                    <input
                      type="hidden"
                      name="publie"
                      value={temoignage.statut === 'publie' ? 'non' : 'oui'}
                    />
                    <BoutonSoumission variante="discret">
                      {traduire(
                        langue,
                        temoignage.statut === 'publie'
                          ? 'admin.temoignageDepublier'
                          : 'admin.temoignagePublier',
                      )}
                    </BoutonSoumission>
                  </form>

                  <form
                    className={styles.formulaireNu}
                    action={supprimerTemoignage.bind(null, langue)}
                  >
                    <input type="hidden" name="id" value={temoignage.id} />
                    <BoutonSoumission variante="danger">
                      {traduire(langue, 'admin.temoignageSupprimer')}
                    </BoutonSoumission>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className={styles.aide}>{traduire(langue, 'admin.temoignageAide')}</p>
      </div>

      {/* ── Ajouter un témoignage ────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>
          {traduire(langue, 'admin.temoignageCreerTitre')}
        </h2>

        <div className={styles.cadre}>
          <form className={styles.formulaire} action={creerTemoignage.bind(null, langue)}>
            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="nouveau-auteur">
                  {traduire(langue, 'admin.temoignageAuteur')}
                </label>
                <input
                  className={styles.saisie}
                  id="nouveau-auteur"
                  name="auteur"
                  maxLength={120}
                  required
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="nouveau-ordre">
                  {traduire(langue, 'admin.temoignageOrdre')}
                </label>
                <input
                  className={styles.saisie}
                  id="nouveau-ordre"
                  name="ordre"
                  type="number"
                  min={0}
                  max={999}
                  step={1}
                  defaultValue={0}
                />
              </div>
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="nouveau-texte">
                {traduire(langue, 'admin.temoignageTexte')}
              </label>
              <textarea
                className={styles.zoneTexte}
                id="nouveau-texte"
                name="texte_fr"
                maxLength={600}
                rows={3}
                required
              />
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="nouveau-role">
                {traduire(langue, 'admin.temoignageRole')}
              </label>
              <input className={styles.saisie} id="nouveau-role" name="role_fr" maxLength={120} />
            </div>

            {/*
              La création n'ouvre que le français : c'est ce qu'exige la
              publication, et l'anglais s'ajoute ensuite sur la carte, où les
              deux langues se voient côte à côte.
            */}
            <BoutonSoumission>{traduire(langue, 'admin.temoignageCreer')}</BoutonSoumission>
          </form>
        </div>
      </section>
    </GabaritAdmin>
  );
}
