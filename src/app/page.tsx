import { traduire, LANGUE_PAR_DEFAUT } from '@/i18n';

/**
 * Racine — jalon provisoire, jusqu'à l'étape F2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE PAGE AFFIRMAIT « Ce service n'expose pas d'interface publique ».   │
 * │                                                                          │
 * │ C'était vrai jusqu'à l'étape 16 ; ce ne l'est plus. La laisser aurait    │
 * │ fait du dépôt le dernier endroit à contredire ce qu'on y construit.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * F2 la remplacera par une redirection vers `/{langue}`, dérivée de la
 * préférence du compte puis de `Accept-Language`. Elle ne redirige pas encore :
 * les routes de langue n'existent pas, et rediriger vers une page absente
 * remplacerait un jalon lisible par un 404.
 *
 * Son texte passe par `traduire()`, y compris pour un jalon — sans quoi la
 * règle ne vaudrait que pour les fichiers qu'on n'a pas écrits en premier.
 */
export default function Racine() {
  return (
    <main>
      <h1>{traduire(LANGUE_PAR_DEFAUT, 'marque.nom')}</h1>
      <p>{traduire(LANGUE_PAR_DEFAUT, 'marque.baseline')}</p>
    </main>
  );
}
