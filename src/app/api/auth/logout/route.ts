import { createServiceClient } from '@/lib/supabase/clients';
import { noContent } from '@/lib/http/responses';
import { cookiesEffaces } from '@/lib/auth/cookies';
import { extraireJeton, identifierAppelant } from '@/lib/auth/session';
import { revoquerFamilles } from '@/lib/auth/refresh';
import { logger } from '@/lib/logger';

/**
 * Déconnexion — §4.2 F5.
 *
 * Répond 204 même sans jeton valide : une déconnexion doit toujours aboutir.
 * Renvoyer 401 à qui cherche à partir n'aurait aucun sens et laisserait le
 * navigateur avec ses cookies.
 *
 * La révocation passe par l'API d'administration, et non par un client porteur
 * du jeton : `signOut()` de supabase-js s'appuie sur une session interne, qu'un
 * client construit à partir du seul en-tête d'autorisation ne possède pas — il
 * effacerait alors une session locale inexistante et le jeton resterait
 * valide. Vérifié : avec `admin.signOut`, le jeton est refusé dès l'appel
 * suivant ; sans lui, il reste accepté.
 *
 * La portée `global` invalide toutes les sessions du compte. C'est le
 * comportement attendu d'un « me déconnecter » lorsqu'on soupçonne un vol de
 * jeton, et le seul qui rende la révocation réellement utile.
 */
export async function POST(request: Request): Promise<Response> {
  const jeton = extraireJeton(request);

  if (jeton) {
    // L'appelant est identifié AVANT la révocation : après, son jeton ne vaut
    // plus rien et on ne saurait plus quelles lignées fermer.
    const appelant = await identifierAppelant(request);

    const { error } = await createServiceClient().auth.admin.signOut(jeton, 'global');
    if (error) {
      // Un jeton déjà expiré ou inconnu n'est pas une anomalie : on trace sans
      // faire échouer la déconnexion.
      logger.info('Révocation sans effet', { detail: error.message });
    }

    // Les jetons de RAFRAÎCHISSEMENT survivraient à `signOut` du côté de notre
    // table : une lignée laissée ouverte ferait accepter, demain, un jeton
    // qu'une déconnexion était censée annuler.
    if (appelant) {
      await revoquerFamilles(appelant.id, 'deconnexion');
    }
  }

  return noContent({ cookies: cookiesEffaces() });
}
