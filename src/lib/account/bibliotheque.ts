import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { createServiceClient } from '@/lib/supabase/clients';
import { getAccessForBooks } from '@/lib/access/engine';
import { urlsCouverture } from '@/lib/storage/covers';
import type { ReponseBibliotheque } from '@/domain/api/contract';
import type { RegionConte } from '@/domain/catalog/types';
import { logger } from '@/lib/logger';

/**
 * Ma bibliothèque — §4.2 F7.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX SECTIONS, ET LEUR SÉPARATION EST UNE RÈGLE MÉTIER.                 │
 * │                                                                          │
 * │ « Mes achats » vient de `entitlements` ; « En cours de lecture » vient   │
 * │ de `reading_progress`. Les deux ne coïncident PAS, et c'est voulu : la   │
 * │ progression SURVIT à la perte d'accès, pour qu'un réabonnement reprenne  │
 * │ là où l'enfant s'était arrêté.                                          │
 * │                                                                          │
 * │ Un titre peut donc être en cours de lecture sans être accessible. Les    │
 * │ fondre en une seule liste ferait disparaître ce cas — ou pire,           │
 * │ promettrait une lecture que le moteur de droits refuserait ensuite.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Extrait de `/api/library` pour que la PAGE de l'espace personnel lise la
 * même chose (PLAN-FRONTEND §1.2), la clé de service lui étant interdite.
 */
interface LigneBibliotheque {
  book_id: string;
  slug: string;
  titre: string;
  region: string | null;
  couverture_jeton: string | null;
  langues: string[];
  source: string | null;
  peut_telecharger: boolean;
  accorde_le: string | null;
  expire_le: string | null;
  derniere_page: number | null;
  langue_reprise: string | null;
  derniere_lecture_le: string | null;
}

export async function lireBibliotheque(
  userId: string,
  langue: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<ReponseBibliotheque> {
  const client = options.client ?? createServiceClient();

  const { data, error } = await client.rpc('library_for_user', {
    p_user: userId,
    p_langue: langue,
  });

  if (error) {
    logger.error('Bibliothèque illisible', { detail: error.message });
    throw new Error(error.message);
  }

  const lignes = (data ?? []) as unknown as LigneBibliotheque[];

  // La décision d'accès reste celle du MOTEUR, jamais déduite de la présence
  // d'un droit : un titre acheté puis archivé n'est plus lisible, et seul le
  // moteur le sait. UN appel pour toute la bibliothèque.
  const acces = await getAccessForBooks(
    userId,
    lignes.map((l) => l.book_id),
    { client },
  );

  const entrees = lignes.map((ligne) => ({
    livre_id: ligne.book_id,
    slug: ligne.slug,
    titre: ligne.titre,
    region: ligne.region as RegionConte | null,
    couverture: urlsCouverture(ligne.couverture_jeton),
    langues: ligne.langues,
    acces: acces.get(ligne.book_id) ?? {
      canRead: false,
      canDownload: false,
      reason: 'none' as const,
    },
    possede: ligne.source !== null,
    source: ligne.source as 'achat' | 'offert' | null,
    peut_telecharger: ligne.peut_telecharger,
    expire_le: ligne.expire_le,
    reprise:
      ligne.derniere_page === null
        ? null
        : {
            page: ligne.derniere_page,
            langue: ligne.langue_reprise,
            derniere_lecture_le: ligne.derniere_lecture_le,
          },
  }));

  return {
    achats: entrees.filter((e) => e.possede),
    // Un titre commencé apparaît ici même s'il est aussi possédé : c'est
    // « reprendre ma lecture », pas « ce qui n'est pas à moi ».
    en_cours: entrees.filter((e) => e.reprise !== null),
  };
}
