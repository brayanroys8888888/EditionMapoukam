import { GET as telechargementEnJson } from '@/app/api/downloads/[bookId]/route';
import { langueValide } from '@/i18n';
import { redirection } from '@/lib/http/responses';

/**
 * Téléchargement — le chemin de NAVIGATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UNE ROUTE DE PLUS, ALORS QUE `/api/downloads/[bookId]` EXISTE. │
 * │                                                                          │
 * │ Celle-là rend du JSON — une URL signée, son échéance, la référence de    │
 * │ l'exemplaire — et c'est son contrat, décrit dans `docs/API-CONTRAT.md`   │
 * │ §2.5. Un navigateur pointé dessus affiche donc du JSON brut, ce qui a    │
 * │ déjà été signalé une fois comme « le téléchargement ne fonctionne pas ». │
 * │                                                                          │
 * │ Le correctif d'alors fut une action serveur qui lisait l'URL et y        │
 * │ redirigeait. C'était le mauvais outil : une action serveur est exécutée  │
 * │ par le ROUTEUR côté client, et comme le stockage répond                  │
 * │ `Content-Disposition: attachment`, le document ne se décharge jamais —   │
 * │ la navigation attendue n'aboutit pas et la file d'actions du routeur     │
 * │ reste bloquée. Passé deux téléchargements, la page entière était muette  │
 * │ jusqu'à un rechargement.                                                │
 * │                                                                          │
 * │ Cette route est atteinte par une soumission GET native. Le navigateur    │
 * │ télécharge, la page reste intacte, et l'on peut recommencer sans limite. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE NE DÉCIDE RIEN, ET NE SIGNE RIEN.                                  │
 * │                                                                          │
 * │ Elle appelle le gestionnaire d'API EN MÉMOIRE et traduit sa réponse en   │
 * │ redirection. Le quota, la garde de session, le moteur de droits, le      │
 * │ filigrane et l'échec fermé restent donc écrits UNE seule fois — c'est la │
 * │ règle de CLAUDE.md, et le même montage que `deposerConte`, qui appelle   │
 * │ la route d'ingestion en direct plutôt que par le réseau.                 │
 * │                                                                          │
 * │ Aucun `fetch` vers soi-même : la requête reçue est transmise telle       │
 * │ quelle, en-tête `cookie` compris. Un gestionnaire de route reçoit le     │
 * │ vrai objet `Request`, contrairement à un composant serveur — c'est       │
 * │ exactement ce que dit l'encadré de `identifierAppelantAvecCookies`.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * La génération se fait DANS cette fonction, donc c'est SON plafond que Vercel
 * applique. Le déclarer sur la seule route d'API ne corrigerait rien — l'erreur
 * a déjà été commise une fois, et elle en avait toutes les apparences
 * (`REPRISE.md` §0 bis). 60 s est le plafond du palier Hobby ; au-delà, le
 * déploiement échoue.
 */
export const maxDuration = 60;

const FORMATS = new Set(['pdf', 'epub']);
const LANGUES_CONTENU = new Set(['fr', 'en']);

export async function GET(
  requete: Request,
  contexte: { params: Promise<{ langue: string; bookId: string }> },
): Promise<Response> {
  const { langue: langueBrute, bookId } = await contexte.params;
  const langue = langueValide(langueBrute);
  const retour = `/${langue}/compte/bibliotheque`;

  const demande = new URL(requete.url);
  const format = demande.searchParams.get('format') ?? 'pdf';
  const langueContenu = demande.searchParams.get('langue_contenu') ?? 'fr';

  // Les valeurs sont ramenées à l'admis AVANT l'appel. La route d'API les
  // valide de nouveau avec Zod : c'est elle qui fait foi, ceci n'est qu'une
  // traduction de paramètres de navigation vers son contrat.
  const interne = new URL(`/api/downloads/${bookId}`, demande.origin);
  interne.searchParams.set('format', FORMATS.has(format) ? format : 'pdf');
  interne.searchParams.set('langue', LANGUES_CONTENU.has(langueContenu) ? langueContenu : 'fr');

  const reponse = await telechargementEnJson(
    new Request(interne, { headers: requete.headers }),
    { params: Promise.resolve({ bookId }) },
  );

  if (reponse.status === 401) return redirection(`/${langue}/connexion`);

  const corps = (await reponse.json().catch(() => null)) as {
    url?: unknown;
    erreur?: { code?: unknown };
  } | null;

  if (!reponse.ok || typeof corps?.url !== 'string') {
    // Le CODE voyage, jamais le message : la route rédige ses messages en
    // français, et l'écran les traduit depuis le code.
    const code = typeof corps?.erreur?.code === 'string' ? corps.erreur.code : 'erreur_interne';
    return redirection(`${retour}?erreur=${encodeURIComponent(code)}`);
  }

  const versLeFichier = redirection(corps.url);
  // L'URL signée vaut 300 secondes et mène à un fichier filigrané au nom de son
  // acheteur : cette redirection ne doit jamais être conservée par un cache
  // intermédiaire, où elle servirait l'exemplaire de quelqu'un d'autre.
  versLeFichier.headers.set('cache-control', 'private, no-store');
  return versLeFichier;
}
