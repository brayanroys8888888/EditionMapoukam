import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { FormulaireCode, MessageAuth } from '@/components/auth';
import { confirmerAdresse } from '../actions';

/**
 * Confirmation d'adresse — §4.2 F5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « INSCRIPTION ENREGISTRÉE » NE DIT PAS QU'UN COMPTE A ÉTÉ CRÉÉ.         │
 * │                                                                          │
 * │ C'est la première des trois indistinguabilités, et la plus facile à      │
 * │ trahir : le message naturel serait « votre compte est créé, confirmez    │
 * │ votre adresse ». Il apprendrait à qui teste une adresse déjà inscrite    │
 * │ qu'elle ne l'était pas.                                                  │
 * │                                                                          │
 * │ Le libellé retenu — `auth.inscriptionEnvoyee` — reste vrai dans les deux │
 * │ cas sans les distinguer, et la route d'inscription répond déjà 201 pour  │
 * │ l'un comme pour l'autre.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
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
  return { title: traduire(langue, 'auth.confirmationTitre') };
}

export default async function PageConfirmation({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  const attente = Number(premier(requete['attente']));

  return (
    <>
      {premier(requete['envoye']) ? (
        <MessageAuth langue={langue} cle="auth.inscriptionEnvoyee" />
      ) : null}

      <FormulaireCode
        langue={langue}
        action={confirmerAdresse.bind(null, langue)}
        titre="auth.confirmationTitre"
        intro="auth.confirmationIntro"
        soumettre="auth.confirmationSoumettre"
        erreur={premier(requete['erreur'])}
        attente={Number.isFinite(attente) && attente > 0 ? attente : undefined}
      />
    </>
  );
}
