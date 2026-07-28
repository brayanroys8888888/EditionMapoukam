import { ok } from '@/lib/http/responses';
import { requireUser } from '@/lib/auth/session';

/**
 * Profil de l'appelant.
 *
 * Sert de sonde à la garde `requireUser` et à l'espace utilisateur (§4.2 F6).
 * Ne renvoie que ce que l'utilisateur peut déjà voir sur lui-même.
 */
export async function GET(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const { id, email, role, langue_preferee } = garde.appelant;
  return ok({ utilisateur: { id, email, role, langue_preferee } });
}
