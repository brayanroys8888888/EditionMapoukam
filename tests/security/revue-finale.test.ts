import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { fichiersSources } from '../helpers/sources';

/**
 * REVUE DE SÉCURITÉ DE FIN DE CHANTIER — étape 16.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ÉNUMÉRATION, PAS ÉCHANTILLONNAGE.                                       │
 * │                                                                          │
 * │ Une revue qui vérifie « quelques routes » ne dit rien des autres. Ce     │
 * │ fichier découvre TOUTES les routes sur le disque et se prononce sur      │
 * │ chacune. Une route ajoutée après cette revue est couverte sans que       │
 * │ personne n'y pense — c'est exactement le cas qui échappe autrement.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();
const API = join(RACINE, 'src', 'app', 'api');

interface Route {
  url: string;
  chemin: string;
  source: string;
}

function routes(): Route[] {
  return fichiersSources(API)
    .filter((f) => f.endsWith('route.ts'))
    .map((f) => {
      const dossier = f.slice(0, f.lastIndexOf(sep));
      return {
        url: `/${relative(join(RACINE, 'src', 'app'), dossier).split(sep).join('/')}`,
        chemin: relative(RACINE, f).split(sep).join('/'),
        source: readFileSync(f, 'utf8'),
      };
    })
    .sort((a, b) => a.url.localeCompare(b.url));
}

const ROUTES = routes();

/** Routes délibérément ouvertes au visiteur, avec la raison de chacune. */
const PUBLIQUES: Readonly<Record<string, string>> = {
  '/api/catalog': 'Le catalogue est public — c’est la vitrine (§4.1).',
  '/api/catalog/[slug]': 'Fiche d’un titre publié, publique.',
  '/api/catalog/[slug]/excerpt': 'L’extrait est offert au visiteur (§4.1 F3).',
  '/api/catalog/facets':
    'Décrit le catalogue publié, qui est lui-même public. N’expose que des valeurs ' +
    'déjà visibles dans la liste des titres, avec leur effectif.',
  '/api/offers':
    'La grille tarifaire est une vitrine : §4.1 F1 la met en page d’accueil. La cacher ' +
    'derrière un compte obligerait à s’inscrire pour connaître un prix.',
  '/api/time':
    'Rend l’instant de l’horloge métier, pour que l’interface ne compare jamais une date ' +
    'de l’API à celle du navigateur. Ne révèle rien qu’un en-tête `Date` HTTP ne révèle déjà.',
  '/api/books/[id]/pages/[page]': 'Sert l’extrait à un visiteur ; les droits sont vérifiés page par page.',
  '/api/auth/login': 'Point d’entrée de l’authentification.',
  '/api/auth/register': 'Création de compte : c’est le point d’entrée d’un nouveau visiteur.',
  '/api/auth/password/reset': 'Demande de réinitialisation.',
  '/api/auth/password/update': 'Réinitialisation par jeton.',
  '/api/auth/otp':
    'Authentifiée par le CODE À USAGE UNIQUE lui-même, jamais par une session : elle sert ' +
    'précisément à en ouvrir une, pour confirmer une adresse ou reprendre un compte dont le ' +
    'mot de passe est perdu. Même montage que le rafraîchissement — le secret présenté EST ' +
    'l’authentification. Deux plafonds de débit y tiennent lieu de garde, dont un par adresse ' +
    'email seule, parce que six chiffres se forcent brutalement.',
  '/api/auth/resend':
    'Renvoi du code de vérification d’adresse : elle s’adresse par construction à quelqu’un ' +
    'qui ne peut pas encore se connecter. Répond 204 sans condition — adresse inconnue, en ' +
    'attente ou déjà confirmée sont indistinguables, faute de quoi elle signalerait les ' +
    'inscriptions récentes.',
  '/api/webhooks/payments': 'Authentifiée par SIGNATURE, jamais par session (CLAUDE.md règle 5).',
  '/api/auth/refresh':
    'Authentifiée par le JETON DE RAFRAÎCHISSEMENT lui-même, jamais par une session : ' +
    'exiger une session valide pour en obtenir une serait circulaire, puisqu’elle vient ' +
    'précisément d’expirer. Le secret présenté EST l’authentification — même montage que ' +
    'le webhook, où c’est la signature. Rotation, détection de réutilisation et quota de ' +
    'débit y tiennent lieu de garde.',
  '/api/auth/logout':
    'Répond 204 même sans jeton valide : refuser à quelqu’un de partir n’aurait aucun sens, ' +
    'et laisserait le navigateur avec ses cookies. La révocation, elle, exige un jeton lisible.',
};

describe('INVENTAIRE — toute route exposée est recensée', () => {
  it('découvre les routes sur le disque', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(25);
  });

  it('chaque route est GARDÉE, ou publique avec une raison écrite', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ IL N'Y A PAS DE TROISIÈME CAS.                                       │
    // │                                                                      │
    // │ Une route est protégée par une garde, ou délibérément publique et     │
    // │ inscrite ci-dessus avec sa justification. Une route qui ne serait ni  │
    // │ l'un ni l'autre est un oubli, et c'est ce que ce test attrape.        │
    // └──────────────────────────────────────────────────────────────────────┘
    const sansGarde = ROUTES.filter(
      (r) =>
        !/requireUser\(|requireAdmin\(|gardeAdmin\(/.test(r.source) &&
        !(r.url in PUBLIQUES) &&
        !r.url.startsWith('/api/dev'),
    ).map((r) => r.url);

    expect(sansGarde).toEqual([]);
  });

  it('chaque route publique porte une raison NON VIDE', () => {
    for (const [url, raison] of Object.entries(PUBLIQUES)) {
      expect(raison.length, `${url} : raison trop courte`).toBeGreaterThan(20);
      // La route existe bien : une entrée périmée masquerait une vraie route
      // publique ajoutée sous le même nom.
      expect(ROUTES.map((r) => r.url)).toContain(url);
    }
  });

  it('chaque route MUTANTE valide ses entrées avec Zod', () => {
    // CLAUDE.md : « Toute route API valide ses entrées avec Zod avant tout
    // traitement. » Les routes purement lectrices sans paramètre en sont
    // dispensées ; celles qui écrivent, jamais.
    const mutantes = ROUTES.filter((r) =>
      /export async function (POST|PUT|PATCH|DELETE)/.test(r.source),
    );
    expect(mutantes.length).toBeGreaterThanOrEqual(10);

    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UNE ROUTE SANS ENTRÉE N'A RIEN À VALIDER.                            │
    // │                                                                      │
    // │ `logout`, `purge-copies` et `dev/reset` ne lisent ni corps ni         │
    // │ paramètre : leur seule entrée est l'identité de l'appelant, déjà      │
    // │ vérifiée par la garde. Exiger un schéma Zod y serait un rite sans     │
    // │ objet — et les rites sans objet finissent contournés, y compris là où │
    // │ ils avaient un sens.                                                  │
    // │                                                                      │
    // │ Le webhook de paiement est le cas à part : son entrée est validée par │
    // │ la SIGNATURE puis par `lireEvenement`, avant tout parsing. Un schéma  │
    // │ Zod appliqué au corps brut inverserait cet ordre, qui EST la sécurité │
    // │ de ce point d'entrée.                                                 │
    // └──────────────────────────────────────────────────────────────────────┘
    const litUneEntree = (source: string): boolean =>
      /request\.json\(|request\.text\(|request\.formData\(|searchParams|parseJsonBody|parseSearchParams|contexte\.params/.test(
        source,
      );

    const sansZod = mutantes
      .filter((r) => litUneEntree(r.source))
      .filter((r) => !/from 'zod'|parseJsonBody|parseSearchParams/.test(r.source))
      .map((r) => r.url);

    // Le webhook lit bien une entrée, mais la valide autrement — et mieux.
    expect(sansZod).toEqual(['/api/webhooks/payments']);
  });

  it('aucune route ne renvoie un détail interne au client', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UNE ERREUR RENVOYÉE TELLE QUELLE DÉCRIT LA BASE.                     │
    // │                                                                      │
    // │ Un message PostgreSQL nomme des tables, des colonnes et des           │
    // │ contraintes. `errors.interne()` conserve le détail POUR LE JOURNAL et │
    // │ ne rend au client qu'un message neutre.                              │
    // └──────────────────────────────────────────────────────────────────────┘
    const coupables: string[] = [];

    for (const route of ROUTES) {
      // Une erreur brute placée dans le corps de la réponse.
      for (const motif of [
        /message:\s*erreur/i,
        /message:\s*String\(erreur\)/,
        /message:\s*\w*[Ee]rror\.message/,
        /message:\s*\w+\.error\.message/,
      ]) {
        if (motif.test(route.source)) coupables.push(`${route.url} : ${String(motif)}`);
      }
    }

    expect(coupables).toEqual([]);
  });
});

describe('LA CONSOLE /dev EST FERMÉE EN PRODUCTION', () => {
  const dev = ROUTES.filter((r) => r.url.startsWith('/api/dev'));

  it('trouve les routes de la console', () => {
    expect(dev.length).toBeGreaterThanOrEqual(4);
  });

  it('chacune refuse NODE_ENV=production', () => {
    // Le garde-fou obligatoire de CLAUDE.md. Vérifié route par route sur le
    // texte : un garde retiré par mégarde se verrait ici même si aucun test de
    // comportement ne passait par cette route.
    const sansGarde = dev
      .filter((r) => !/garderConsole\(|NODE_ENV.*production/.test(r.source))
      .map((r) => r.url);

    expect(sansGarde).toEqual([]);
  });
});

describe('AUCUN SECRET DANS UNE VARIABLE NEXT_PUBLIC_*', () => {
  it('le schéma d’environnement n’expose que des valeurs publiables', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ `NEXT_PUBLIC_*` EST EMBARQUÉ DANS LE BUNDLE CLIENT.                  │
    // │                                                                      │
    // │ Tout ce qui y figure est lisible par n'importe quel visiteur, dans le │
    // │ code source de la page. Une clé `service_role` qui s'y glisserait     │
    // │ donnerait un accès total à la base — CLAUDE.md règle 2.               │
    // └──────────────────────────────────────────────────────────────────────┘
    const env = readFileSync(join(RACINE, 'src', 'lib', 'config', 'env.ts'), 'utf8');
    const publiques = [...env.matchAll(/NEXT_PUBLIC_(\w+)/g)].map((m) => m[1]);

    expect(publiques.length).toBeGreaterThan(0);

    const suspects = publiques.filter((nom) =>
      /SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|TOKEN|CREDENTIAL/i.test(nom ?? ''),
    );

    expect(suspects).toEqual([]);
  });

  it('aucun fichier du dépôt ne place un secret dans une variable publique', () => {
    // Le contrôle sur les SOURCES, complémentaire du schéma : une variable
    // publique fabriquée ailleurs qu'au schéma échapperait au test précédent.
    const coupables: string[] = [];

    for (const fichier of fichiersSources(join(RACINE, 'src'))) {
      const source = readFileSync(fichier, 'utf8');
      for (const trouve of source.matchAll(/NEXT_PUBLIC_\w*(SECRET|SERVICE_ROLE|PRIVATE)\w*/gi)) {
        coupables.push(`${relative(RACINE, fichier)} : ${trouve[0]}`);
      }
    }

    expect(coupables).toEqual([]);
  });

  it('la clé `service_role` n’est lue que par le client serveur', () => {
    // Elle ne doit apparaître que là où le client de service est fabriqué.
    const autorises = [
      join('src', 'lib', 'config', 'env.ts'),
      join('src', 'lib', 'supabase', 'clients.ts'),
    ].map((p) => p.split(sep).join('/'));

    const coupables = fichiersSources(join(RACINE, 'src'))
      .filter((f) => /SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(RACINE, f).split(sep).join('/'))
      .filter((f) => !autorises.includes(f));

    expect(coupables).toEqual([]);
  });
});
