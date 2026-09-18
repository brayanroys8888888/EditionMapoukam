import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';
import { ListeLivres } from '../liste-livres';

/**
 * LE CATALOGUE ENTIER, VU DE L'ADMINISTRATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN MONTRE LES DEUX SUPPORTS, ET L'ONGLET DES LIVRETS N'EN MONTRE │
 * │ QU'UN. CE N'EST PAS UNE INCOHÉRENCE.                                     │
 * │                                                                          │
 * │ Le catalogue public suit exactement la même forme : `/catalogue` porte    │
 * │ tout, `/contes` et `/livrets` sont des rayons. Ici, cet écran est le      │
 * │ catalogue — d'où son filtre de support — et `/admin/livrets` est le       │
 * │ rayon, qui n'a pas besoin d'un filtre puisque son support est dans son    │
 * │ adresse.                                                                 │
 * │                                                                          │
 * │ Tout le tableau vit dans `ListeLivres` : recopié, il aurait divergé au    │
 * │ premier champ ajouté.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.contes'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminContes({ params, searchParams }: Parametres) {
  const { langue, administrateur } = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;
  const base = `/${langue}/admin/contes`;

  return (
    <ListeLivres
      langue={langue}
      administrateur={administrateur}
      requete={requete}
      section="/contes"
      base={base}
      // Aucun support imposé : c'est l'écran du catalogue entier.
      typeImpose={null}
      cles={{
        titre: 'admin.contes',
        sousTitre: 'admin.contesSousTitre',
        vide: 'admin.aucunConte',
        supprime: 'admin.conteSupprime',
        colonneTitre: 'admin.colConte',
        decompteUn: 'admin.decompteTitreUn',
        decompte: 'admin.decompteTitres',
      }}
      /*
        L'action PRINCIPALE monte dans la barre supérieure, qui est collante :
        sur un catalogue de dix-huit titres, « Ajouter un conte » n'était
        atteignable qu'en remontant tout le tableau.
      */
      actions={
        <a className={styles.boutonPrimaire} href={`${base}/nouveau`}>
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
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {traduire(langue, 'admin.conteNouveau')}
        </a>
      }
      /*
        Deux portes vers la MÊME chaîne d'ingestion. Le type de document n'est
        pas une case à cocher qu'on oublie : il se choisit en entrant. La
        seconde porte reste à côté du titre, en lien de traverse — deux boutons
        primaires côte à côte ne désignent plus d'action principale.
      */
      enteteActions={
        <a className={styles.boutonDiscret} href={`/${langue}/admin/livrets/nouveau`}>
          {traduire(langue, 'admin.livretNouveau')}
        </a>
      }
    />
  );
}
