import type { Metadata } from 'next';

import { langueValide, messageErreur, traduire, type CleTraduction } from '@/i18n';
import {
  lireContenuAssociation,
  listerEvenementsAssociation,
  prochainsJeudis,
} from '@/lib/admin/service';
import { GabaritAdmin, stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../../garde';
import { enregistrerRedaction } from '../actions';
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
};

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

  const version = contenu?.versions?.find((v) => v.langue === 'fr') ?? null;

  const publication: PublicationEditable =
    contenu === null
      ? VIDE
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
          corps: Array.isArray(version?.corps) ? (version.corps as Bloc[]) : [],
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
        publication={publication}
        evenements={evenements}
        jeudis={jeudis}
        action={enregistrerRedaction.bind(null, langue)}
      />
    </GabaritAdmin>
  );
}
