/**
 * LE DÉLAI DE 300 s DE `fetch`, RELEVÉ POUR CE PROCESSUS SEULEMENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI A FAIT ÉCHOUER DEUX DÉPÔTS LE 24 SEPTEMBRE 2026.                 │
 * │                                                                          │
 * │ Le `fetch` de Node abandonne une requête au bout de 300 secondes. Sur    │
 * │ une connexion montante de 90 Ko/s, le PDF (25 Mo) et l'EPUB, envoyés en  │
 * │ parallèle vers Supabase, en demandent davantage : « fetch failed », à la │
 * │ dernière étape, après dix minutes de travail. REPRISE.md §0 duodecies.   │
 * │                                                                          │
 * │ Node n'exporte pas la classe de son répartiteur, mais l'installe sous un │
 * │ symbole connu dès le premier appel. On provoque cet appel, puis on       │
 * │ remplace le répartiteur par un autre, aux délais relevés. Aucune         │
 * │ dépendance ajoutée.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Deux usages :
 *   · `node --require admin-local/delai-fetch.cjs …` — le lanceur le pose dans
 *     `NODE_OPTIONS`, pour le serveur Next et ses processus ;
 *   · `await require('./delai-fetch.cjs').pret` — pour qui doit attendre que
 *     le remplacement soit fait avant son premier envoi.
 */
const DELAI_ENVOI_MS = 60 * 60 * 1000;
const SYMBOLE_REPARTITEUR = Symbol.for('undici.globalDispatcher.1');

const pret = globalThis
  .fetch('http://127.0.0.1:1')
  .catch(() => undefined)
  .then(() => {
    const Repartiteur = globalThis[SYMBOLE_REPARTITEUR]?.constructor;
    if (!Repartiteur) {
      throw new Error('Répartiteur de fetch introuvable : le délai d’envoi n’a pas pu être relevé.');
    }
    globalThis[SYMBOLE_REPARTITEUR] = new Repartiteur({
      headersTimeout: DELAI_ENVOI_MS,
      bodyTimeout: DELAI_ENVOI_MS,
    });
    return true;
  });

// Chargé par `--require`, personne n'attend la promesse : un échec doit
// quand même se voir, sans faire tomber le processus.
pret.catch((erreur) => {
  globalThis.process.stderr.write(`[admin-local] ${erreur.message}\n`);
});

module.exports = { pret, DELAI_ENVOI_MS };
