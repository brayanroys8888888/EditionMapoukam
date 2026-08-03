import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { FormulaireCode, MessageAuth } from '@/components/auth';
import { changerMotDePasse } from '../actions';

/**
 * Nouveau mot de passe — §4.2 F5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MESSAGE « VÉRIFIEZ VOTRE BOÎTE » EST AFFICHÉ SANS CONDITION.         │
 * │                                                                          │
 * │ Il ne dépend d'aucune réponse serveur : `?envoye=1` est posé par la      │
 * │ Server Action dans tous les cas, y compris lorsque l'adresse n'a aucun   │
 * │ compte. Le formulaire de saisie du code s'affiche ensuite, également     │
 * │ sans condition — un écran qui ne le montrerait qu'aux comptes existants  │
 * │ répondrait exactement à la question qu'on refuse de répondre.            │
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
  return { title: traduire(langue, 'auth.nouveauTitre') };
}

export default async function PageNouveauMotDePasse({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  const attente = Number(premier(requete['attente']));

  return (
    <>
      {premier(requete['envoye']) ? <MessageAuth langue={langue} cle="auth.oubliEnvoye" /> : null}

      <FormulaireCode
        langue={langue}
        action={changerMotDePasse.bind(null, langue)}
        titre="auth.nouveauTitre"
        intro="auth.nouveauIntro"
        soumettre="auth.nouveauSoumettre"
        avecMotDePasse
        erreur={premier(requete['erreur'])}
        attente={Number.isFinite(attente) && attente > 0 ? attente : undefined}
      />
    </>
  );
}
