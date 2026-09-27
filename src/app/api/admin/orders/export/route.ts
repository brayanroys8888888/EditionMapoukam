import { z } from 'zod';

import { gardeAdmin } from '@/lib/admin/route-helpers';
import { listerCommandes } from '@/lib/admin/service';
import { errors } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ L'EXPORT CSV DES COMMANDES — SUR LA LISTE FILTRÉE.                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL EXPORTE CE QUI EST À L'ÉCRAN, PAS TOUTE LA BASE.                     │
 * │                                                                          │
 * │ Les mêmes filtres que la liste, transmis tels quels. Un export qui       │
 * │ rendrait tout quelles que soient les cases cochées serait une surprise   │
 * │ désagréable : on croit tirer douze lignes, on en tire douze mille, et    │
 * │ on l'envoie à son comptable.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL NE RÉ-IDENTIFIE PAS UN ACHETEUR ANONYMISÉ.                           │
 * │                                                                          │
 * │ Rien à faire de particulier, et c'est voulu : `admin_lister_commandes`   │
 * │ a déjà tu le nom et l'adresse d'un compte effacé. Cette route n'a donc   │
 * │ aucune règle de confidentialité À ELLE — elle écrit ce que la fonction   │
 * │ lui donne. Une règle réécrite ici aurait fini par diverger de celle de   │
 * │ l'écran, et c'est toujours la copie qui a l'air d'avoir raison.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES MONTANTS SORTENT EN ENTIERS, AVEC LEUR DEVISE À CÔTÉ.               │
 * │                                                                          │
 * │ Pas de séparateur décimal, pas de symbole : un CSV se relit dans un      │
 * │ tableur qui décide lui-même de la virgule, et « 4 500 FCFA » y devient   │
 * │ du texte inutilisable. La colonne `devise` dit ce que l'entier compte —  │
 * │ des centimes d'euro ou des francs, le franc CFA n'ayant pas de           │
 * │ sous-unité.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const filtresSchema = z.object({
  statut: z.enum(['en_attente', 'paye', 'echoue', 'rembourse']).optional(),
  devise: z.string().trim().length(3).optional(),
  q: z.string().trim().max(120).optional(),
});

/** Une ligne, telle que `admin_lister_commandes` la rend. */
interface LigneCommande {
  numero: number;
  cree_le: string;
  nom: string | null;
  email: string | null;
  premier_titre: string | null;
  nb_lignes: number;
  moyen_paiement: string | null;
  montant_total: number;
  devise: string;
  statut: string;
}

const COLONNES = [
  'numero',
  'date',
  'client',
  'email',
  'premier_titre',
  'nb_lignes',
  'moyen_paiement',
  'montant',
  'devise',
  'statut',
] as const;

/**
 * Une cellule CSV, échappée selon RFC 4180.
 *
 * Le guillemet double est la seule échappe du format, et il faut entourer dès
 * qu'une cellule contient un séparateur, un guillemet ou un saut de ligne. Un
 * titre de conte porte des apostrophes et parfois des virgules — « La poule
 * qui pondait des œufs d'or » — et une cellule non entourée décalerait toutes
 * les colonnes suivantes de cette ligne-là, sans rien casser ailleurs.
 *
 * EXPORTÉE pour son test, et pour rien d'autre : la règle tient en quatre
 * lignes, mais elle est de celles dont on ne voit l'erreur qu'en ouvrant le
 * fichier produit — et personne n'ouvre un export pour le relire.
 */
export function cellule(valeur: string | number | null | undefined): string {
  if (valeur === null || valeur === undefined) return '';
  const texte = String(valeur);
  return /[",\r\n]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, filtresSchema);
  if (!query.ok) return query.response;

  /*
   * Un plafond, et il est assumé : `taille_page_admin` ramène toute demande
   * démesurée à cent. L'export tire donc au plus cent lignes — au-delà, ce
   * n'est plus un export d'écran mais une extraction comptable, et celle-là
   * passera par une pagination explicite le jour où elle sera demandée.
   */
  const resultat = await listerCommandes({
    statut: query.data.statut ?? null,
    devise: query.data.devise ?? null,
    recherche: query.data.q ?? null,
    page: 1,
    taille: 100,
  }).catch(() => null);

  if (!resultat?.ok) return errors.interne('Export indisponible.');

  const lignes = resultat.donnees as unknown as LigneCommande[];

  const corps = [
    COLONNES.join(','),
    ...lignes.map((ligne) =>
      [
        `EM-${String(ligne.numero)}`,
        ligne.cree_le,
        ligne.nom,
        ligne.email,
        ligne.premier_titre,
        ligne.nb_lignes,
        ligne.moyen_paiement,
        ligne.montant_total,
        ligne.devise,
        ligne.statut,
      ]
        .map(cellule)
        .join(','),
    ),
  ].join('\r\n');

  /*
   * La marque d'ordre des octets, pour Excel.
   *
   * Sans elle, Excel lit un CSV en codage local et rend « Nadège » en
   * « NadÃ¨ge ». Les autres tableurs la tolèrent et l'ignorent. C'est trois
   * octets contre un fichier illisible pour la moitié de ceux qui l'ouvriront.
   */
  return new Response(`\uFEFF${corps}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="commandes.csv"',
      // Un export porte des données nominatives : aucun cache, nulle part.
      'cache-control': 'no-store',
    },
  });
}
