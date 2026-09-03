import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { enregistrerTemoignage, listerTemoignages } from '@/lib/admin/service';
import { created, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * LES TÉMOIGNAGES DU SITE — migration 0073.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN TÉMOIGNAGE N'EST PAS UN AVIS, ET C'EST TOUTE LA DIFFÉRENCE.          │
 * │                                                                          │
 * │ Un avis (`book_reviews`) parle d'UN TITRE, il est écrit par un lecteur    │
 * │ depuis son compte, et il passe par une file de modération parce qu'il     │
 * │ vient de quelqu'un d'autre.                                              │
 * │                                                                          │
 * │ Un témoignage parle du SITE, il est saisi par l'éditeur, et ce sont les   │
 * │ trois citations de la page d'accueil. Aucune modération : on ne modère    │
 * │ pas son propre texte. Le seul contrôle est celui de la publication —      │
 * │ la base refuse un témoignage sans texte français, faute de quoi           │
 * │ l'accueil afficherait une signature sous un guillemet vide.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES TEXTES ÉTAIENT EN DUR DANS `src/i18n/fr.json`.                      │
 * │                                                                          │
 * │ Les changer demandait un déploiement, et rien ne les distinguait d'un     │
 * │ libellé de bouton. La migration 0073 les a repris mot pour mot : ce ne    │
 * │ sont pas des données de démonstration, c'est le contenu de la page        │
 * │ d'accueil, et l'effacer effacerait la page.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const resultat = await listerTemoignages();
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ temoignages: resultat.donnees });
}

/**
 * Le corps accepté par la création ET par la mise à jour.
 *
 * Les versions arrivent en BLOC, et la règle qui s'y applique vit dans
 * `admin_enregistrer_temoignage` : une langue absente du tableau est laissée
 * intacte, une langue présente avec un texte vide est supprimée. La rejouer ici
 * en ferait une seconde implémentation, à tenir d'accord pour rien.
 */
export const temoignageSchema = z.object({
  auteur: z.string().trim().min(1).max(120),
  // L'ordre est un rang d'affichage, pas une clé : deux témoignages peuvent
  // partager le même, et `cree_le` les départage alors.
  ordre: z.int().min(0).max(999).default(0),
  versions: z
    .array(
      z.object({
        langue: z.enum(['fr', 'en']),
        // Le texte VIDE est significatif : il supprime la version. Le schéma
        // ne l'interdit donc pas, contrairement au texte d'un avis.
        texte: z.string().trim().max(600),
        role: z.string().trim().max(120).nullable().default(null),
      }),
    )
    .max(2)
    .default([]),
});

export async function POST(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, temoignageSchema);
  if (!corps.ok) return corps.response;

  /*
   * Aucun champ « publié » : un témoignage NAÎT EN BROUILLON, comme un titre du
   * catalogue et comme un contenu associatif. La publication est un second
   * geste, refusé tant que le texte français manque — or il vient à peine
   * d'être créé, et peut n'avoir aucune version.
   */
  const resultat = await enregistrerTemoignage(garde.acteur.id, {
    auteur: corps.data.auteur,
    ordre: corps.data.ordre,
    versions: corps.data.versions,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return created(resultat.donnees);
}
