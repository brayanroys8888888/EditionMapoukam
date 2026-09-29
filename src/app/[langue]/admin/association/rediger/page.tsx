import type { Metadata } from 'next';

import {
  LANGUES_INTERFACE,
  langueValide,
  messageErreur,
  traduire,
  type CleTraduction,
  type LangueInterface,
} from '@/i18n';
import {
  lireContenuAssociation,
  listerEvenementsAssociation,
  prochainsJeudis,
} from '@/lib/admin/service';
import { CATEGORIES_ASSOCIATION } from '@/lib/association/service';
import { estCheminAssociatif, mediaAssociatif } from '@/lib/storage/association';
import { GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../../garde';
import { enregistrerRedaction } from '../actions';
import { estTypePublication } from '../types-publication';
import {
  EditeurPublication,
  type Bloc,
  type PublicationEditable,
} from './editeur-publication';

/**
 * RÉDIGER UNE PUBLICATION — l'écran `daveEdit`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PAGE LIT, LE COMPOSANT CLIENT ÉDITE, LE SERVEUR ÉCRIT.               │
 * │                                                                          │
 * │ Cette page est un composant SERVEUR : elle résout la garde, charge le    │
 * │ contenu, les ateliers et les quatre jeudis, puis passe le tout à un      │
 * │ composant client qui n'a plus qu'à tenir l'état de la saisie.            │
 * │                                                                          │
 * │ La Server Action lui est passée en propriété. C'est ce qui permet à un   │
 * │ écran interactif de rendre la main à une écriture serveur sans route     │
 * │ intermédiaire ni appel depuis le navigateur — et donc sans qu'une clé    │
 * │ quelconque descende dans la page.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

/** Le détail rendu par `admin_lire_contenu_association`, tel qu'on le relit. */
interface DetailContenu {
  id: string;
  slug: string;
  categorie: string;
  acces: 'libre' | 'abonnes';
  statut: string;
  type_publication?: string;
  image_url: string | null;
  vedette: boolean;
  publics?: string[] | null;
  signe_par?: string | null;
  video_url?: string | null;
  video_minutes?: number | null;
  fichier_pdf?: string | null;
  pdf_pages?: number | null;
  evenement_id?: string | null;
  commentaires_ouverts?: boolean;
  prevenir_adherents?: boolean;
  programme_le?: string | null;
  versions?:
    | {
        langue: string;
        titre: string;
        chapeau: string;
        texte_alternatif?: string;
        corps?: unknown;
      }[]
    | null;
}

const VIDE: PublicationEditable = {
  id: null,
  slug: '',
  type: 'recit_terrain',
  categorie: 'actions',
  acces: 'abonnes',
  titre: '',
  chapeau: '',
  texteAlternatif: '',
  imageUrl: '',
  corps: [],
  publics: [],
  signePar: '',
  videoUrl: '',
  videoMinutes: '',
  fichierPdf: '',
  pdfPages: '',
  evenementId: '',
  vedette: false,
  commentairesOuverts: true,
  prevenirAdherents: false,
  programmeLe: '',
  publie: false,
  apercus: {},
};

/**
 * LES ADRESSES D'APERÇU DES MÉDIAS DÉJÀ ENREGISTRÉS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIGNÉ ICI, PARCE QU'ICI SEULEMENT ON LE PEUT.                           │
 * │                                                                          │
 * │ L'éditeur est un composant CLIENT : il ne peut ni signer ni connaître le │
 * │ nom d'un bucket. Sans cette table, rouvrir une publication montrerait    │
 * │ ses propres fichiers comme cassés — le champ porte un chemin de          │
 * │ stockage, qu'un navigateur prend pour une adresse relative.              │
 * │                                                                          │
 * │ Seuls les CHEMINS y entrent : une adresse collée à la main s'affiche     │
 * │ déjà d'elle-même, et la faire passer par ici n'ajouterait qu'une entrée  │
 * │ qui se traduit en elle-même.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
async function apercusDesMedias(valeurs: (string | null | undefined)[]): Promise<
  Record<string, string>
> {
  const chemins = [
    ...new Set(
      valeurs.filter((v): v is string => typeof v === 'string' && estCheminAssociatif(v)),
    ),
  ];

  const paires = await Promise.all(
    chemins.map(async (chemin) => [chemin, await mediaAssociatif(chemin)] as const),
  );

  // Une signature en échec n'entre pas : le champ affichera alors son chemin
  // brut, ce qui est laid mais VRAI — et dit à l'éditeur que le fichier a
  // disparu, au lieu de lui montrer un cadre vide sans explication.
  return Object.fromEntries(
    paires.filter((paire): paire is readonly [string, string] => paire[1] !== null),
  );
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.redTitrePage'),
    robots: { index: false, follow: false },
  };
}

export default async function PageRedaction({ params, searchParams }: Parametres) {
  const { langue, administrateur } = await exigerAdministrateur((await params).langue);
  const t = (cle: CleTraduction): string => traduire(langue, cle);
  const requete = await searchParams;
  const erreur = premier(requete['erreur']);
  const ouvert = premier(requete['contenu']);

  /*
   * LE TYPE PEUT ARRIVER PAR L'ADRESSE — `?type=replay`.
   *
   * C'est ce que sert le choix direct de la barre d'outils : « Nouvelle
   * publication ▾ » ouvre cet écran avec le type déjà posé, plutôt que de le
   * faire choisir une seconde fois sur place. Un type inconnu est ignoré et
   * l'écran retombe sur le défaut : une adresse bricolée ne doit pas produire
   * une publication d'un type que la base refuserait à l'enregistrement.
   *
   * Il ne s'applique QU'À LA CRÉATION. Sur un contenu chargé, le type lu en
   * base gagne : sans cela, un lien laissé dans un historique changerait le
   * type d'une publication existante à la simple ouverture de l'écran.
   */
  const typeDemande = premier(requete['type']);

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ QUELLE VERSION LINGUISTIQUE ON ÉDITE — ET POURQUOI CE N'EST PAS LA     │
   * │ LANGUE DE L'INTERFACE.                                                 │
   * │                                                                        │
   * │ Cet écran lisait la version `fr` EN DUR, et l'action enregistrait sous  │
   * │ la langue de l'interface. Ouvrir `/en/admin/association/rediger` char-  │
   * │ geait donc le texte français et l'écrivait par-dessus l'anglais. Le     │
   * │ défaut ne s'est jamais vu parce que la version anglaise se posait       │
   * │ ailleurs — par le formulaire du bas de l'écran précédent, qui vient de  │
   * │ disparaître.                                                           │
   * │                                                                        │
   * │ La langue éditée est donc explicite, dans l'adresse, et elle n'a rien   │
   * │ à voir avec celle des libellés qu'on lit autour.                        │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const versionDemandee = premier(requete['v']);
  const langueVersion: LangueInterface =
    versionDemandee !== undefined && (LANGUES_INTERFACE as readonly string[]).includes(versionDemandee)
      ? (versionDemandee as LangueInterface)
      : 'fr';

  /*
   * Trois lectures en parallèle, et une seule peut manquer sans conséquence :
   * un contenu neuf n'a pas de détail à charger. Les ateliers et les jeudis
   * servent aux deux cas.
   */
  const [detail, evenementsBruts, jeudisBruts] = await Promise.all([
    ouvert === undefined
      ? Promise.resolve(null)
      : lireContenuAssociation(ouvert).catch(() => null),
    listerEvenementsAssociation().catch(() => null),
    prochainsJeudis(4).catch(() => null),
  ]);

  const contenu = (detail?.ok ? detail.donnees : null) as DetailContenu | null;

  const evenements = ((evenementsBruts?.ok ? evenementsBruts.donnees : []) as {
    id: string;
    titre: string;
  }[]).map((evenement) => ({ id: evenement.id, titre: evenement.titre }));

  const jeudis = ((jeudisBruts?.ok ? jeudisBruts.donnees : []) as {
    jour: string;
    content_id: string | null;
  }[]).map((jeudi) => ({
    jour: String(jeudi.jour).slice(0, 10),
    // « Occupé » veut dire : un AUTRE contenu y est déjà posé. Celui qu'on
    // édite n'occupe pas son propre créneau, sinon l'écran lui reprocherait
    // la date qu'il vient de choisir.
    occupe: jeudi.content_id !== null && jeudi.content_id !== (contenu?.id ?? null),
  }));

  /*
   * La version demandée, ou RIEN. Pas de repli sur le français : charger le
   * texte français dans un formulaire qui enregistrera en anglais produirait
   * une traduction qui n'en est pas une, et personne ne verrait la
   * différence avant de lire le site anglais.
   */
  const version = contenu?.versions?.find((v) => v.langue === langueVersion) ?? null;

  /*
   * Les adresses des versions, CALCULÉES ICI et passées comme des chaînes.
   *
   * Une fonction passée à un composant client ne se sérialise pas : Next la
   * refuse à l'exécution, et rien avant ne le signale. Deux chaînes coûtent
   * moins qu'une fermeture, et elles traversent.
   */
  const liensVersion = Object.fromEntries(
    LANGUES_INTERFACE.map((code) => [
      code,
      `/${langue}/admin/association/rediger?contenu=${contenu?.id ?? ''}&v=${code}`,
    ]),
  ) as Record<LangueInterface, string>;

  const blocs: Bloc[] = Array.isArray(version?.corps) ? (version.corps as Bloc[]) : [];

  const apercus = await apercusDesMedias([
    contenu?.image_url,
    contenu?.video_url,
    contenu?.fichier_pdf,
    ...blocs.map((bloc) => ('url' in bloc ? bloc.url : null)),
  ]);

  const publication: PublicationEditable =
    contenu === null
      ? {
          ...VIDE,
          ...(typeDemande !== undefined && estTypePublication(typeDemande)
            ? { type: typeDemande }
            : {}),
        }
      : {
          ...VIDE,
          id: contenu.id,
          slug: contenu.slug,
          type: (contenu.type_publication ?? 'recit_terrain') as PublicationEditable['type'],
          categorie: contenu.categorie,
          acces: contenu.acces,
          titre: version?.titre ?? '',
          chapeau: version?.chapeau ?? '',
          texteAlternatif: version?.texte_alternatif ?? '',
          imageUrl: contenu.image_url ?? '',
          corps: blocs,
          publics: contenu.publics ?? [],
          signePar: contenu.signe_par ?? '',
          videoUrl: contenu.video_url ?? '',
          videoMinutes: contenu.video_minutes === null ? '' : String(contenu.video_minutes ?? ''),
          fichierPdf: contenu.fichier_pdf ?? '',
          pdfPages: contenu.pdf_pages === null ? '' : String(contenu.pdf_pages ?? ''),
          evenementId: contenu.evenement_id ?? '',
          vedette: contenu.vedette,
          commentairesOuverts: contenu.commentaires_ouverts ?? true,
          prevenirAdherents: contenu.prevenir_adherents ?? false,
          programmeLe: contenu.programme_le ?? '',
          publie: contenu.statut === 'publie',
          apercus,
        };

  return (
    <GabaritAdmin
      langue={langue}
      administrateur={administrateur}
      section="/association"
      titre={t('admin.redTitrePage')}
      sousTitre={t('admin.redSousTitre')}
      actions={
        <a className={styles.boutonDiscret} href={`/${langue}/admin/association`}>
          {t('admin.redRetour')}
        </a>
      }
    >
      {erreur ? (
        <p className={styles.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      <EditeurPublication
        langue={langue}
        langueVersion={langueVersion}
        liensVersion={liensVersion}
        publication={publication}
        categories={CATEGORIES_ASSOCIATION}
        evenements={evenements}
        jeudis={jeudis}
        action={enregistrerRedaction.bind(null, langue)}
      />
    </GabaritAdmin>
  );
}
