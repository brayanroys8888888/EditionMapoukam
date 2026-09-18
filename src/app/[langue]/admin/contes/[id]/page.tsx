import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { exigerAdministrateur } from '../../garde';
import { FicheLivre } from '../../fiche-livre';

/**
 * ÉDITION D'UN CONTE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA GARDE EST ICI, EN TOUTES LETTRES.                                    │
 * │                                                                          │
 * │ `exigerAdministrateur` rend un 404 à qui n'est pas administrateur, et    │
 * │ renvoie se connecter qui ne l'est pas encore. Un écran qui l'oublie ne   │
 * │ lève aucune erreur : il rend la page, et son auteur la voit fonctionner  │
 * │ parfaitement — parce qu'il est administrateur. Les routes et les         │
 * │ fonctions SQL refont le contrôle, donc les DONNÉES restent protégées ;   │
 * │ mais l'écran révélerait la structure de l'administration, et c'est       │
 * │ justement ce que le 404 refuse de dire.                                  │
 * │                                                                          │
 * │ Elle n'est donc pas déléguée à `FicheLivre` : `admin-architecture` lit   │
 * │ les `page.tsx` du dossier et exige d'y voir l'appel. Une page qui        │
 * │ réexporterait l'autre passerait sans qu'un lecteur voie qu'elle est      │
 * │ protégée — le test a refusé exactement cela.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le CORPS, lui, est partagé : voir l'encadré de `fiche-livre.tsx`.
 */
interface Parametres {
  params: Promise<{ langue: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.conteEditer'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminConte({ params, searchParams }: Parametres) {
  const { langue: langueBrute, id } = await params;
  const { langue, administrateur } = await exigerAdministrateur(langueBrute);

  return <FicheLivre langue={langue} administrateur={administrateur} id={id} requete={await searchParams} />;
}
