/**
 * COMPLÈTE ET PUBLIE LES LIVRETS DÉPOSÉS — atelier local, jamais la production.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL PASSE PAR LES ROUTES D'ADMINISTRATION, PAS PAR LA BASE.               │
 * │                                                                          │
 * │ `update books set statut = 'publie'` marcherait, et sauterait les trois  │
 * │ contrôles qui font tout l'intérêt de cette surface : la garde de la      │
 * │ route, la fonction `admin_*` qui revérifie le rôle EN BASE, et le        │
 * │ déclencheur de publication qui refuse un titre auquel il manque un âge,  │
 * │ un auteur ou une origine. Un script d'atelier qui contourne ses propres  │
 * │ garde-fous ne prouve rien de ce qu'il installe.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node scripts/completer-livrets.mjs
 *
 * Le script est IDEMPOTENT : il ne touche qu'aux livrets encore en brouillon,
 * et retrouve chacun par son `slug`. Le relancer ne fait rien de plus.
 */
const BASE = process.env.URL_BASE ?? 'http://localhost:3000';

const identifiants = {
  email: process.env.ADMIN_EMAIL ?? 'admin@editionmapoukam.test',
  password: process.env.ADMIN_MOT_DE_PASSE ?? 'Adm-JL8HLFGBbdoS-7',
};

/*
 * Ce que porte chaque livret. Les titres, les niveaux et les objectifs sont
 * LUS SUR LES PLANCHES elles-mêmes — « Je colorie l'oiseau : perroquet comme
 * sur l'image », « Pédagogie inclusive · 4 ans et + » — et non inventés.
 *
 * Les trois sont OFFERTS et non vendus : ce sont des feuilles d'activité d'une
 * page, extraites d'un cahier. Les vendre à l'unité vendrait une page.
 */
const LIVRETS = [
  {
    slug: 'mon-cahier-de-graphisme',
    auteur: 'Fokawato',
    origine_culturelle: 'Cameroun',
    age_min: 4,
    age_max: 7,
    themes: ['graphisme'],
    niveau: 'MS · GS · CP',
    objectifs: [
      'Tenir et guider correctement son crayon.',
      'Reproduire les tracés de base : lignes, ponts, boucles.',
      'Suivre un modèle du regard avant de le tracer.',
    ],
    gratuit: true,
  },
  {
    slug: 'je-colorie-un-oiseau-le-perroquet',
    auteur: 'Fokawato',
    origine_culturelle: 'Cameroun',
    age_min: 4,
    age_max: 7,
    themes: ['coloriage', 'animaux'],
    niveau: 'MS · GS',
    objectifs: [
      'Colorier en respectant un modèle.',
      'Rester à l’intérieur du tracé.',
      'Nommer les couleurs de l’oiseau.',
    ],
    gratuit: true,
  },
  {
    slug: 'je-colorie-un-fruit-l-orange',
    auteur: 'Fokawato',
    origine_culturelle: 'Cameroun',
    age_min: 4,
    age_max: 7,
    themes: ['coloriage', 'nature'],
    niveau: 'MS · GS',
    objectifs: [
      'Colorier en respectant un modèle.',
      'Reconnaître et nommer un fruit courant.',
      'Travailler la précision du geste sur une forme ronde.',
    ],
    gratuit: true,
  },
];

/** Les cookies de session, tels que le navigateur les renverrait. */
function cookiesDe(reponse) {
  return reponse.headers
    .getSetCookie()
    .map((brut) => brut.split(';', 1)[0])
    .join('; ');
}

const connexion = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(identifiants),
});

if (!connexion.ok) {
  console.error('connexion refusée :', connexion.status, await connexion.text());
  process.exit(1);
}

const cookie = cookiesDe(connexion);
const entetes = { cookie, 'content-type': 'application/json' };

/* La liste d'administration, pour retrouver chaque livret par son `slug`. */
const liste = await fetch(`${BASE}/api/admin/books?statut=brouillon&taille=100`, {
  headers: { cookie },
});
if (!liste.ok) {
  console.error('liste refusée :', liste.status, await liste.text());
  process.exit(1);
}
/* La route rend `livres`, et chaque ligne porte ce qui MANQUE a la publication. */
const { livres } = await liste.json();
const parSlug = new Map((livres ?? []).map((livre) => [livre.slug, livre]));

const aPublier = [];

for (const livret of LIVRETS) {
  const { slug, gratuit, ...champs } = livret;
  const livre = parSlug.get(slug);
  if (!livre) {
    console.log(`${slug} — ABSENT de la liste, ignoré.`);
    continue;
  }
  if (livre.statut === 'publie') {
    console.log(`${slug} — déjà publié.`);
    continue;
  }

  const modification = await fetch(`${BASE}/api/admin/books`, {
    method: 'PATCH',
    headers: entetes,
    body: JSON.stringify({
      id: livre.id,
      ...champs,
      gratuit,
      /*
       * Offert, donc ni vendu ni inclus : les trois leviers sont
       * indépendants, et `access_for_books` les lit tous les trois. Poser
       * `gratuit` sans fermer les deux autres laisserait un titre offert
       * ET affiché avec un prix — le défaut que la fiche du catalogue
       * montre déjà sur « La rivière qui parlait ».
       */
      inclus_abonnement: false,
      disponible_achat: false,
    }),
  });

  if (!modification.ok) {
    console.error(`${slug} — modification refusée :`, modification.status, await modification.text());
    continue;
  }

  console.log(`${slug} — complété.`);
  aPublier.push(livre.id);
}

if (aPublier.length === 0) {
  console.log('rien à publier.');
  process.exit(0);
}

const publication = await fetch(`${BASE}/api/admin/books/publication`, {
  method: 'PUT',
  headers: entetes,
  body: JSON.stringify({ book_ids: aPublier, statut: 'publie' }),
});

console.log('publication :', publication.status, (await publication.text()).slice(0, 400));
