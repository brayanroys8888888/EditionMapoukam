import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { FormulaireOubli } from '@/components/auth';
import { demanderReinitialisation } from '../actions';

/**
 * Mot de passe oublié — §4.2 F5.
 *
 * Cet écran n'a pas d'état de succès : l'action redirige TOUJOURS vers la
 * saisie du code, quelle que soit la réponse. C'est la deuxième des trois
 * indistinguabilités — voir le dictionnaire, clé `auth._commentaire`.
 */
interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return { title: traduire(langue, 'auth.oubliTitre') };
}

export default async function PageOubli({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  const attente = Number(premier(requete['attente']));

  return (
    <FormulaireOubli
      langue={langue}
      action={demanderReinitialisation.bind(null, langue)}
      erreur={premier(requete['erreur'])}
      attente={Number.isFinite(attente) && attente > 0 ? attente : undefined}
    />
  );
}
