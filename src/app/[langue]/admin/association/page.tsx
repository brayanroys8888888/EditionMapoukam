import type { Metadata } from 'next';

import { langueValide, messageErreur, traduire, LANGUES_INTERFACE, type CleTraduction } from '@/i18n';
import { listerContenusAssociation } from '@/lib/admin/service';
import { CATEGORIES_ASSOCIATION } from '@/lib/association/service';
import { Erreur } from '@/components/etats';
import { BoutonSoumission, GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';
import {
  changerPublication,
  creerContenu,
  modifierContenu,
  poserVersion,
  supprimerContenu,
} from './actions';

/**
 * L'ESPACE ASSOCIATIF — §3.6, §4.3 F12 bis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DES CARTES, PAS UN TABLEAU — ET CE N'EST PAS UN GOÛT.                   │
 * │                                                                          │
 * │ Chaque contenu porte un FORMULAIRE. Un champ de saisie logé dans une      │
 * │ cellule de tableau se retrouve à la largeur de sa colonne, c'est-à-dire   │
 * │ quelques centimètres. C'est le même arbitrage que pour les versions       │
 * │ linguistiques d'un conte, et il réutilise les mêmes classes.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN NE MONTRE JAMAIS LE CORPS D'UN TEXTE.                         │
 * │                                                                          │
 * │ `admin_lister_contenus_association` n'en rend pas — elle rend le titre,   │
 * │ le rangement et la liste des langues écrites. Le corps existe bien côté   │
 * │ administration (`admin_lire_contenu_association` le rend, et c'est le     │
 * │ seul endroit du dépôt qui en a le droit), mais l'afficher ici ferait      │
 * │ transiter tout le fonds associatif à chaque ouverture de la liste.        │
 * │                                                                          │
 * │ Conséquence assumée : le formulaire d'écriture ci-dessous REMPLACE la     │
 * │ version, il ne la corrige pas. L'aide du champ le dit.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ACCES = ['libre', 'abonnes'] as const;

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

/** Une ligne rendue par `admin_lister_contenus_association`. */
interface LigneContenu {
  id: string;
  slug: string;
  categorie: (typeof CATEGORIES_ASSOCIATION)[number];
  acces: 'libre' | 'abonnes';
  statut: 'brouillon' | 'publie';
  publie_le: string | null;
  vedette: boolean;
  ordre: number;
  titre: string | null;
  langues: string[];
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.association'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminAssociation({ params, searchParams }: Parametres) {
  const { langue, administrateur } = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;
  const erreur = premier(requete['erreur']);

  const resultat = await listerContenusAssociation().catch(() => null);
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const contenus = resultat.donnees as unknown as LigneContenu[];

  return (
    <GabaritAdmin
      langue={langue}
      administrateur={administrateur}
      section="/association"
      titre={traduire(langue, 'admin.association')}
      sousTitre={traduire(langue, 'admin.associationSousTitre')}
    >
      {erreur ? (
        <p className={styles.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {requete['cree'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.contenuCree')}</p>
      ) : null}
      {requete['maj'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.contenuModifie')}</p>
      ) : null}
      {requete['version'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.contenuVersionPosee')}</p>
      ) : null}
      {requete['publie'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.contenuPublie')}</p>
      ) : null}
      {requete['depublie'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.contenuDepublie')}</p>
      ) : null}
      {requete['supprime'] ? (
        <p className={styles.succes}>{traduire(langue, 'admin.contenuSupprime')}</p>
      ) : null}

      <div className={styles.cadre}>
        {contenus.length === 0 ? (
          <p className={styles.vide}>{traduire(langue, 'admin.aucunContenu')}</p>
        ) : (
          <div className={styles.versions}>
            {contenus.map((contenu) => (
              <article className={styles.version} key={contenu.id}>
                <header className={styles.versionEntete}>
                  <span className={styles.versionLangue}>
                    {/*
                      Un contenu sans version française n'a pas de titre à
                      montrer. Son slug le désigne alors — c'est l'identifiant
                      que le rédacteur a choisi, et il le reconnaîtra.
                    */}
                    {contenu.titre ?? contenu.slug}
                  </span>

                  <span
                    className={`${styles.etat} ${
                      contenu.statut === 'publie' ? styles.etatPublie : styles.etatBrouillon
                    }`}
                  >
                    {traduire(langue, `admin.statut_${contenu.statut}` as CleTraduction)}
                  </span>

                  <span className={styles.etat}>
                    {traduire(langue, `admin.contenuAcces_${contenu.acces}` as CleTraduction)}
                  </span>

                  <span className={styles.versionFichiers}>
                    {contenu.slug}
                    {' · '}
                    {traduire(langue, 'admin.colLangues')} :{' '}
                    {contenu.langues.length > 0
                      ? contenu.langues
                          .map((code) =>
                            code === 'fr' || code === 'en'
                              ? traduire(langue, `langue.${code}` as CleTraduction)
                              : code,
                          )
                          .join(', ')
                      : '—'}
                    {contenu.publie_le
                      ? ` · ${new Date(contenu.publie_le).toLocaleDateString(langue)}`
                      : ''}
                  </span>
                </header>

                {/* ── Rangement ────────────────────────────────────────── */}
                <form className={styles.formulaire} action={modifierContenu.bind(null, langue)}>
                  <input type="hidden" name="id" value={contenu.id} />

                  <span className={styles.blocIntitule}>
                    {traduire(langue, 'admin.contenuReglages')}
                  </span>

                  <div className={styles.rangee}>
                    <div className={styles.champ}>
                      <label className={styles.libelle} htmlFor={`cat-${contenu.id}`}>
                        {traduire(langue, 'admin.contenuCategorie')}
                      </label>
                      <select
                        className={styles.saisie}
                        id={`cat-${contenu.id}`}
                        name="categorie"
                        defaultValue={contenu.categorie}
                      >
                        {CATEGORIES_ASSOCIATION.map((categorie) => (
                          <option key={categorie} value={categorie}>
                            {traduire(langue, `v2.cat_${categorie}` as CleTraduction)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.champ}>
                      <label className={styles.libelle} htmlFor={`acces-${contenu.id}`}>
                        {traduire(langue, 'admin.contenuAcces')}
                      </label>
                      <select
                        className={styles.saisie}
                        id={`acces-${contenu.id}`}
                        name="acces"
                        defaultValue={contenu.acces}
                      >
                        {ACCES.map((acces) => (
                          <option key={acces} value={acces}>
                            {traduire(langue, `admin.contenuAcces_${acces}` as CleTraduction)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.champ}>
                      <label className={styles.libelle} htmlFor={`ordre-${contenu.id}`}>
                        {traduire(langue, 'admin.contenuOrdre')}
                      </label>
                      <input
                        className={styles.saisie}
                        id={`ordre-${contenu.id}`}
                        name="ordre"
                        type="number"
                        min={0}
                        max={999}
                        step={1}
                        defaultValue={contenu.ordre}
                      />
                    </div>
                  </div>

                  <label className={styles.interrupteur} htmlFor={`vedette-${contenu.id}`}>
                    <input
                      className={styles.interrupteurCase}
                      id={`vedette-${contenu.id}`}
                      name="vedette"
                      type="checkbox"
                      value="oui"
                      defaultChecked={contenu.vedette}
                    />
                    <span>
                      <span className={styles.interrupteurNom}>
                        {traduire(langue, 'admin.contenuVedette')}
                      </span>
                      <span className={styles.interrupteurNote}>
                        {traduire(langue, 'admin.contenuVedetteAide')}
                      </span>
                    </span>
                  </label>

                  <div className={styles.boutons}>
                    <BoutonSoumission variante="secondaire">
                      {traduire(langue, 'admin.contenuEnregistrer')}
                    </BoutonSoumission>
                  </div>
                </form>

                {/* ── Publication et suppression ───────────────────────── */}
                <div className={styles.boutons}>
                  {/*
                    L'état VOULU part dans le formulaire, jamais « bascule » :
                    deux onglets ouverts sur cette liste inverseraient sinon
                    deux fois un statut touché une seule fois.
                  */}
                  <form
                    className={styles.formulaireNu}
                    action={changerPublication.bind(null, langue)}
                  >
                    <input type="hidden" name="id" value={contenu.id} />
                    <input
                      type="hidden"
                      name="publie"
                      value={contenu.statut === 'publie' ? 'non' : 'oui'}
                    />
                    <BoutonSoumission variante="discret">
                      {traduire(
                        langue,
                        contenu.statut === 'publie'
                          ? 'admin.contenuDepublier'
                          : 'admin.contenuPublier',
                      )}
                    </BoutonSoumission>
                  </form>

                  <form
                    className={styles.formulaireNu}
                    action={supprimerContenu.bind(null, langue)}
                  >
                    <input type="hidden" name="id" value={contenu.id} />
                    <BoutonSoumission variante="danger">
                      {traduire(langue, 'admin.contenuSupprimer')}
                    </BoutonSoumission>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className={styles.aide}>{traduire(langue, 'admin.contenuSuppressionAide')}</p>
      </div>

      {/* ── Écrire une version ───────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>{traduire(langue, 'admin.contenuVersionTitre')}</h2>

        <div className={styles.cadre}>
          <form className={styles.formulaire} action={poserVersion.bind(null, langue)}>
            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="version-contenu">
                  {traduire(langue, 'admin.contenuVersionContenu')}
                </label>
                <select className={styles.saisie} id="version-contenu" name="id" required>
                  {contenus.map((contenu) => (
                    <option key={contenu.id} value={contenu.id}>
                      {contenu.titre ?? contenu.slug} ({contenu.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="version-langue">
                  {traduire(langue, 'admin.contenuVersionLangue')}
                </label>
                <select
                  className={styles.saisie}
                  id="version-langue"
                  name="langueVersion"
                  defaultValue="fr"
                >
                  {LANGUES_INTERFACE.map((code) => (
                    <option key={code} value={code}>
                      {traduire(langue, `langue.${code}` as CleTraduction)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="version-titre">
                {traduire(langue, 'admin.contenuTitre')}
              </label>
              <input
                className={styles.saisie}
                id="version-titre"
                name="titre"
                maxLength={200}
                required
              />
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="version-chapeau">
                {traduire(langue, 'admin.contenuChapeau')}
              </label>
              <textarea
                className={styles.zoneTexte}
                id="version-chapeau"
                name="chapeau"
                maxLength={400}
                rows={2}
                aria-describedby="version-chapeau-aide"
              />
            </div>

            <p className={styles.aide} id="version-chapeau-aide">
              {traduire(langue, 'admin.contenuChapeauAide')}
            </p>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="version-corps">
                {traduire(langue, 'admin.contenuVersionCorps')}
              </label>
              <textarea
                className={styles.zoneTexte}
                id="version-corps"
                name="corps"
                rows={16}
                aria-describedby="version-corps-aide"
              />
            </div>

            <p className={styles.aide} id="version-corps-aide">
              {traduire(langue, 'admin.contenuVersionCorpsAide')}
            </p>
            <p className={styles.aide}>{traduire(langue, 'admin.contenuVersionAide')}</p>

            <BoutonSoumission disabled={contenus.length === 0}>
              {traduire(langue, 'admin.contenuVersionPoser')}
            </BoutonSoumission>
          </form>
        </div>
      </section>

      {/* ── Créer un contenu ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>{traduire(langue, 'admin.contenuCreerTitre')}</h2>

        <div className={styles.cadre}>
          <form className={styles.formulaire} action={creerContenu.bind(null, langue)}>
            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="contenu-slug">
                  {traduire(langue, 'admin.contenuSlug')}
                </label>
                <input
                  className={styles.saisie}
                  id="contenu-slug"
                  name="slug"
                  minLength={3}
                  maxLength={96}
                  // Le même motif que la contrainte de la table et que le schéma
                  // Zod de la route, qui restent seuls juges : celui-ci épargne
                  // un aller-retour, il ne décide rien.
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  required
                  aria-describedby="contenu-slug-aide"
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="contenu-categorie">
                  {traduire(langue, 'admin.contenuCategorie')}
                </label>
                <select
                  className={styles.saisie}
                  id="contenu-categorie"
                  name="categorie"
                  defaultValue="vie-associative"
                >
                  {CATEGORIES_ASSOCIATION.map((categorie) => (
                    <option key={categorie} value={categorie}>
                      {traduire(langue, `v2.cat_${categorie}` as CleTraduction)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="contenu-acces">
                  {traduire(langue, 'admin.contenuAcces')}
                </label>
                <select
                  className={styles.saisie}
                  id="contenu-acces"
                  name="acces"
                  defaultValue="abonnes"
                  aria-describedby="contenu-acces-aide"
                >
                  {ACCES.map((acces) => (
                    <option key={acces} value={acces}>
                      {traduire(langue, `admin.contenuAcces_${acces}` as CleTraduction)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className={styles.aide} id="contenu-slug-aide">
              {traduire(langue, 'admin.contenuSlugAide')}
            </p>
            <p className={styles.aide} id="contenu-acces-aide">
              {traduire(langue, 'admin.contenuAccesAide')}
            </p>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="contenu-titre">
                {traduire(langue, 'admin.contenuTitre')}
              </label>
              <input
                className={styles.saisie}
                id="contenu-titre"
                name="titre"
                maxLength={200}
                required
              />
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="contenu-chapeau">
                {traduire(langue, 'admin.contenuChapeau')}
              </label>
              <textarea
                className={styles.zoneTexte}
                id="contenu-chapeau"
                name="chapeau"
                maxLength={400}
                rows={2}
              />
            </div>

            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="contenu-minutes">
                  {traduire(langue, 'admin.contenuMinutes')}
                </label>
                <input
                  className={styles.saisie}
                  id="contenu-minutes"
                  name="minutes"
                  type="number"
                  min={1}
                  max={600}
                  step={1}
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="contenu-image">
                  {traduire(langue, 'admin.contenuImage')}
                </label>
                <input
                  className={styles.saisie}
                  id="contenu-image"
                  name="image_url"
                  maxLength={500}
                  aria-describedby="contenu-image-aide"
                />
              </div>
            </div>

            <p className={styles.aide} id="contenu-image-aide">
              {traduire(langue, 'admin.contenuImageAide')}
            </p>

            <BoutonSoumission>{traduire(langue, 'admin.contenuCreer')}</BoutonSoumission>
          </form>
        </div>
      </section>
    </GabaritAdmin>
  );
}
