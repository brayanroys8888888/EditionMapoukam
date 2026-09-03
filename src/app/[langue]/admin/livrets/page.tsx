import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { stylesAdmin as styles } from '@/components/admin';
import { exigerAdministrateur } from '../garde';
import { ListeLivres } from '../liste-livres';

/**
 * L'ONGLET DES LIVRETS PÉDAGOGIQUES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UN ONGLET, ALORS QU'UN FILTRE EXISTAIT DÉJÀ.                    │
 * │                                                                          │
 * │ Un filtre se perd : il se réinitialise à chaque retour sur l'écran, il    │
 * │ ne se met pas en favori, et rien dans le rail ne dit qu'il existe. Or    │
 * │ l'accès d'un livret se règle titre par titre depuis le 2 septembre 2026  │
 * │ (cahier des charges §3.5), et cette liste est le seul chemin vers la     │
 * │ fiche qui porte les trois leviers.                                      │
 * │                                                                          │
 * │ L'onglet donne aux livrets une adresse stable, un titre qui les nomme,   │
 * │ et des libellés qui parlent d'eux — « Aucun conte pour ce filtre » sur   │
 * │ un écran de livrets était le symptôme visible du manque.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE N'EST PAS UN SECOND CATALOGUE.                                        │
 * │                                                                          │
 * │ Même tableau, même service, même fonction de manques, même fiche         │
 * │ d'édition. Le support est une étiquette de rangement : il n'ouvre et ne  │
 * │ ferme aucun droit, et `access_for_books` ne lit jamais `type_document`.  │
 * │ Cet écran range ; il ne décide de rien.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.livrets'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminLivrets({ params, searchParams }: Parametres) {
  const langue = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;

  return (
    <ListeLivres
      langue={langue}
      requete={requete}
      section="/livrets"
      base={`/${langue}/admin/livrets`}
      typeImpose="livret_pedagogique"
      cles={{
        titre: 'admin.livrets',
        sousTitre: 'admin.livretsSousTitre',
        vide: 'admin.aucunLivret',
        supprime: 'admin.livretSupprime',
      }}
      actions={
        <a className={styles.boutonPrimaire} href={`/${langue}/admin/livrets/nouveau`}>
          {traduire(langue, 'admin.livretNouveau')}
        </a>
      }
    />
  );
}
