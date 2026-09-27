#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ DES COMMANDES ET DES ABONNEMENTS DE DÉMONSTRATION, PAR LE VRAI CHEMIN.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI PAS UN `INSERT` DANS `supabase/seed.sql`.                      │
 * │                                                                          │
 * │ Le jeu de démonstration porte des livres, des prix, des offres et des    │
 * │ témoignages — tout ce qu'un éditeur saisit. Il ne porte AUCUNE commande, │
 * │ et ce n'est pas un oubli : « les webhooks sont la seule source de        │
 * │ vérité » (CLAUDE.md, règle 5). Une commande écrite à la main aurait un   │
 * │ statut `paye` sans facture, sans droit accordé, sans événement — elle    │
 * │ ressemblerait à une commande sans en être une, et le premier écran qui   │
 * │ lirait ses droits montrerait le contraire de ce que la liste affiche.    │
 * │                                                                          │
 * │ Ce script suit donc le chemin réel, celui du client :                    │
 * │                                                                          │
 * │   connexion → panier → POST /api/orders → événement signé vers           │
 * │   /api/webhooks/payments                                                 │
 * │                                                                          │
 * │ Ce qui en sort est vrai de bout en bout : facture émise, droits          │
 * │ accordés, `paye_le` posé par le gestionnaire, idempotence éprouvée.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QU'IL PEUPLE, ET POURQUOI CETTE RÉPARTITION.                         │
 * │                                                                          │
 * │ Les écrans `commandes` et `abonnements` montrent des segmentés par       │
 * │ statut, chacun avec son compte. Un jeu où tout est payé afficherait      │
 * │ quatre segments dont trois à zéro : on ne verrait ni les couleurs des    │
 * │ étiquettes, ni la frise de suivi d'un paiement en attente, ni la carte   │
 * │ d'avertissement d'un impayé. Le jeu couvre donc LES QUATRE statuts, et   │
 * │ LES DEUX devises — parce que la règle qui interdit d'additionner un euro │
 * │ et un franc CFA ne se voit que sur un jeu qui contient les deux.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES DONNÉES NE DOIVENT PAS ÊTRE LÀ QUAND LA PORTE TOURNE.               │
 * │                                                                          │
 * │ Quatre tests comptent les abonnements GLOBALEMENT — « ne compte pas une  │
 * │ anomalie parmi les actifs », « n'est comptée ni en actif ni en expiré » —│
 * │ et supposaient une base qui n'en portait aucun. Trois abonnements de     │
 * │ démonstration les font tomber, sans qu'aucun message ne parle de         │
 * │ démonstration.                                                           │
 * │                                                                          │
 * │ C'est exactement le piège que CLAUDE.md documente déjà pour les contes   │
 * │ d'essai. La suite finit d'ailleurs par tout effacer elle-même, en        │
 * │ appelant `dev_reset_demo_state` — mais trop tard pour les tests joués    │
 * │ avant elle, et l'ordre n'est pas garanti.                                │
 * │                                                                          │
 * │ D'où `--vider`, et l'ordre de travail : peupler, construire, mesurer,    │
 * │ VIDER, puis `npm run verify`.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Usage :
 *   npm run dev                            # le script parle au serveur
 *   node scripts/demo-ventes.mjs           # refuse si des commandes existent
 *   node scripts/demo-ventes.mjs --force   # ajoute quand meme
 *   node scripts/demo-ventes.mjs --vider   # efface, AVANT `npm run verify`
 */

const APP = process.env['APP_URL'] ?? 'http://localhost:3000';

/*
 * La cible DOIT être locale.
 *
 * Même garde que `deposer-couvertures.mjs` et `creer-admin.mjs`. Ce script
 * émet de VRAIS événements de paiement : pointé sur un serveur hébergé, il
 * fabriquerait des commandes payées et des droits d'accès dans la boutique
 * réelle. On refuse plutôt que de faire confiance à une variable.
 */
if (!/127\.0\.0\.1|localhost/.test(APP)) {
  console.error(`Ce script est LOCAL. Cible refusée : ${APP}`);
  process.exit(1);
}

const FORCE = process.argv.includes('--force');
const VIDER = process.argv.includes('--vider');

/*
 * Les comptes de démonstration, avec leurs identifiants locaux — les mêmes que
 * `REPRISE.md`. Trois personnes plutôt qu'une : une liste de commandes dont
 * chaque ligne porte le même nom ne montre pas ce que la colonne CLIENT fait.
 */
const COMPTES = [
  { email: 'parent@editionmapoukam.test', motDePasse: 'Usr-Mapoukam-2026' },
  { email: 'utilisateur@mapoukam.fr', motDePasse: 'User123456!' },
];

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PAYS DÉCIDE DE LA DEVISE, ET C'EST VOULU.                            │
 * │                                                                          │
 * │ Depuis la migration 0088, le client déclare son pays au récapitulatif et │
 * │ la commande le fige avec son montant. `zonePourPays` en tire la zone,    │
 * │ la zone donne la grille, la grille donne la devise. On ne choisit donc   │
 * │ pas « EUR » ici : on choisit « FR », et le reste suit le même chemin que │
 * │ pour un vrai client.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
/**
 * Pose le pays que le faux prestataire rapportera à la prochaine commande.
 *
 * Il est LU à la création, pour figer la zone et le montant. Le déplacer
 * ensuite ne retarife rien — d'où un appel avant CHAQUE commande, et pas un
 * seul au début.
 */
async function poserPays(session, pays) {
  const r = await appeler(session, '/api/dev/pays', {
    method: 'POST',
    body: JSON.stringify({ pays }),
  });
  if (!r.ok) throw new Error(`Pays simulé refusé (${r.statut}) : ${JSON.stringify(r.corps)}`);
  return r.corps?.zone;
}

const SCENARIOS = [
  { compte: 0, pays: 'CM', titres: 2, issue: 'payee' },
  { compte: 0, pays: 'FR', titres: 1, issue: 'payee' },
  { compte: 0, pays: 'CM', titres: 1, issue: 'en_attente' },
  { compte: 1, pays: 'FR', titres: 2, issue: 'payee' },
  { compte: 1, pays: 'CM', titres: 1, issue: 'remboursee' },
  { compte: 1, pays: 'CM', titres: 1, issue: 'echouee' },
  { compte: 1, pays: 'FR', titres: 1, issue: 'payee' },
];

/** Une session : un bocal à biscuits et rien d'autre. */
function bocal() {
  const biscuits = new Map();
  return {
    absorber(reponse) {
      for (const brut of reponse.headers.getSetCookie?.() ?? []) {
        const [paire] = brut.split(';');
        const index = paire?.indexOf('=') ?? -1;
        if (index > 0) biscuits.set(paire.slice(0, index), paire.slice(index + 1));
      }
    },
    entete() {
      return [...biscuits].map(([nom, valeur]) => `${nom}=${valeur}`).join('; ');
    },
  };
}

async function appeler(session, chemin, options = {}) {
  const reponse = await fetch(`${APP}${chemin}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(session ? { cookie: session.entete() } : {}),
      ...(options.headers ?? {}),
    },
  });
  session?.absorber(reponse);

  const texte = await reponse.text();
  let corps;
  try {
    corps = texte ? JSON.parse(texte) : null;
  } catch {
    // Une réponse non JSON est presque toujours une page d'erreur du serveur :
    // on en garde le début, qui suffit à comprendre, plutôt que de la perdre.
    corps = { brut: texte.slice(0, 200) };
  }
  return { statut: reponse.status, ok: reponse.ok, corps };
}

async function connecter(compte) {
  const session = bocal();
  const r = await appeler(session, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: compte.email, password: compte.motDePasse }),
  });
  if (!r.ok) {
    throw new Error(`Connexion refusée pour ${compte.email} : ${r.statut} ${JSON.stringify(r.corps)}`);
  }
  return session;
}

/** Vide le panier, pour que deux exécutions ne s'additionnent pas. */
async function viderPanier(session) {
  const r = await appeler(session, '/api/cart');
  for (const ligne of r.corps?.lignes ?? []) {
    const id = ligne.book_id ?? ligne.id;
    if (id) await appeler(session, `/api/cart?book_id=${id}`, { method: 'DELETE' });
  }
}

async function main() {
  const sonde = await appeler(null, '/api/time');
  if (!sonde.ok) {
    console.error(`Le serveur ne répond pas sur ${APP}. Lancez \`npm run dev\`.`);
    process.exit(1);
  }

  if (VIDER) {
    /*
     * `POST /api/dev/reset` appelle `dev_reset_demo_state` : commandes,
     * lignes, abonnements et droits, tous effacés. C'est la remise à zéro que
     * la console offre déjà, et la même que la suite de tests emploie — pas
     * une seconde implémentation écrite ici.
     */
    const remise = await appeler(null, '/api/dev/reset', { method: 'POST' });
    if (!remise.ok) {
      console.error(`Remise à zéro refusée (${remise.statut}).`);
      process.exit(1);
    }
    console.log('Jeu de démonstration des ventes effacé.');
    return;
  }

  /*
   * Deux exécutions ne doivent pas doubler le jeu. Le script REFUSE plutôt
   * que de deviner : un jeu de démonstration involontairement doublé se
   * remarque tard, sur un chiffre d'affaires qui ne veut plus rien dire.
   */
  const admin = await connecter({
    email: 'admin@editionmapoukam.test',
    motDePasse: 'Adm-Mapoukam-2026',
  });
  const existantes = await appeler(admin, '/api/admin/orders?taille=1');
  const deja = existantes.corps?.total_lignes ?? existantes.corps?.commandes?.length ?? 0;
  if (deja > 0 && !FORCE) {
    console.log(`${deja} commande(s) déjà en base. Rien fait — relancez avec --force pour ajouter.`);
    process.exit(0);
  }

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE SCRIPT JOUE UN VISITEUR, PAS UN ADMINISTRATEUR QUI TRICHE.        │
   * │                                                                      │
   * │ `x-vercel-ip-country` est l'en-tête dont l'application tire la zone   │
   * │ d'AFFICHAGE. Le poser au pays du scénario met la grille affichée en   │
   * │ accord avec le pays du moyen de paiement — exactement la situation    │
   * │ d'un client camerounais qui commande depuis Douala.                   │
   * │                                                                      │
   * │ Sans lui, les deux zones divergeaient et l'API refusait la commande   │
   * │ en `confirmation_requise` : refus PARFAITEMENT JUSTE, puisque le      │
   * │ montant changeait de grille entre ce que le client avait vu et ce     │
   * │ qu'on allait lui débiter. Le script se met donc en règle plutôt que   │
   * │ de contourner la garde.                                               │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const commeVisiteurDe = (pays) => ({ 'x-vercel-ip-country': pays });

  /** Les titres achetables DANS CETTE ZONE : `prix` est nul hors grille. */
  async function titresAchetablesDepuis(pays) {
    const catalogue = await appeler(null, '/api/catalog?limite=40', {
      headers: commeVisiteurDe(pays),
    });
    return (catalogue.corps?.entrees ?? []).filter((e) => e.disponible_achat && e.prix);
  }

  const echantillon = await titresAchetablesDepuis('FR');
  if (echantillon.length < 3) {
    console.error(`Catalogue trop maigre (${echantillon.length} titre(s) achetables). Lancez \`npm run db:seed\`.`);
    process.exit(1);
  }

  const sessions = [];
  const identites = [];
  for (const compte of COMPTES) {
    const session = await connecter(compte);
    sessions.push(session);
    const moi = await appeler(session, '/api/auth/me');
    identites.push(moi.corps?.utilisateur?.id ?? moi.corps?.id);
  }

  /*
   * UN TITRE NE SE RACHÈTE PAS.
   *
   * Un achat accorde un droit permanent ; `POST /api/orders` refuse donc en
   * 409 un panier dont le compte possède déjà un titre. La première version de
   * ce script puisait dans un curseur commun et redonnait les mêmes livres au
   * même acheteur — trois scénarios sur sept tombaient, dont les deux qui
   * portaient « échouée » et « remboursée », c'est-à-dire précisément les
   * statuts que l'écran devait montrer.
   *
   * Chaque compte garde donc la liste de ce qu'il a déjà pris.
   */
  const possede = COMPTES.map(() => new Set());
  const bilan = { payee: 0, en_attente: 0, echouee: 0, remboursee: 0 };

  for (const [rang, scenario] of SCENARIOS.entries()) {
    const session = sessions[scenario.compte];
    await viderPanier(session);
    await poserPays(admin, scenario.pays);

    const disponibles = await titresAchetablesDepuis(scenario.pays);
    const choisis = disponibles
      .filter((titre) => !possede[scenario.compte].has(titre.id))
      .slice(0, scenario.titres);
    if (choisis.length < scenario.titres) {
      console.warn(`  scénario ${rang + 1} : plus assez de titres neufs — ignoré.`);
      continue;
    }
    for (const titre of choisis) {
      await appeler(session, '/api/cart', {
        method: 'POST',
        body: JSON.stringify({ book_id: titre.id, langue: 'fr' }),
        headers: commeVisiteurDe(scenario.pays),
      });
    }

    /*
     * L'APERÇU D'ABORD, puis la commande avec son total confirmé.
     *
     * Quand la zone d'encaissement diverge de la zone affichée — un visiteur
     * vu « international » dont le moyen de paiement est camerounais — l'API
     * REFUSE la commande en `confirmation_requise` : le montant change de
     * grille, et il n'est pas question de débiter un total que le client n'a
     * pas vu. C'est le chemin qu'un vrai client suit au récapitulatif, et le
     * script le suit aussi plutôt que de le contourner.
     */
    const vue = await appeler(session, '/api/orders', {
      method: 'PUT',
      body: JSON.stringify({ pays_paiement: scenario.pays }),
      headers: commeVisiteurDe(scenario.pays),
    });
    if (!vue.ok) {
      console.warn(`  scénario ${rang + 1} : aperçu refusé (${vue.statut}) — ignoré.`);
      continue;
    }

    const creation = await appeler(session, '/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        pays_paiement: scenario.pays,
        zone_affichee: vue.corps?.zone,
        total_confirme: vue.corps?.total,
      }),
      headers: commeVisiteurDe(scenario.pays),
    });
    if (!creation.ok) {
      const code = creation.corps?.erreur?.code ?? creation.statut;
      console.warn(`  scénario ${rang + 1} : commande refusée (${String(code)}) — ignoré.`);
      continue;
    }
    for (const titre of choisis) possede[scenario.compte].add(titre.id);
    const orderId = creation.corps?.commande_id;
    if (!orderId) {
      console.warn(`  scénario ${rang + 1} : aucune commande rendue — ignoré.`);
      continue;
    }

    /*
     * L'événement part vers le VRAI gestionnaire de webhooks, signé. C'est lui
     * qui pose `paye_le`, émet la facture et accorde les droits — ce script
     * n'écrit rien en base, et c'est ce qui rend le jeu crédible.
     *
     * « En attente » n'émet RIEN : c'est exactement ce qu'est une commande en
     * attente — une commande dont le prestataire n'a jamais répondu.
     */
    if (scenario.issue === 'payee' || scenario.issue === 'remboursee') {
      await appeler(admin, '/api/dev/events', {
        method: 'POST',
        body: JSON.stringify({ type: 'paiement.reussi', donnees: { orderId } }),
      });
    }
    if (scenario.issue === 'remboursee') {
      await appeler(admin, '/api/dev/events', {
        method: 'POST',
        body: JSON.stringify({
          type: 'remboursement.effectue',
          donnees: { orderId, motif: 'Demande du client' },
        }),
      });
    }
    if (scenario.issue === 'echouee') {
      await appeler(admin, '/api/dev/events', {
        method: 'POST',
        body: JSON.stringify({
          type: 'paiement.echoue',
          donnees: { orderId, motif: 'Fonds insuffisants' },
        }),
      });
    }

    bilan[scenario.issue] += 1;
    console.log(`  commande ${rang + 1}/${SCENARIOS.length} — ${scenario.issue}, ${scenario.pays}`);
  }

  /*
   * Les abonnements : un par domaine, plus un impayé, parce que l'écran
   * `abonnements` porte un bandeau qui n'apparaît qu'en présence d'un impayé
   * et qu'un bandeau jamais vu n'est jamais vérifié.
   */
  const ABONNEMENTS = [
    { compte: 0, code: 'lecture-mensuel', domaine: 'lecture', offre: 'mensuel', pays: 'CM', issue: 'actif' },
    { compte: 1, code: 'association-annuel', domaine: 'association', offre: 'annuel', pays: 'FR', issue: 'actif' },
    { compte: 1, code: 'lecture-annuel', domaine: 'lecture', offre: 'annuel', pays: 'CM', issue: 'impaye' },
  ];

  let abonnes = 0;
  for (const abonnement of ABONNEMENTS) {
    const session = sessions[abonnement.compte];
    const zone = await poserPays(admin, abonnement.pays);

    /*
     * `POST /api/subscriptions` N'ACTIVE RIEN — sa réponse le dit elle-même :
     * `statut: 'en_attente_paiement'`. Elle ouvre une session chez le
     * prestataire, et c'est tout. L'abonnement naît de l'ÉVÉNEMENT SIGNÉ, et
     * pas autrement : c'est la règle 5 de CLAUDE.md, et la première version
     * de ce script l'avait oubliée — elle annonçait trois abonnements pour
     * une table vide.
     */
    const ouverture = await appeler(session, '/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ offre: abonnement.code }),
    });
    if (!ouverture.ok) {
      console.warn(`  abonnement ${abonnement.code} refusé (${ouverture.statut}) — ignoré.`);
      continue;
    }

    const emission = await appeler(admin, '/api/dev/events', {
      method: 'POST',
      body: JSON.stringify({
        type: 'abonnement.souscrit',
        donnees: {
          userId: identites[abonnement.compte],
          domaine: abonnement.domaine,
          offre: abonnement.offre,
          zone,
        },
      }),
    });
    if (!emission.ok) {
      console.warn(`  abonnement ${abonnement.code} : événement refusé (${emission.statut}) — ignoré.`);
      continue;
    }

    // Un impayé se fabrique comme il arrive : le prélèvement suivant échoue.
    if (abonnement.issue === 'impaye') {
      await appeler(admin, '/api/dev/events', {
        method: 'POST',
        body: JSON.stringify({
          type: 'abonnement.prelevement_echoue',
          donnees: { userId: identites[abonnement.compte], domaine: abonnement.domaine },
        }),
      });
    }

    abonnes += 1;
    console.log(`  abonnement ${abonnement.code} — ${abonnement.issue}`);
  }

  console.log('');
  console.log('── JEU DE DÉMONSTRATION — VENTES ───────────────────────────');
  console.log(`   commandes : ${String(bilan.payee)} payée(s), ${String(bilan.en_attente)} en attente,`);
  console.log(`               ${String(bilan.echouee)} échouée(s), ${String(bilan.remboursee)} remboursée(s)`);
  console.log(`   abonnements : ${String(abonnes)}`);
  console.log('────────────────────────────────────────────────────────────');
}

await main();
