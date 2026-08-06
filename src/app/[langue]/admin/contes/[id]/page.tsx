import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import { lireLivre, type RegionConte } from '@/lib/admin/service';
import { Erreur } from '@/components/etats';
import { GabaritAdmin, BoutonSoumission, stylesAdmin as styles } from '@/components/admin';

import { exigerAdministrateur } from '../../garde';
import {
  ajouterVersionConte,
  changerPublicationConte,
  definirPrixConte,
  modifierConte,
  modifierVersionConte,
  supprimerConte,
} from '../actions';

/**
 * ÉDITION D'UN CONTE — le seul écran d'administration qui MUTE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS FORMULAIRES, ET TROIS PARCE QUE TROIS FONCTIONS SQL.              │
 * │                                                                          │
 * │ Les champs métier passent par `admin_modifier_livre`, les prix par       │
 * │ `admin_definir_prix` (une zone à la fois, chacune ayant sa devise), la   │
 * │ publication par `admin_changer_publication`. Chacune vérifie le rôle en  │
 * │ base, pose l'acteur pour l'audit, et applique sa règle.                  │
 * │                                                                          │
 * │ Un formulaire unique aurait dû les orchestrer, décider quoi faire quand  │
 * │ le prix passe et la publication échoue, et inventer une transaction que  │
 * │ la base n'offre pas. Trois gestes, trois traces d'audit distinctes, et   │
 * │ un refus qui nomme ce qui a échoué.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI MANQUE VIENT DE `manques_pour_publication`, PAS D'ICI.           │
 * │                                                                          │
 * │ C'est la fonction qu'applique le déclencheur de publication. L'écran     │
 * │ affiche donc exactement ce que la base refusera. Une liste de contrôle   │
 * │ réécrite ici aurait divergé au premier champ ajouté, et l'éditeur aurait │
 * │ vu « publiable » sur un titre que la base rejette.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TITRE ET LE RÉSUMÉ S'ÉDITENT — CE QUI N'A PAS TOUJOURS ÉTÉ LE CAS.   │
 * │                                                                          │
 * │ Cet écran a longtemps porté l'inverse : ils vivent dans                  │
 * │ `book_translations`, viennent du fichier déposé, et aucune fonction      │
 * │ `admin_*` ne les modifiait. L'argument était qu'en inventer une ouvrirait │
 * │ une seconde voie d'écriture sur des données que la chaîne d'ingestion    │
 * │ tient pour siennes.                                                      │
 * │                                                                          │
 * │ Il ne tenait pas. L'ingestion lit le titre dans les métadonnées du PDF : │
 * │ elle a raison la plupart du temps, et tort exactement là où on ne peut   │
 * │ rien y faire — un PDF exporté d'un traitement de texte porte souvent     │
 * │ « Document1 ». Le résumé, lui, n'est JAMAIS extrait ; il est nul après   │
 * │ ingestion, et c'est le texte qu'un client lit avant d'acheter.           │
 * │                                                                          │
 * │ Le SLUG, en revanche, reste immuable, et là c'est une décision : il est  │
 * │ dans l'adresse publique du conte, et le changer casserait les liens      │
 * │ partagés pour un gain purement cosmétique.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Ce que rend `admin_lire_livre`. */
interface Conte {
  id: string;
  slug: string;
  auteur: string;
  illustrateur: string | null;
  origine_culturelle: string | null;
  /*
   * La RÉGION, exigée à la publication depuis la migration 0044 et lisible
   * depuis la 0059 seulement. Entre les deux, l'écran ne pouvait pas la
   * préremplir : il aurait montré « non renseignée » sur un titre qui en a une,
   * et le premier enregistrement l'aurait écrasée.
   */
  region: RegionConte | null;
  age_min: number | null;
  age_max: number | null;
  themes: string[];
  nb_pages_extrait: number | null;
  statut: 'publie' | 'brouillon' | 'archive';
  gratuit: boolean;
  inclus_abonnement: boolean;
  disponible_achat: boolean;
  publie_le: string | null;
  prix: Record<string, { montant: number; devise: string }>;
  traductions: {
    /*
     * L'identifiant de la LIGNE, et non sa langue.
     *
     * `admin_modifier_traduction` est clé par lui. La langue aurait fait une
     * seconde clé, qu'il aurait fallu tenir unique par titre pour toujours.
     * Ce n'est pas un chemin de stockage : il ne donne accès à aucun fichier,
     * il nomme une ligne auprès d'une fonction qui revérifie le rôle en base et
     * qui exige, depuis la migration 0058, que la version appartienne au titre.
     */
    id: string;
    langue: string;
    titre: string;
    resume: string | null;
    statut: string;
    nb_pages: number | null;
    /*
     * DES ÉTATS, JAMAIS DES CHEMINS.
     *
     * `admin_lire_livre` ne rend pas les clés de stockage : elle rend deux
     * booléens. Le back-office a besoin de savoir si une version est complète ;
     * lui donner le chemin reviendrait à lui donner le fichier, et un chemin
     * affiché finit recopié dans une URL.
     */
    lisible: boolean;
    telechargeable: boolean;
  }[];
  manques: string[];
  publiable: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ZONES = ['international', 'afrique'] as const;
const DEVISES = ['EUR', 'XAF', 'XOF'] as const;
const LANGUES_FICHIER = ['fr', 'en'] as const;

/**
 * Les cinq régions, dans l'ordre de l'énumération `region_conte`.
 *
 * Leurs libellés vivent sous `regions.*`, où le catalogue public les lit déjà.
 * En écrire un second jeu sous `admin.*` aurait fait deux vérités pour le même
 * mot, et c'est la seconde qui aurait cessé d'être relue.
 */
/**
 * Ce que chaque enregistrement réussi annonce.
 *
 * Une table plutôt qu'une cascade de ternaires : cinq formulaires reviennent
 * maintenant ici avec leur propre `enregistre=`, et une chaîne de ternaires les
 * aurait fait tous retomber sur le message du dernier `else` — c'est-à-dire
 * « les champs sont enregistrés » après avoir déposé un fichier.
 */
const MESSAGES_SUCCES: Record<string, CleTraduction> = {
  champs: 'admin.conteEnregistreChamps',
  prix: 'admin.conteEnregistrePrix',
  publication: 'admin.conteEnregistrePublication',
  version: 'admin.conteEnregistreVersion',
  version_ajoutee: 'admin.conteVersionAjoutee',
};

const REGIONS = [
  'afrique_ouest',
  'sahel',
  'afrique_centrale',
  'afrique_australe',
  'afrique_est',
] as const satisfies readonly RegionConte[];

/**
 * Les trois leviers d'accès, leurs libellés et leur explication.
 *
 * Table explicite plutôt que clés dérivées du nom de colonne : une clé de
 * traduction fabriquée par concaténation échappe au typage de `CleTraduction`
 * et se casse en silence — le repli affiche alors la clé brute, et personne ne
 * le voit sur un poste francophone.
 */
const LEVIERS = [
  {
    champ: 'gratuit',
    nom: 'admin.conteGratuit',
    note: 'admin.conteGratuitAide',
  },
  {
    champ: 'inclus_abonnement',
    nom: 'admin.conteInclusAbonnement',
    note: 'admin.conteInclusAbonnementAide',
  },
  {
    champ: 'disponible_achat',
    nom: 'admin.conteDisponibleAchat',
    note: 'admin.conteDisponibleAchatAide',
  },
] as const satisfies readonly {
  champ: 'gratuit' | 'inclus_abonnement' | 'disponible_achat';
  nom: CleTraduction;
  note: CleTraduction;
}[];

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

/**
 * Nomme un manque en clair, et RETOMBE SUR SON NOM BRUT s'il est inconnu.
 *
 * `manques_pour_publication` rend des noms de colonnes — `region`,
 * `prix_afrique`. Les afficher tels quels demandait à l'éditeur de connaître le
 * schéma ; les traduire par une table close aurait fait disparaître, en
 * silence, tout manque ajouté à la base plus tard. `traduire` rend la clé
 * elle-même quand elle n'existe pas : c'est ce que ce repli détecte.
 */
function libelleManque(langue: Parameters<typeof traduire>[0], manque: string): string {
  const cle = `admin.manque_${manque}` as CleTraduction;
  const rendu = traduire(langue, cle);
  return rendu === cle ? manque : rendu;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.conteEditer'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminConte({ params, searchParams }: Parametres) {
  const { langue: langueBrute, id } = await params;
  const langue = await exigerAdministrateur(langueBrute);
  const requete = await searchParams;

  if (!UUID.test(id)) notFound();

  const resultat = await lireLivre(id).catch(() => null);
  if (resultat && !resultat.ok && resultat.raison === 'introuvable') notFound();
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const conte = resultat.donnees as unknown as Conte;

  const erreur = premier(requete['erreur']);
  const enregistre = premier(requete['enregistre']);
  const depose = premier(requete['depose']);

  const prix = Object.entries(conte.prix ?? {});

  return (
    <GabaritAdmin
      langue={langue}
      section="/contes"
      titre={conte.slug}
      sousTitre={traduire(langue, 'admin.conteEditionSousTitre')}
      actions={
        <a className={styles.boutonDiscret} href={`/${langue}/admin/contes`}>
          {traduire(langue, 'admin.conteRetourListe')}
        </a>
      }
    >
      {erreur ? (
        <p className={styles.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      {depose ? <p className={styles.succes}>{traduire(langue, 'admin.conteDepose')}</p> : null}

      {enregistre ? (
        <p className={styles.succes}>{traduire(langue, MESSAGES_SUCCES[enregistre] ?? 'admin.conteEnregistreChamps')}</p>
      ) : null}

      {/* ── Champs métier ────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>{traduire(langue, 'admin.conteChampsTitre')}</h2>

        <div className={styles.cadre}>
          <form className={styles.formulaire} action={modifierConte.bind(null, langue, conte.id)}>
            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="conte-auteur">
                {traduire(langue, 'admin.conteAuteur')}
              </label>
              <input
                className={styles.saisie}
                id="conte-auteur"
                name="auteur"
                maxLength={200}
                defaultValue={conte.auteur}
              />
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="conte-illustrateur">
                {traduire(langue, 'admin.conteIllustrateur')}
              </label>
              <input
                className={styles.saisie}
                id="conte-illustrateur"
                name="illustrateur"
                maxLength={200}
                defaultValue={conte.illustrateur ?? ''}
              />
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="conte-origine">
                {traduire(langue, 'admin.conteOrigine')}
              </label>
              <input
                className={styles.saisie}
                id="conte-origine"
                name="origine_culturelle"
                maxLength={200}
                defaultValue={conte.origine_culturelle ?? ''}
                aria-describedby="conte-origine-aide"
              />
              <p className={styles.aide} id="conte-origine-aide">
                {traduire(langue, 'admin.conteOrigineAide')}
              </p>
            </div>

            {/*
              ┌──────────────────────────────────────────────────────────────┐
              │ LA RÉGION — LE CHAMP QUI MANQUAIT, ET CE QU'IL COÛTAIT.     │
              │                                                              │
              │ `manques_pour_publication` l'exige depuis la migration 0044, │
              │ et aucune fonction `admin_*` ne permettait de la poser avant  │
              │ la 0057. L'éditeur déposait son PDF, remplissait tout ce que  │
              │ cet écran proposait, et « Publier » restait éteint — avec un  │
              │ manque nommé `region` qu'aucun champ ne pouvait satisfaire.   │
              │                                                              │
              │ Elle n'est PAS l'origine culturelle, qui est juste au-dessus  │
              │ et reste un texte libre (« conte akan — Ghana »). Celle-ci    │
              │ est l'une de cinq valeurs, et c'est sur elle que le catalogue │
              │ filtre. `region_depuis_origine` sait deviner la seconde       │
              │ depuis la première, mais son commentaire est formel :         │
              │ amorçage et reprise de données UNIQUEMENT.                    │
              │                                                              │
              │ Le choix vide vaut « ne touche pas » et non « efface » —      │
              │ comme tous les champs métier de ce formulaire, et parce que   │
              │ la publication l'exige de toute façon.                        │
              └──────────────────────────────────────────────────────────────┘
            */}
            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="conte-region">
                {traduire(langue, 'admin.conteRegion')}
              </label>
              <select
                className={styles.saisie}
                id="conte-region"
                name="region"
                defaultValue={conte.region ?? ''}
                aria-describedby="conte-region-aide"
              >
                <option value="">{traduire(langue, 'admin.conteRegionAucune')}</option>
                {REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {traduire(langue, `regions.${region}` as CleTraduction)}
                  </option>
                ))}
              </select>
              <p className={styles.aide} id="conte-region-aide">
                {traduire(langue, 'admin.conteRegionAide')}
              </p>
            </div>

            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="conte-age-min">
                  {traduire(langue, 'admin.conteAgeMin')}
                </label>
                <input
                  className={styles.saisie}
                  id="conte-age-min"
                  name="age_min"
                  type="number"
                  min={0}
                  max={18}
                  defaultValue={conte.age_min ?? ''}
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="conte-age-max">
                  {traduire(langue, 'admin.conteAgeMax')}
                </label>
                <input
                  className={styles.saisie}
                  id="conte-age-max"
                  name="age_max"
                  type="number"
                  min={0}
                  max={18}
                  defaultValue={conte.age_max ?? ''}
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="conte-extrait">
                  {traduire(langue, 'admin.contePagesExtrait')}
                </label>
                <input
                  className={styles.saisie}
                  id="conte-extrait"
                  name="nb_pages_extrait"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={conte.nb_pages_extrait ?? ''}
                  aria-describedby="conte-extrait-aide"
                />
                <p className={styles.aide} id="conte-extrait-aide">
                  {traduire(langue, 'admin.contePagesExtraitAide')}
                </p>
              </div>
            </div>

            {/*
              ┌──────────────────────────────────────────────────────────────┐
              │ TROIS LEVIERS INDÉPENDANTS, ET CHACUN DIT CE QU'IL FAIT.    │
              │                                                              │
              │ Un conte peut être à la fois inclus dans l'abonnement et     │
              │ vendu à l'unité : les deux champs ne s'excluent pas. Et seul │
              │ l'achat donne le TÉLÉCHARGEMENT — la phrase est écrite sous  │
              │ la case, parce que c'est la confusion la plus coûteuse de    │
              │ cette plateforme et qu'elle se décide ici.                   │
              │                                                              │
              │ Chaque case est précédée d'un champ caché de MÊME NOM : une  │
              │ case décochée n'est pas envoyée par le navigateur, et sans   │
              │ ce témoin le serveur lirait « inchangé » là où l'éditeur a   │
              │ décoché.                                                     │
              └──────────────────────────────────────────────────────────────┘
            */}
            <h3 className={styles.libelle}>{traduire(langue, 'admin.conteAccesTitre')}</h3>

            <ul className={styles.interrupteurs}>
              {LEVIERS.map((levier) => (
                <li key={levier.champ} className={styles.interrupteur}>
                  {/* Le témoin de MÊME NOM, posé avant la case. */}
                  <input type="hidden" name={levier.champ} value="non" />

                  <input
                    className={styles.interrupteurCase}
                    id={`conte-${levier.champ}`}
                    name={levier.champ}
                    type="checkbox"
                    value="oui"
                    defaultChecked={conte[levier.champ]}
                    aria-describedby={`conte-${levier.champ}-aide`}
                  />
                  <label className={styles.interrupteurNom} htmlFor={`conte-${levier.champ}`}>
                    {traduire(langue, levier.nom)}
                  </label>
                  <span className={styles.interrupteurNote} id={`conte-${levier.champ}-aide`}>
                    {traduire(langue, levier.note)}
                  </span>
                </li>
              ))}
            </ul>

            <p className={styles.aide}>{traduire(langue, 'admin.conteChampsIndependants')}</p>

            <BoutonSoumission>
              {traduire(langue, 'admin.conteEnregistrer')}
            </BoutonSoumission>
          </form>
        </div>
      </section>

      {/* ── Prix par zone ────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>{traduire(langue, 'admin.contePrixTitre')}</h2>

        <div className={styles.cadre}>
          <table className={styles.tableau}>
            <thead>
              <tr>
                <th scope="col">{traduire(langue, 'admin.conteZone')}</th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.contePrixActuels')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ZONES.map((zone) => {
                const actuel = prix.find(([nom]) => nom === zone)?.[1];
                return (
                  <tr key={zone}>
                    <td className={styles.cellulePrincipale}>
                      {traduire(langue, `admin.conteZone_${zone}` as CleTraduction)}
                    </td>
                    {/*
                      Les montants sont affichés BRUTS, avec leur devise, et
                      jamais convertis : chaque zone a sa grille, et une
                      conversion faite ici inventerait un montant que personne
                      ne facturera. C'est un écran d'administration, pas une
                      vitrine — l'éditeur saisit ces nombres tels quels.
                    */}
                    <td className={styles.numerique}>
                      {actuel
                        ? `${String(actuel.montant)} ${actuel.devise}`
                        : traduire(langue, 'admin.aucunPrix')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <form className={styles.formulaire} action={definirPrixConte.bind(null, langue, conte.id)}>
            <div className={styles.rangee}>
              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="prix-zone">
                  {traduire(langue, 'admin.conteZone')}
                </label>
                <select className={styles.saisie} id="prix-zone" name="zone" defaultValue="international">
                  {ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {traduire(langue, `admin.conteZone_${zone}` as CleTraduction)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="prix-montant">
                  {traduire(langue, 'admin.conteMontant')}
                </label>
                <input
                  className={styles.saisie}
                  id="prix-montant"
                  name="montant"
                  type="number"
                  min={1}
                  step={1}
                  required
                />
              </div>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="prix-devise">
                  {traduire(langue, 'admin.conteDevise')}
                </label>
                {/*
                  La devise est portée par la LIGNE, jamais déduite de la zone :
                  la zone afrique couvre XAF et XOF, deux devises distinctes.
                */}
                <select className={styles.saisie} id="prix-devise" name="devise" defaultValue="EUR">
                  {DEVISES.map((devise) => (
                    <option key={devise} value={devise}>
                      {devise}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className={styles.aide}>{traduire(langue, 'admin.contePrixAide')}</p>

            <BoutonSoumission variante="secondaire">
              {traduire(langue, 'admin.contePrixEnregistrer')}
            </BoutonSoumission>
          </form>
        </div>
      </section>

      {/* ── Publication ──────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>{traduire(langue, 'admin.contePublicationTitre')}</h2>

        {/*
          ┌──────────────────────────────────────────────────────────────────┐
          │ UNE SEULE GRILLE, ET C'EST LA CORRECTION.                        │
          │                                                                  │
          │ Ce bloc mêlait `.formulaire` et `.boutons` dans le même `.cadre`, │
          │ chacun avec son propre rembourrage calculé séparément : la        │
          │ pastille de statut, la liste des manques et les trois boutons     │
          │ partaient de trois gauches différentes, et rien ne les espaçait   │
          │ verticalement.                                                    │
          │                                                                  │
          │ Et la pastille était seule — un « Brouillon » sans intitulé ne    │
          │ dit pas de quoi il est le statut. Chaque partie porte maintenant  │
          │ son nom au-dessus d'elle.                                        │
          └──────────────────────────────────────────────────────────────────┘
        */}
        <div className={styles.cadre}>
          <div className={styles.publication}>
            <div className={styles.publicationBloc}>
              <span className={styles.blocIntitule}>
                {traduire(langue, 'admin.contePublicationStatut')}
              </span>
              <span
                className={`${styles.etat} ${
                  conte.statut === 'publie'
                    ? styles.etatPublie
                    : conte.manques.length > 0
                      ? styles.etatAlerte
                      : styles.etatBrouillon
                }`}
              >
                {traduire(langue, `admin.statut_${conte.statut}` as CleTraduction)}
              </span>
            </div>

            <div className={styles.publicationBloc}>
              {conte.manques.length > 0 ? (
                <>
                  <span className={styles.blocIntitule}>
                    {traduire(langue, 'admin.contePublicationManques')}
                  </span>
                  {/*
                    Les manques sont NOMMÉS en clair, et retombent sur leur nom
                    de colonne s'ils sont inconnus de la traduction. La liste
                    vient de `manques_pour_publication`, la fonction même
                    qu'applique le déclencheur : l'écran affiche donc exactement
                    ce que la base refusera.
                  */}
                  <ul className={styles.manques}>
                    {conte.manques.map((manque) => (
                      <li key={manque} className={styles.manque}>
                        {libelleManque(langue, manque)}
                      </li>
                    ))}
                  </ul>
                  <p className={styles.aide}>{traduire(langue, 'admin.contePublicationBloquee')}</p>
                </>
              ) : (
                <p className={styles.aide}>{traduire(langue, 'admin.contePublicationPrete')}</p>
              )}
            </div>

            <div className={styles.boutons}>
              {/*
                « Publier » est DÉSACTIVÉ tant que la base refuserait, et la
                liste ci-dessus dit pourquoi. Un bouton actif qui échoue à
                chaque pression apprend à ne plus lui faire confiance ; un
                bouton éteint à côté de ce qui l'éteint indique quoi faire.
              */}
              <form action={changerPublicationConte.bind(null, langue, conte.id, 'publie')}>
                <BoutonSoumission disabled={!conte.publiable || conte.statut === 'publie'}>
                  {traduire(langue, 'admin.contePublier')}
                </BoutonSoumission>
              </form>

              <form action={changerPublicationConte.bind(null, langue, conte.id, 'brouillon')}>
                <BoutonSoumission variante="secondaire" disabled={conte.statut === 'brouillon'}>
                  {traduire(langue, 'admin.conteRemettreBrouillon')}
                </BoutonSoumission>
              </form>

              <form action={changerPublicationConte.bind(null, langue, conte.id, 'archive')}>
                <BoutonSoumission variante="discret" disabled={conte.statut === 'archive'}>
                  {traduire(langue, 'admin.conteArchiver')}
                </BoutonSoumission>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ── Versions linguistiques ───────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>{traduire(langue, 'admin.conteTraductionsTitre')}</h2>

        {/*
          ┌──────────────────────────────────────────────────────────────────┐
          │ UNE CARTE PAR VERSION, ET NON UN TABLEAU.                        │
          │                                                                  │
          │ Chacune porte un formulaire, et un champ de saisie dans une       │
          │ cellule prend la largeur de sa colonne — quelques centimètres     │
          │ pour un résumé de deux mille caractères.                          │
          │                                                                  │
          │ Un formulaire PAR version, parce qu'`admin_modifier_traduction`   │
          │ écrit une ligne à la fois : un formulaire unique aurait dû        │
          │ décider quoi faire quand la troisième échoue après que les deux   │
          │ premières sont écrites, et inventer une transaction que la base   │
          │ n'offre pas.                                                      │
          └──────────────────────────────────────────────────────────────────┘
        */}
        <div className={styles.cadre}>
          <div className={styles.versions}>
            {conte.traductions.map((version) => {
              const fichiers = [
                version.lisible ? traduire(langue, 'admin.conteFichierLecture') : null,
                version.telechargeable
                  ? traduire(langue, 'admin.conteFichierTelechargement')
                  : null,
              ].filter(Boolean);

              return (
                <div key={version.id} className={styles.version}>
                  <div className={styles.versionEntete}>
                    <span className={styles.versionLangue}>
                      {traduire(langue, `langue.${version.langue}` as CleTraduction)}
                    </span>
                    <span className={styles.versionFichiers}>
                      {fichiers.length > 0
                        ? fichiers.join(' · ')
                        : traduire(langue, 'admin.conteAucunFichier')}
                      {version.nb_pages === null
                        ? ''
                        : ` · ${String(version.nb_pages)} ${traduire(langue, 'admin.conteColPages').toLowerCase()}`}
                    </span>
                  </div>

                  <form
                    className={styles.formulaireNu}
                    action={modifierVersionConte.bind(null, langue, conte.id, version.id)}
                  >
                    <div className={styles.champ}>
                      <label className={styles.libelle} htmlFor={`version-${version.id}-titre`}>
                        {traduire(langue, 'admin.conteColTitre')}
                      </label>
                      {/*
                        `required` parce que la base refuse un titre vide, et
                        que l'action n'envoie pas un champ vide : sans cette
                        marque, vider le champ ne ferait RIEN, en silence.
                      */}
                      <input
                        className={styles.saisie}
                        id={`version-${version.id}-titre`}
                        name="titre"
                        maxLength={300}
                        required
                        defaultValue={version.titre}
                      />
                    </div>

                    <div className={styles.champ}>
                      <label className={styles.libelle} htmlFor={`version-${version.id}-resume`}>
                        {traduire(langue, 'admin.conteVersionResume')}
                      </label>
                      <textarea
                        className={`${styles.saisie} ${styles.zoneTexte}`}
                        id={`version-${version.id}-resume`}
                        name="resume"
                        maxLength={2000}
                        defaultValue={version.resume ?? ''}
                        aria-describedby={`version-${version.id}-resume-aide`}
                      />
                      <p className={styles.aide} id={`version-${version.id}-resume-aide`}>
                        {traduire(langue, 'admin.conteVersionResumeAide')}
                      </p>
                    </div>

                    <BoutonSoumission variante="secondaire">
                      {traduire(langue, 'admin.conteVersionModifier')}
                    </BoutonSoumission>
                  </form>
                </div>
              );
            })}
          </div>
        </div>

        <p className={styles.note}>{traduire(langue, 'admin.conteTraductionsAide')}</p>
      </section>

      {/* ── Ajouter une version linguistique ─────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitre}>{traduire(langue, 'admin.conteVersionAjoutTitre')}</h2>

        <div className={styles.cadre}>
          {/*
            ┌────────────────────────────────────────────────────────────────┐
            │ LE MÊME DÉPÔT QU'AILLEURS, RATTACHÉ À CE TITRE-CI.            │
            │                                                                │
            │ §5.5 : un livre est une entité parente, avec N déclinaisons     │
            │ linguistiques, et un droit d'accès porte sur le LIVRE. Le même  │
            │ fichier déposé depuis « Ajouter un conte » créait un SECOND     │
            │ titre au slug suffixé — donc un second prix, une seconde        │
            │ publication, et un acheteur du français sans aucun droit sur    │
            │ l'anglais qu'il croyait avoir acheté.                           │
            │                                                                │
            │ Le rattachement est posé par l'action serveur et non par un     │
            │ champ caché : un champ caché est un champ qu'un client peut     │
            │ changer.                                                        │
            │                                                                │
            │ Aucun encodage déclaré ici — un formulaire dont l'action est    │
            │ une FONCTION est encodé par React, qui écrase celui qu'on pose. │
            └────────────────────────────────────────────────────────────────┘
          */}
          <form
            className={styles.formulaire}
            action={ajouterVersionConte.bind(null, langue, conte.id)}
          >
            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="version-fichier">
                {traduire(langue, 'admin.conteFichier')}
              </label>
              <input
                className={styles.saisie}
                id="version-fichier"
                name="fichier"
                type="file"
                accept="application/pdf,.pdf"
                required
                aria-describedby="version-fichier-aide"
              />
              <p className={styles.aide} id="version-fichier-aide">
                {traduire(langue, 'admin.conteFichierAide')}
              </p>
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="version-langue">
                {traduire(langue, 'admin.conteLangue')}
              </label>
              <select
                className={styles.saisie}
                id="version-langue"
                name="langue"
                defaultValue={
                  LANGUES_FICHIER.find(
                    (code) => !conte.traductions.some((version) => version.langue === code),
                  ) ?? 'fr'
                }
              >
                {LANGUES_FICHIER.map((code) => (
                  <option key={code} value={code}>
                    {traduire(langue, `langue.${code}` as CleTraduction)}
                  </option>
                ))}
              </select>
            </div>

            <p className={styles.aide}>{traduire(langue, 'admin.conteVersionAjoutAide')}</p>

            <BoutonSoumission>
              {traduire(langue, 'admin.conteVersionAjouter')}
            </BoutonSoumission>
          </form>
        </div>
      </section>

      {/* ── Suppression ──────────────────────────────────────────────────── */}
      {/*
        ┌────────────────────────────────────────────────────────────────────┐
        │ LE BOUTON N'APPARAÎT QUE SUR UN BROUILLON — ET CE N'EST QU'UNE     │
        │ POLITESSE.                                                          │
        │                                                                     │
        │ `admin_supprimer_livre` revérifie le statut ET l'absence de droits   │
        │ rattachés. Un titre publié ou archivé est référencé en cascade par   │
        │ `entitlements` et `order_items` : le supprimer effacerait en         │
        │ silence des droits payés et des pièces comptables. Cacher le bouton  │
        │ évite de proposer un geste qui sera refusé ; c'est la base qui       │
        │ refuse.                                                              │
        └────────────────────────────────────────────────────────────────────┘
      */}
      {conte.statut === 'brouillon' ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitre}>
            {traduire(langue, 'admin.conteSuppressionTitre')}
          </h2>

          <div className={styles.zoneDanger}>
            <form
              className={styles.formulaireNu}
              action={supprimerConte.bind(null, langue, conte.id)}
            >
              <p className={styles.aide}>{traduire(langue, 'admin.conteSuppressionAide')}</p>

              <div className={styles.champ}>
                <label className={styles.libelle} htmlFor="suppression-motif">
                  {traduire(langue, 'admin.conteSuppressionMotif')}
                </label>
                {/*
                  Le motif est obligatoire ici ET en base. Ce n'est pas une
                  politesse : c'est la contrepartie d'un geste irréversible,
                  pour que le journal d'audit puisse dire, six mois plus tard,
                  pourquoi un titre a disparu.
                */}
                <input
                  className={styles.saisie}
                  id="suppression-motif"
                  name="motif"
                  minLength={3}
                  maxLength={300}
                  required
                  aria-describedby="suppression-motif-aide"
                />
                <p className={styles.aide} id="suppression-motif-aide">
                  {traduire(langue, 'admin.conteSuppressionMotifAide')}
                </p>
              </div>

              <BoutonSoumission variante="danger">
                {traduire(langue, 'admin.conteSupprimer')}
              </BoutonSoumission>
            </form>
          </div>
        </section>
      ) : null}

      <p className={styles.note}>{traduire(langue, 'admin.chargeParLaBase')}</p>
    </GabaritAdmin>
  );
}
