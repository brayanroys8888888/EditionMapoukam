import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { FormulaireInscription } from '@/components/auth';
import { inscription } from '../actions';

/**
 * Inscription — §4.2 F5.
 *
 * En cas de succès, cet écran ne s'affiche jamais deux fois : l'action
 * redirige vers la confirmation, où le code se saisit. Le message
 * « inscription enregistrée » vit donc là-bas, et il est le même que l'adresse
 * ait été connue ou non.
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
  return { title: traduire(langue, 'auth.inscriptionTitre') };
}

export default async function PageInscription({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  const attente = Number(premier(requete['attente']));

  return (
    <FormulaireInscription
      langue={langue}
      action={inscription.bind(null, langue)}
      erreur={premier(requete['erreur'])}
      attente={Number.isFinite(attente) && attente > 0 ? attente : undefined}
    />
  );
}
