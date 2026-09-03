import { createServiceClient } from '@/lib/supabase/clients';
import type { LangueInterface } from '@/i18n';
import { logger } from '@/lib/logger';

/**
 * LES TÉMOIGNAGES DE LA VITRINE — désormais des DONNÉES, plus de la copie.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QU'ILS ÉTAIENT, ET POURQUOI CELA NE POUVAIT PAS DURER.               │
 * │                                                                          │
 * │ Les trois témoignages de l'accueil vivaient dans `src/i18n/fr.json`, aux │
 * │ clés `v2.avis1` à `v2.avis3`. En changer un demandait une modification   │
 * │ du code, dans deux fichiers, et un déploiement — pour une phrase que     │
 * │ l'éditeur est seul à savoir écrire.                                      │
 * │                                                                          │
 * │ Ils sont maintenant en base, traduits, publiables et ordonnables depuis  │
 * │ l'administration. Les clés `v2.avis*` restent au dictionnaire le temps   │
 * │ que la migration 0073 soit jouée partout ; plus rien ne les lit.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce module ne décide d'aucun droit : les témoignages publiés sont publics,
 * et la fonction `temoignages` ne rend que ceux dont `statut = 'publie'`.
 */

/** Un témoignage prêt à afficher, dans la langue demandée. */
export interface Temoignage {
  id: string;
  auteur: string;
  texte: string;
  /** Rôle affiché sous la signature — « Maman de deux enfants ». */
  role: string | null;
}

/** Ce que la vitrine montre par défaut : trois, comme les maquettes. */
export const NOMBRE_TEMOIGNAGES_VITRINE = 3;

/**
 * Les témoignages publiés, dans l'ordre voulu par l'éditeur.
 *
 * Le repli sur le français est fait EN SQL, par la fonction `temoignages` :
 * un témoignage traduit à moitié s'affiche donc dans la langue qui existe,
 * plutôt que de disparaître de la page anglaise.
 *
 * Ne lève jamais : la vitrine doit s'afficher même si la base tousse, et une
 * section de témoignages absente vaut mieux qu'une page blanche. Le tableau
 * vide fait disparaître la section, ce qui est le comportement voulu.
 */
export async function lireTemoignages(
  langue: LangueInterface,
  limite: number = NOMBRE_TEMOIGNAGES_VITRINE,
): Promise<Temoignage[]> {
  const client = createServiceClient();

  const { data, error } = await client.rpc('temoignages', {
    p_langue: langue,
    p_limite: limite,
  });

  if (error) {
    logger.error('Temoignages illisibles', { detail: error.message });
    return [];
  }

  return (data ?? []).map((ligne) => ({
    id: ligne.id,
    auteur: ligne.auteur,
    texte: ligne.texte,
    role: ligne.role,
  }));
}
