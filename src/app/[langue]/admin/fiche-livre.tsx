/**
 * LA FICHE D'ÉDITION D'UN TITRE — un seul écran, DEUX adresses.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE COMPOSANT EXISTE, ALORS QU'IL N'A QU'UNE IMPLÉMENTATION.    │
 * │                                                                          │
 * │ Les champs, les prix, les manques, la publication et les versions        │
 * │ linguistiques sont identiques pour un conte et pour un livret : le       │
 * │ support est une étiquette de rangement, il n'ouvre et ne ferme aucun     │
 * │ droit. Écrire deux formulaires aurait fait deux écrans à tenir           │
 * │ d'accord, et c'est toujours la copie oubliée qui reste en production.    │
 * │                                                                          │
 * │ Ce qui manquait n'était pas l'écran : c'était l'ADRESSE. Un livret       │
 * │ s'éditait sous `/admin/contes/<id>`, ce qui se lit comme une erreur de   │
 * │ rangement — et l'a été signalé comme telle le 7 septembre 2026.          │
 * │                                                                          │
 * │ D'où ce composant, et deux `page.tsx` minces qui l'appellent. La GARDE   │
 * │ reste dans chacune des deux pages, en toutes lettres : un test           │
 * │ d'architecture lit les fichiers `page.tsx` du dossier d'administration   │
 * │ et exige d'y voir `exigerAdministrateur`. Une page qui se contenterait   │
 * │ de réexporter l'autre passerait le contrôle sans qu'un lecteur puisse    │
 * │ voir qu'elle est protégée — et le test a refusé exactement cela.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La fiche choisit ses mots et son rayon de retour d'après le `type_document`
 * du titre OUVERT, jamais d'après le chemin : ouvrir un conte à l'adresse des
 * livrets l'afficherait donc avec les mots d'un conte, et le ramènerait à sa
 * liste. Le chemin ne décide de rien — c'est la donnée qui décide.
 */
import { notFound } from 'next/navigation';

import {
  messageErreur,
  traduire,
  type CleTraduction,
  type LangueInterface,
} from '@/i18n';
import { lireLivre, type OrientationPage, type TypeDocument } from '@/lib/admin/service';
import type { Appelant } from '@/lib/auth/session';
/*
 * La couverture passe par le MÊME composant que le catalogue public, et par la
 * même fabrique d'URL. Deux raisons, et la seconde est la plus coûteuse à
 * découvrir : `urlsCouverture` est le seul endroit qui connaisse la convention
 * `covers/<jeton>/<taille>.webp` (migration 0049), et `Couverture` sait qu'un
 * jeton présent ne garantit pas que le fichier existe — il bascule sur le
 * motif quand le chargement échoue, au lieu d'afficher une image cassée.
 */
import { urlsCouverture } from '@/lib/storage/covers';
import { Couverture, SubstitutCouverture } from '@/components/catalogue/couverture';
import { teinteDepuisThemes } from '@/components/motif/teinte';
import { Erreur } from '@/components/etats';
import {
  GabaritAdmin,
  BoutonSoumission,
  stylesAdmin as styles,
  type SectionAdmin,
} from '@/components/admin';

import {
  ajouterVersionConte,
  changerPublicationConte,
  definirPrixConte,
  modifierConte,
  modifierVersionConte,
  supprimerConte,
} from './contes/actions';

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
/**
 * Cet écran héberge `ajouterVersionConte`, qui déclenche une ingestion complète
 * — même traitement, même durée, même plafond que le dépôt initial. Voir
 * `contes/nouveau/page.tsx` : c'est la fonction de la PAGE que Vercel borne,
 * puisque l'action appelle la route d'ingestion en mémoire.
 */
export const maxDuration = 60;

/** Ce que rend `admin_lire_livre`. */
interface Conte {
  id: string;
  slug: string;
  auteur: string;
  illustrateur: string | null;
  origine_culturelle: string | null;
  /*
   * Le TYPE DE SUPPORT et l'ORIENTATION, créés par la migration 0061 et
   * lisibles depuis la 0062. Non nuls en base — d'où l'absence de `| null` :
   * tout titre en porte un, ne serait-ce que par défaut.
   */
  type_document: TypeDocument;
  orientation: OrientationPage;
  age_min: number | null;
  age_max: number | null;
  themes: string[];
  /*
   * Le NIVEAU et les OBJECTIFS — colonnes de la 0079, écrivables depuis la
   * 0081, relues depuis la 0082. Ils ne valent que pour un livret : nuls et
   * vides sur un conte, et la fiche ne montre alors pas les champs.
   */
  niveau: string | null;
  objectifs: string[];
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
    /*
     * La DESCRIPTION LONGUE, colonne créée par la migration 0070.
     *
     * Elle ne remplace pas le résumé : le résumé est la phrase d'accroche des
     * cartes, la description est le texte de la fiche produit.
     */
    description: string | null;
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
  /*
   * Le JETON du jeu de couvertures, rendu depuis la migration 0087.
   *
   * Un jeton, jamais un chemin : trois tailles vivent sous `covers/<jeton>/`,
   * et seul `src/lib/storage/covers.ts` sait les nommer. Nul tant que la
   * chaîne d'ingestion n'a pas produit la couverture — l'écran affiche alors
   * son substitut plutôt qu'une image cassée.
   */
  couverture_jeton: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ZONES = ['international', 'afrique'] as const;
const DEVISES = ['EUR', 'XAF', 'XOF'] as const;
const LANGUES_FICHIER = ['fr', 'en'] as const;

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

/**
 * Les deux types de support, dans l'ordre de l'énumération `document_type`.
 *
 * Leurs libellés vivent sous `documents.*` — au même titre que `regions.*` —
 * parce que le catalogue public les affiche AUSSI. En écrire un jeu sous
 * `admin.*` aurait fait deux vérités pour le même mot, et c'est la seconde qui
 * aurait cessé d'être relue.
 */
const TYPES_DOCUMENT = ['conte', 'livret_pedagogique'] as const satisfies readonly TypeDocument[];

/** Les deux orientations, dans l'ordre de l'énumération `page_orientation`. */
const ORIENTATIONS = ['paysage', 'portrait'] as const satisfies readonly OrientationPage[];

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

/**
 * LES LIBELLÉS QUI CHANGENT AVEC LE SUPPORT DU TITRE OUVERT.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE FICHE POUR LES DEUX SUPPORTS — ET C'EST VOULU.                 │
 * │                                                                          │
 * │ Les champs, les prix, les manques et la publication sont identiques :    │
 * │ le support est une étiquette de rangement, il n'ouvre et ne ferme aucun  │
 * │ droit. Dupliquer cet écran aurait fait deux formulaires à tenir à jour,  │
 * │ et c'est toujours la copie oubliée qui reste en production.               │
 * │                                                                          │
 * │ Ce qui gênait n'était donc pas la fiche : c'étaient ses MOTS. Un livret  │
 * │ pédagogique s'ouvrait sous « Champs du conte », et « Retour aux contes »   │
 * │ ramenait dans un rayon qui n'était pas le sien. La table ci-dessous est  │
 * │ la seule différence entre les deux lectures de cet écran.                 │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * `satisfies` et non une annotation : le type reste littéral, si bien qu'un
 * support ajouté à l'énumération `document_type` sans son jeu de mots ne
 * compile pas.
 */
const MOTS = {
  conte: {
    rayon: '/contes',
    retourListe: 'admin.conteRetourListe',
    editionSousTitre: 'admin.conteEditionSousTitre',
    champsTitre: 'admin.conteChampsTitre',
    accesTitre: 'admin.conteAccesTitre',
    champsIndependants: 'admin.conteChampsIndependants',
    publicationBloquee: 'admin.contePublicationBloquee',
    publicationPrete: 'admin.contePublicationPrete',
    traductionsAide: 'admin.conteTraductionsAide',
    versionAjoutAide: 'admin.conteVersionAjoutAide',
    suppressionTitre: 'admin.conteSuppressionTitre',
    suppressionAide: 'admin.conteSuppressionAide',
    supprimer: 'admin.conteSupprimer',
  },
  livret_pedagogique: {
    rayon: '/livrets',
    retourListe: 'admin.livretRetourListe',
    editionSousTitre: 'admin.livretEditionSousTitre',
    champsTitre: 'admin.livretChampsTitre',
    accesTitre: 'admin.livretAccesTitre',
    champsIndependants: 'admin.livretChampsIndependants',
    publicationBloquee: 'admin.livretPublicationBloquee',
    publicationPrete: 'admin.livretPublicationPrete',
    traductionsAide: 'admin.livretTraductionsAide',
    versionAjoutAide: 'admin.livretVersionAjoutAide',
    suppressionTitre: 'admin.livretSuppressionTitre',
    suppressionAide: 'admin.livretSuppressionAide',
    supprimer: 'admin.livretSupprimer',
  },
} as const satisfies Record<
  TypeDocument,
  { rayon: SectionAdmin } & Record<string, CleTraduction | SectionAdmin>
>;

export async function FicheLivre({
  langue,
  administrateur,
  id,
  requete,
}: {
  /** DEJA validee — et deja passee par la garde, dans la page appelante. */
  langue: LangueInterface;
  /** Qui est connecte — traverse jusqu'au pied du rail, jamais relu ici. */
  administrateur: Appelant;
  /** L'identifiant brut de l'adresse : il n'est pas encore prouve valide. */
  id: string;
  /** Les parametres d'URL, deja resolus par la page. */
  requete: Record<string, string | string[] | undefined>;
}) {
  if (!UUID.test(id)) notFound();

  const resultat = await lireLivre(id).catch(() => null);
  if (resultat && !resultat.ok && resultat.raison === 'introuvable') notFound();
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const conte = resultat.donnees as unknown as Conte;

  /*
   * La couverture, depuis la migration 0087.
   *
   * `urlsCouverture` rend `null` sur un jeton absent — un titre en cours
   * d'ingestion, ou dont la chaîne n'a pas produit d'image. L'écran montre
   * alors le motif, jamais une image cassée.
   *
   * La teinte suit le PREMIER THÈME du titre, comme partout ailleurs dans le
   * produit depuis la migration 0071. `teinteDepuisThemes` rend `null` quand
   * il n'y en a pas, et `Motif` traduit ce `null` en teinte neutre : on ne
   * force donc aucune valeur ici, sous peine d'inventer une couleur que le
   * catalogue public n'afficherait pas pour le même titre.
   */
  const couverture = urlsCouverture(conte.couverture_jeton);
  const teinte = teinteDepuisThemes(conte.themes);

  const erreur = premier(requete['erreur']);
  const enregistre = premier(requete['enregistre']);
  const depose = premier(requete['depose']);

  const prix = Object.entries(conte.prix ?? {});

  /*
   * Le support est lu sur le titre OUVERT, jamais sur l'adresse par laquelle on
   * est arrivé : la fiche est la même des deux rayons, et changer le support
   * dans le formulaire ci-dessous change ces mots au rechargement suivant.
   */
  const mots = MOTS[conte.type_document];
  const liste = `/${langue}/admin${mots.rayon}`;

  return (
    <GabaritAdmin
      langue={langue}
      administrateur={administrateur}
      section={mots.rayon}
      titre={conte.slug}
      /*
        La fiche porte son titre dans sa CARTE D'IDENTITÉ, plus bas : le
        gabarit garde le titre pour le fil d'Ariane et ne rend pas son propre
        bandeau, qui aurait fait deux `h1` sur la page.
      */
      enteteIntegree
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

      {/* ── Retour, puis la carte d'identité ──────────────────────────────
        Le lien quitte la BARRE SUPÉRIEURE pour revenir dans la colonne : sur
        une fiche, la barre ne porte aucune action principale, et un « retour »
        collé en haut à droite se lit comme la commande la plus importante de
        l'écran — ce qu'il n'est pas.
      */}
      <a className={styles.retourFiche} href={liste}>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        {traduire(langue, mots.retourListe)}
      </a>

      <div className={`${styles.carte} ${styles.ficheEntete}`}>
        <div className={styles.ficheCouvertureBloc}>
          {/*
            LA VRAIE COUVERTURE DEPUIS LA MIGRATION 0087.

            Cet emplacement a longtemps été un rectangle pointillé : la donnée
            existait — le jeton en base, les trois tailles dans le bucket
            public — mais `admin_lire_livre` ne transportait pas la colonne.
            L'écran ne pouvait donc rien afficher, et le CSS l'expliquait.

            `alt` est VIDE : le titre est dans la carte d'identité, à droite.
            Décrire l'image ferait entendre deux fois la même chose.
          */}
          {couverture ? (
            <Couverture
              langue={langue}
              url={couverture.fiche}
              largeur={148}
              hauteur={206}
              tailles="148px"
              teinte={teinte}
              alt=""
              classeImage={styles.ficheCouvertureImage}
            />
          ) : (
            <SubstitutCouverture langue={langue} teinte={teinte} />
          )}
          <p className={styles.ficheCouvertureLegende}>
            {traduire(langue, 'admin.ficheCouverture')}
          </p>
        </div>

        <div className={styles.ficheIdentite}>
          <div className={styles.ficheTitreLigne}>
            {/*
              LE `h1` DE CET ÉCRAN EST ICI, ET NON DANS LE GABARIT.

              La fiche porte son titre DANS sa carte d'identité, à côté de la
              couverture — c'est ce qui fait de ce bloc une identité plutôt
              qu'un en-tête. Le gabarit reçoit donc `enteteIntegree` : il garde
              le titre pour le fil d'Ariane et ne rend pas son propre bandeau,
              qui aurait fait deux `h1` sur la page.
            */}
            <h1 className={styles.ficheTitre}>{conte.slug}</h1>
            <span
              className={`${styles.etat} ${
                conte.statut === 'publie'
                  ? styles.etatPublie
                  : conte.statut === 'archive'
                    ? styles.etatBrouillon
                    : styles.etatAlerte
              }`}
            >
              {traduire(langue, `admin.statut_${conte.statut}` as CleTraduction)}
            </span>
          </div>

          <p className={styles.ficheSousTitre}>{traduire(langue, mots.editionSousTitre)}</p>

          {/*
            Trois repères, et ce sont ceux qu'on cherche en arrivant : de qui
            est ce titre, de quelle nature, et d'où vient sa couverture. Une
            liste de définitions, parce que c'est exactement ce que c'est.
          */}
          <dl className={styles.ficheReperes}>
            <div>
              <dt className={styles.ficheRepereIntitule}>
                {traduire(langue, 'admin.colAuteur')}
              </dt>
              <dd className={styles.ficheRepereValeur}>{conte.auteur}</dd>
            </div>
            <div>
              <dt className={styles.ficheRepereIntitule}>
                {traduire(langue, 'admin.colSupport')}
              </dt>
              <dd className={styles.ficheRepereValeur}>
                {traduire(langue, `documents.${conte.type_document}` as CleTraduction)} ·{' '}
                {traduire(langue, `orientations.${conte.orientation}` as CleTraduction)}
              </dd>
            </div>
            <div>
              <dt className={styles.ficheRepereIntitule}>
                {traduire(langue, 'admin.ficheCouverture')}
              </dt>
              <dd className={styles.ficheRepereValeur}>
                {traduire(langue, 'admin.ficheCouvertureSource')}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className={styles.ficheColonnes}>
        {/* ── Ce qui se SAISIT ─────────────────────────────────────── */}
        <div className={styles.ficheColonnePrincipale}>
          {/* ── Champs métier ────────────────────────────────────────────────── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitre}>{traduire(langue, mots.champsTitre)}</h2>

            <div className={styles.cadre}>
              <form className={styles.formulaire} action={modifierConte.bind(null, langue, conte.id, mots.rayon)}>
                {/* Appariés : deux noms courts qui se lisent ensemble. */}
                <div className={styles.rangee}>
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
                  │ LES THÈMES ONT REMPLACÉ LA RÉGION — 3 septembre 2026.        │
                  │                                                              │
                  │ Ce champ était un `<select>` de cinq régions. La région       │
                  │ rangeait les contes par tradition d'origine ; elle ne disait  │
                  │ rien d'une fiche d'activités, qui n'en a pas, et depuis que   │
                  │ le catalogue porte deux supports elle en cachait la moitié    │
                  │ derrière un filtre incapable de les décrire.                  │
                  │                                                              │
                  │ La colonne `region` n'est pas effacée pour autant : elle est  │
                  │ seulement retirée de l'écran et du catalogue public, et       │
                  │ `modifierLivre` envoie `p_region: null`, qui vaut « ne touche │
                  │ pas ». Les données déjà saisies sont donc PRÉSERVÉES.         │
                  │                                                              │
                  │ Le thème n'est PAS l'origine culturelle, juste au-dessus :    │
                  │ celle-ci dit d'où vient l'histoire (« conte akan — Ghana »),  │
                  │ celui-là de quoi elle parle (« ruse », « amitié »). Les deux  │
                  │ sont libres, mais seuls les thèmes filtrent le catalogue.     │
                  │                                                              │
                  │ Une SEULE ligne, séparée par des virgules, et non des cases : │
                  │ les thèmes ne sont pas une énumération, et une liste fermée   │
                  │ aurait à être rouverte à chaque idée éditoriale. Les          │
                  │ pastilles du catalogue viennent des facettes, c'est-à-dire de │
                  │ ce que le catalogue porte vraiment.                           │
                  │                                                              │
                  │ Contrairement aux autres champs métier, le VIDE efface ici :  │
                  │ c'est la seule manière de retirer le dernier thème d'un       │
                  │ titre. Le nettoyage — blancs, doublons, ordre — est fait en   │
                  │ base par `admin_modifier_livre`, à un seul endroit.           │
                  └──────────────────────────────────────────────────────────────┘
                */}
                <div className={styles.champ}>
                  <label className={styles.libelle} htmlFor="conte-themes">
                    {traduire(langue, 'admin.conteThemes')}
                  </label>
                  <input
                    className={styles.saisie}
                    id="conte-themes"
                    name="themes"
                    maxLength={400}
                    defaultValue={conte.themes.join(', ')}
                    aria-describedby="conte-themes-aide"
                  />
                  <p className={styles.aide} id="conte-themes-aide">
                    {traduire(langue, 'admin.conteThemesAide')}
                  </p>
                </div>

                {/*
                  ┌──────────────────────────────────────────────────────────────┐
                  │ LE NIVEAU ET LES OBJECTIFS NE S'AFFICHENT QUE POUR UN        │
                  │ LIVRET.                                                      │
                  │                                                              │
                  │ Un conte n'a ni niveau scolaire ni objectifs pédagogiques :  │
                  │ les deux colonnes y valent `null` et `{}`, et la 0079 le dit  │
                  │ en toutes lettres. Les montrer quand même donnerait deux      │
                  │ champs vides que rien ne remplirait jamais, sur l'écran le    │
                  │ plus chargé du back-office.                                   │
                  │                                                              │
                  │ Ce n'est PAS une règle d'accès : le support ne décide ici    │
                  │ que de ce qu'on affiche. La route et la base acceptent les    │
                  │ deux champs sur n'importe quel titre — c'est voulu, et c'est  │
                  │ ce qui permet à un conte requalifié en livret de garder ce    │
                  │ qu'on lui a saisi.                                            │
                  │                                                              │
                  │ Le niveau efface par le VIDE, comme les thèmes, et pour la    │
                  │ même raison : la colonne est nullable, et `null` veut dire    │
                  │ « ne touche pas » partout dans `admin_modifier_livre`. Sans   │
                  │ cette lecture, un niveau posé une fois serait indéboulonnable.│
                  └──────────────────────────────────────────────────────────────┘
                */}
                {conte.type_document === 'livret_pedagogique' ? (
                  <>
                    <div className={styles.champ}>
                      <label className={styles.libelle} htmlFor="livret-niveau">
                        {traduire(langue, 'admin.livretNiveau')}
                      </label>
                      <input
                        className={styles.saisie}
                        id="livret-niveau"
                        name="niveau"
                        maxLength={120}
                        defaultValue={conte.niveau ?? ''}
                        aria-describedby="livret-niveau-aide"
                      />
                      <p className={styles.aide} id="livret-niveau-aide">
                        {traduire(langue, 'admin.livretNiveauAide')}
                      </p>
                    </div>

                    {/*
                      Une ligne PAR objectif, dans une zone de texte — et non une
                      ligne unique à virgules comme les thèmes. Un objectif est une
                      phrase, et une phrase contient des virgules : « Développer la
                      motricité fine, puis le tracé » aurait donné deux objectifs
                      dont aucun ne veut rien dire.

                      L'ORDRE de saisie est conservé jusqu'en base : ce sont les
                      étapes d'un livret, et les trier alphabétiquement comme on
                      trie les thèmes les mélangerait.
                    */}
                    <div className={styles.champ}>
                      <label className={styles.libelle} htmlFor="livret-objectifs">
                        {traduire(langue, 'admin.livretObjectifs')}
                      </label>
                      <textarea
                        className={styles.saisie}
                        id="livret-objectifs"
                        name="objectifs"
                        rows={4}
                        maxLength={2400}
                        defaultValue={conte.objectifs.join('\n')}
                        aria-describedby="livret-objectifs-aide"
                      />
                      <p className={styles.aide} id="livret-objectifs-aide">
                        {traduire(langue, 'admin.livretObjectifsAide')}
                      </p>
                    </div>
                  </>
                ) : null}

                {/*
                  ┌──────────────────────────────────────────────────────────────┐
                  │ LE SUPPORT ET SON ORIENTATION — LE MÊME DÉFAUT QUE LA RÉGION,│
                  │ MAIS MUET.                                                   │
                  │                                                              │
                  │ La migration 0061 a créé les deux colonnes ; aucune fonction  │
                  │ `admin_*` ne permettait de les poser avant la 0062. La        │
                  │ différence avec `region` tient à leurs valeurs par défaut :   │
                  │ `conte` et `portrait` étant non nulles, « Publier » ne restait │
                  │ pas éteint. Rien ne protestait — un livret déposé serait      │
                  │ simplement resté un conte, en portrait, pour toujours.        │
                  │                                                              │
                  │ Pas de choix vide, contrairement à la région : la colonne     │
                  │ n'admet pas de nul, et proposer « aucun » offrirait un état   │
                  │ que la base refuse.                                          │
                  └──────────────────────────────────────────────────────────────┘
                */}
                <div className={styles.rangee}>
                  <div className={styles.champ}>
                    <label className={styles.libelle} htmlFor="conte-type-document">
                      {traduire(langue, 'admin.conteTypeDocument')}
                    </label>
                    <select
                      className={styles.saisie}
                      id="conte-type-document"
                      name="type_document"
                      defaultValue={conte.type_document}
                      aria-describedby="conte-type-document-aide"
                    >
                      {TYPES_DOCUMENT.map((type) => (
                        <option key={type} value={type}>
                          {traduire(langue, `documents.${type}` as CleTraduction)}
                        </option>
                      ))}
                    </select>
                    <p className={styles.aide} id="conte-type-document-aide">
                      {traduire(langue, 'admin.conteTypeDocumentAide')}
                    </p>
                  </div>

                  <div className={styles.champ}>
                    <label className={styles.libelle} htmlFor="conte-orientation">
                      {traduire(langue, 'admin.conteOrientation')}
                    </label>
                    <select
                      className={styles.saisie}
                      id="conte-orientation"
                      name="orientation"
                      defaultValue={conte.orientation}
                      aria-describedby="conte-orientation-aide"
                    >
                      {ORIENTATIONS.map((orientation) => (
                        <option key={orientation} value={orientation}>
                          {traduire(langue, `orientations.${orientation}` as CleTraduction)}
                        </option>
                      ))}
                    </select>
                    <p className={styles.aide} id="conte-orientation-aide">
                      {traduire(langue, 'admin.conteOrientationAide')}
                    </p>
                  </div>
                </div>

                <div className={`${styles.rangee} ${styles.rangeeSerree}`}>
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
                <h3 className={styles.libelle}>{traduire(langue, mots.accesTitre)}</h3>

                {/*
                  ┌──────────────────────────────────────────────────────────────┐
                  │ LA RANGÉE ENTIÈRE EST LA CIBLE, ET LA CASE RESTE LA VÉRITÉ.  │
                  │                                                              │
                  │ C'est la commande la plus lourde de conséquence du           │
                  │ back-office : « vendu à l'unité » est le SEUL levier qui      │
                  │ ouvre le téléchargement. Elle se présentait comme trois cases │
                  │ nues, indiscernables d'un réglage de confort.                 │
                  │                                                              │
                  │ Le `<label>` enveloppe la case ET le texte : cliquer n'importe │
                  │ où dans la rangée coche, sans un octet de JavaScript. Le      │
                  │ carré dessiné est un REFLET — l'état, le clavier et l'envoi   │
                  │ du formulaire restent portés par la case réelle, masquée en   │
                  │ retrait de scène et jamais retirée de l'arbre.               │
                  └──────────────────────────────────────────────────────────────┘
                */}
                <ul className={styles.leviers}>
                  {LEVIERS.map((levier) => (
                    <li key={levier.champ}>
                      {/* Le témoin de MÊME NOM, posé avant la case. */}
                      <input type="hidden" name={levier.champ} value="non" />

                      <label className={styles.levier}>
                        <input
                          className={styles.levierCaseReelle}
                          id={`conte-${levier.champ}`}
                          name={levier.champ}
                          type="checkbox"
                          value="oui"
                          defaultChecked={conte[levier.champ]}
                          aria-describedby={`conte-${levier.champ}-aide`}
                        />
                        <span className={styles.levierCase} aria-hidden="true">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                        <span>
                          <span className={styles.levierNom}>{traduire(langue, levier.nom)}</span>
                          <span className={styles.levierNote} id={`conte-${levier.champ}-aide`}>
                            {traduire(langue, levier.note)}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>

                <p className={styles.aide}>{traduire(langue, mots.champsIndependants)}</p>

                <BoutonSoumission>
                  {traduire(langue, 'admin.conteEnregistrer')}
                </BoutonSoumission>
              </form>
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
                        action={modifierVersionConte.bind(null, langue, conte.id, mots.rayon, version.id)}
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

                        {/*
                          LA DESCRIPTION LONGUE — migration 0070.

                          Un second champ plutôt qu'un résumé rallongé : le résumé
                          s'affiche dans les cartes du catalogue et dans les
                          métadonnées de référencement, où trois paragraphes
                          seraient illisibles. La description est le texte de la
                          fiche produit, celui qu'on lit avant d'acheter. Les
                          confondre obligerait à choisir entre une carte illisible
                          et une fiche vide.

                          Comme le résumé, elle est TOUJOURS envoyée, vide compris :
                          c'est la seule manière de l'effacer une fois écrite.
                        */}
                        <div className={styles.champ}>
                          <label
                            className={styles.libelle}
                            htmlFor={`version-${version.id}-description`}
                          >
                            {traduire(langue, 'admin.conteVersionDescription')}
                          </label>
                          <textarea
                            className={`${styles.saisie} ${styles.zoneTexte}`}
                            id={`version-${version.id}-description`}
                            name="description"
                            maxLength={8000}
                            rows={8}
                            defaultValue={version.description ?? ''}
                            aria-describedby={`version-${version.id}-description-aide`}
                          />
                          <p className={styles.aide} id={`version-${version.id}-description-aide`}>
                            {traduire(langue, 'admin.conteVersionDescriptionAide')}
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

            <p className={styles.note}>{traduire(langue, mots.traductionsAide)}</p>
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
                action={ajouterVersionConte.bind(null, langue, conte.id, mots.rayon)}
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

                <p className={styles.aide}>{traduire(langue, mots.versionAjoutAide)}</p>

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
                {traduire(langue, mots.suppressionTitre)}
              </h2>

              <div className={styles.zoneDanger}>
                <form
                  className={styles.formulaireNu}
                  action={supprimerConte.bind(null, langue, conte.id, mots.rayon)}
                >
                  <p className={styles.aide}>{traduire(langue, mots.suppressionAide)}</p>

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
                    {traduire(langue, mots.supprimer)}
                  </BoutonSoumission>
                </form>
              </div>
            </section>
          ) : null}

        </div>

        {/*
          ── Ce qui se DÉCIDE ────────────────────────────────────────

          Publication et prix montent dans une barre COLLANTE. Ce sont les
          deux seules décisions de l'écran, et elles se prenaient jusqu'ici
          au tiers d'une page de trois mille huit cents pixels : il fallait
          remonter pour relire ce qui manquait encore à la publication, sur
          la fiche dont c'est précisément la question.
        */}
        <div className={styles.ficheLaterale}>
          {/* ── Publication ──────────────────────────────────────────────────── */}
          <section className={styles.section}>

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
              <p className={styles.ficheKicker}>{traduire(langue, 'admin.contePublicationTitre')}</p>
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
                      <p className={styles.aide}>{traduire(langue, mots.publicationBloquee)}</p>
                    </>
                  ) : (
                    <p className={styles.aide}>{traduire(langue, mots.publicationPrete)}</p>
                  )}
                </div>

                <div className={styles.boutons}>
                  {/*
                    « Publier » est DÉSACTIVÉ tant que la base refuserait, et la
                    liste ci-dessus dit pourquoi. Un bouton actif qui échoue à
                    chaque pression apprend à ne plus lui faire confiance ; un
                    bouton éteint à côté de ce qui l'éteint indique quoi faire.
                  */}
                  <form action={changerPublicationConte.bind(null, langue, conte.id, mots.rayon, 'publie')}>
                    <BoutonSoumission disabled={!conte.publiable || conte.statut === 'publie'}>
                      {traduire(langue, 'admin.contePublier')}
                    </BoutonSoumission>
                  </form>

                  <form action={changerPublicationConte.bind(null, langue, conte.id, mots.rayon, 'brouillon')}>
                    <BoutonSoumission variante="secondaire" disabled={conte.statut === 'brouillon'}>
                      {traduire(langue, 'admin.conteRemettreBrouillon')}
                    </BoutonSoumission>
                  </form>

                  <form action={changerPublicationConte.bind(null, langue, conte.id, mots.rayon, 'archive')}>
                    <BoutonSoumission variante="discret" disabled={conte.statut === 'archive'}>
                      {traduire(langue, 'admin.conteArchiver')}
                    </BoutonSoumission>
                  </form>
                </div>
              </div>
            </div>
          </section>

          {/* ── Prix par zone ────────────────────────────────────────────────── */}
          <section className={styles.section}>

            <div className={styles.cadre}>
              <p className={styles.ficheKicker}>{traduire(langue, 'admin.contePrixTitre')}</p>
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

              <form className={styles.formulaire} action={definirPrixConte.bind(null, langue, conte.id, mots.rayon)}>
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

        </div>
      </div>
      <p className={styles.note}>{traduire(langue, 'admin.chargeParLaBase')}</p>
    </GabaritAdmin>
  );
}
