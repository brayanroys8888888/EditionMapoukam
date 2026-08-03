import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { FormulaireConnexion } from '@/components/auth';
import { connexion, renvoyerCode } from '../actions';

/**
 * Connexion — §4.2 F5.
 *
 * L'état vient exclusivement de l'URL : `erreur` et `attente` y sont déposés
 * par la Server Action, `motif` par le middleware après une révocation de
 * session. Rien n'est conservé en mémoire, si bien que l'écran se comporte de
 * la même façon rechargé, partagé, ou servi sans JavaScript.
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
  return { title: traduire(langue, 'auth.connexionTitre') };
}

export default async function PageConnexion({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  const attente = Number(premier(requete['attente']));

  return (
    <FormulaireConnexion
      langue={langue}
      action={connexion.bind(null, langue)}
      actionRenvoi={renvoyerCode.bind(null, langue)}
      erreur={premier(requete['erreur'])}
      attente={Number.isFinite(attente) && attente > 0 ? attente : undefined}
      motif={premier(requete['motif'])}
    />
  );
}
