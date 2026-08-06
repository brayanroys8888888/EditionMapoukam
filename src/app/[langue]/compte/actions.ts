'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';

/**
 * ACTIONS DE L'ESPACE PERSONNEL.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI LE TÉLÉCHARGEMENT NE PEUT PAS ÊTRE UN SIMPLE LIEN.             │
 * │                                                                          │
 * │ La bibliothèque pointait un `<a href="/api/downloads/…">` directement     │
 * │ sur la route. Or celle-ci ne rend PAS le fichier : elle rend un objet     │
 * │ JSON portant une URL signée, sa date d'échéance et la référence de        │
 * │ l'exemplaire. Cliquer affichait donc du JSON brut dans le navigateur —    │
 * │ « le téléchargement ne fonctionne pas », et il ne fonctionnait            │
 * │ effectivement pas.                                                       │
 * │                                                                          │
 * │ Ce n'est pas un défaut de la route. Elle a de bonnes raisons de rendre    │
 * │ une URL plutôt qu'un flux : le fichier est FILIGRANÉ au nom de son        │
 * │ acheteur, peut demander plusieurs secondes à produire, et est ensuite     │
 * │ servi par le stockage — pas par l'application. C'est l'INTERFACE qui      │
 * │ manquait, et la voici.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'URL SIGNÉE NE FAIT QU'UN ALLER, ET NE S'ÉCRIT NULLE PART.             │
 * │                                                                          │
 * │ Elle vaut 300 secondes pour du contenu payant, et quiconque l'obtient     │
 * │ obtient le fichier — filigrané au nom de l'acheteur. Elle est donc lue    │
 * │ puis immédiatement suivie par une redirection, sans jamais être écrite    │
 * │ dans une page, un journal ni un paramètre d'URL de ce site.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Formats et langues admis — les mêmes que la route, jamais plus larges. */
const FORMATS = ['pdf', 'epub'] as const;
const LANGUES_CONTENU = ['fr', 'en'] as const;

type Format = (typeof FORMATS)[number];
type LangueContenu = (typeof LANGUES_CONTENU)[number];

function formatValide(valeur: unknown): Format {
  return FORMATS.includes(valeur as Format) ? (valeur as Format) : 'pdf';
}

function langueContenuValide(valeur: unknown): LangueContenu {
  return LANGUES_CONTENU.includes(valeur as LangueContenu) ? (valeur as LangueContenu) : 'fr';
}

/**
 * Télécharge un exemplaire, et mène au fichier.
 *
 * Le droit n'est PAS vérifié ici : il l'est par la route, contre la table
 * `entitlements`, à chaque requête. Une vérification faite dans cette action
 * serait une seconde implémentation de la règle métier centrale — et c'est
 * exactement celle qu'un test d'architecture interdit de recopier côté
 * interface.
 */
export async function telechargerConte(
  langueBrute: string,
  livreId: string,
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);
  const retour = `/${langue}/compte/bibliotheque`;

  const format = formatValide(donnees.get('format'));
  const langueContenu = langueContenuValide(donnees.get('langue_contenu'));

  const magasin = await cookies();
  const entete = magasin
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');

  const reponse = await fetch(
    `${getServerEnv().NEXT_PUBLIC_APP_URL}/api/downloads/${livreId}?langue=${langueContenu}&format=${format}`,
    { headers: { cookie: entete }, cache: 'no-store' },
  );

  const corps = (await reponse.json().catch(() => null)) as {
    url?: unknown;
    erreur?: { code?: unknown };
  } | null;

  if (reponse.status === 401) redirect(`/${langue}/connexion`);

  if (!reponse.ok || typeof corps?.url !== 'string') {
    // Le CODE de refus voyage, jamais le message : la route rédige ses messages
    // en français, et l'écran les traduit depuis le code.
    const code = typeof corps?.erreur?.code === 'string' ? corps.erreur.code : 'erreur_interne';
    redirect(`${retour}?erreur=${code}`);
  }

  // Vers le STOCKAGE, pas vers une page de ce site : c'est lui qui sert le
  // fichier, et l'URL expire dans cinq minutes.
  redirect(corps.url);
}
