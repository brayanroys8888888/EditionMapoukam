import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { created, errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { createUserClient } from '@/lib/supabase/clients';
import { urlsCouverture } from '@/lib/storage/covers';
import { logger } from '@/lib/logger';

/**
 * Favoris — §4.2 F7, « titres mis de côté ».
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA SEULE ROUTE DU PROJET QUI PASSE PAR LE CLIENT DE L'UTILISATEUR, ET   │
 * │ NON PAR LA CLÉ DE SERVICE.                                              │
 * │                                                                          │
 * │ `favorites` porte une politique RLS propriétaire depuis la migration     │
 * │ 0012 : `user_id = auth.uid()`, en lecture comme en écriture. En          │
 * │ l'interrogeant avec le jeton de l'appelant, l'isolation est appliquée    │
 * │ PAR LA BASE — pas par un `where` que ce fichier pourrait oublier.        │
 * │                                                                          │
 * │ C'est l'inverse du service des pages (§2.6), écart assumé faute de       │
 * │ politique praticable. Ici la politique existe : s'en priver serait       │
 * │ choisir la garantie la plus faible alors que la plus forte est offerte.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const ajoutSchema = z.object({
  book_id: z.uuid(),
});

interface LigneFavori {
  book_id: string;
  ajoute_le: string;
  books: {
    slug: string;
    region: string | null;
    couverture_jeton: string | null;
    statut: string;
  } | null;
}

export async function GET(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const client = createUserClient(garde.appelant.accessToken);
  const { data, error } = await client
    .from('favorites')
    .select('book_id, ajoute_le, books(slug, region, couverture_jeton, statut)')
    .order('ajoute_le', { ascending: false })
    .limit(200);

  if (error) {
    logger.error('Favoris illisibles', { detail: error.message });
    return errors.interne(error.message);
  }

  const lignes = (data ?? []) as unknown as LigneFavori[];

  return ok({
    favoris: lignes
      // Un titre archivé reste en base — le retirer effacerait un choix de
      // l'utilisateur — mais il ne s'affiche plus : la fiche répondrait 404.
      .filter((l) => l.books?.statut === 'publie')
      .map((l) => ({
        livre_id: l.book_id,
        slug: l.books?.slug ?? null,
        region: l.books?.region ?? null,
        couverture: urlsCouverture(l.books?.couverture_jeton ?? null),
        ajoute_le: l.ajoute_le,
      })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, ajoutSchema);
  if (!corps.ok) return corps.response;

  const client = createUserClient(garde.appelant.accessToken);

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ L'EXISTENCE EST VÉRIFIÉE, PLUTÔT QUE DÉDUITE D'UN CODE D'ERREUR.     │
  // │                                                                      │
  // │ Un livre inconnu viole la clé étrangère, et il serait tentant de     │
  // │ traduire ce code en 404. Mais ce code vient du PILOTE, à travers      │
  // │ PostgREST : il n'est garanti par rien, et une montée de version le    │
  // │ changerait sans bruit. Le refus deviendrait alors un 500, et un       │
  // │ appelant légitime lirait « panne » là où il a simplement fait une     │
  // │ faute de frappe.                                                     │
  // │                                                                      │
  // │ Un aller-retour de plus sur une route peu appelée coûte moins qu'un   │
  // │ code de réponse qui dépend d'une dépendance.                          │
  // └──────────────────────────────────────────────────────────────────────┘
  const livre = await client
    .from('books')
    .select('id')
    .eq('id', corps.data.book_id)
    .eq('statut', 'publie')
    .maybeSingle();

  if (!livre.data) return errors.introuvable();

  // `user_id` vient de la session, jamais du corps. La politique RLS le
  // vérifierait de toute façon — et c'est bien pour cela qu'on la laisse
  // faire : deux gardes valent mieux qu'une, et celle de la base survit à
  // une réécriture de ce fichier.
  const { error } = await client
    .from('favorites')
    .upsert(
      { user_id: garde.appelant.id, book_id: corps.data.book_id },
      { onConflict: 'user_id,book_id', ignoreDuplicates: true },
    );

  if (error) {
    logger.error('Ajout aux favoris impossible', { detail: error.message });
    return errors.interne(error.message);
  }

  // Idempotent : mettre deux fois de côté le même titre n'est pas une erreur,
  // c'est un double-clic.
  return created({ ajoute: true });
}
