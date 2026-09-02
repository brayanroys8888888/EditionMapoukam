import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE DÉPÔT D'UN LIVRET PÉDAGOGIQUE — ce que la forme du code doit tenir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI DES TESTS SUR LE TEXTE PLUTÔT QUE SUR LE COMPORTEMENT.         │
 * │                                                                          │
 * │ Éprouver réellement ce dépôt exigerait d'ingérer un PDF : poppler et     │
 * │ `sharp` sur un document entier, environ trois gigaoctets, plusieurs      │
 * │ minutes. Un test aussi coûteux finirait par être ignoré — et             │
 * │ `scripts/porte-tests.mjs` existe précisément parce qu'un test ignoré ne  │
 * │ proteste pas.                                                            │
 * │                                                                          │
 * │ Ce qui compte ici tient de toute façon à la FORME : que le type soit     │
 * │ imposé et non choisi, que le plafond de durée soit déclaré sur la page   │
 * │ qui exécute réellement l'ingestion, et que l'écran passe par la garde.   │
 * │ Trois propriétés qu'une ingestion réussie ne prouverait pas.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();

const ACTIONS = readFileSync(
  join(RACINE, 'src', 'app', '[langue]', 'admin', 'contes', 'actions.ts'),
  'utf8',
);

const ECRAN = readFileSync(
  join(RACINE, 'src', 'app', '[langue]', 'admin', 'livrets', 'nouveau', 'page.tsx'),
  'utf8',
);

const ROUTE = readFileSync(
  join(RACINE, 'src', 'app', 'api', 'admin', 'books', 'ingest', 'route.ts'),
  'utf8',
);

const PIPELINE = readFileSync(join(RACINE, 'src', 'lib', 'ingestion', 'pipeline.ts'), 'utf8');

describe('LE TYPE EST IMPOSÉ PAR L’ÉCRAN, JAMAIS LU DANS LE FORMULAIRE', () => {
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UN TYPE OUBLIÉ NE LÈVE AUCUNE ERREUR — IL PUBLIE UN LIVRET EN CONTE.   │
   * │                                                                        │
   * │ `type_document` est NOT NULL avec un défaut depuis la migration 0061 :  │
   * │ rien ne manque jamais, `manques_pour_publication` reste muet, et le     │
   * │ bouton « Publier » ne s'assombrit pas. Le seul moment où l'erreur       │
   * │ pourrait se voir est le dépôt — d'où deux portes, et un type qui n'est  │
   * │ pas un choix.                                                          │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it('`deposerLivret` écrit le type lui-même', () => {
    expect(ACTIONS).toContain(
      "propreData.append('type_document', 'livret_pedagogique');",
    );
  });

  it('`deposerLivret` ne recopie PAS `type_document` depuis le formulaire', () => {
    // La boucle de recopie de `deposerLivret` ne doit pas nommer le type : il
    // y serait posé une seconde fois, et la valeur du client gagnerait.
    const corps = ACTIONS.slice(ACTIONS.indexOf('export async function deposerLivret'));
    const boucle = corps.match(/for \(const champ of \[([^\]]*)\]/);

    expect(boucle, 'boucle de recopie introuvable').not.toBeNull();
    expect(boucle?.[1]).not.toContain('type_document');
    // L'orientation, elle, VIENT du formulaire : c'est le seul choix de cet
    // écran, et le déposant est seul à savoir ce qu'il dépose.
    expect(boucle?.[1]).toContain('orientation');
  });

  it('un refus ramène sur l’écran des LIVRETS, pas sur celui des contes', () => {
    // Le seul écart de comportement entre les deux dépôts. S'il retombait sur
    // `/admin/contes/nouveau`, l'éditeur recommencerait son dépôt par la
    // mauvaise porte — et son livret serait publié en conte.
    const corps = ACTIONS.slice(ACTIONS.indexOf('export async function deposerLivret'));
    expect(corps).toContain("const depot = `/${langue}/admin/livrets/nouveau`;");
  });
});

describe('L’ÉCRAN DE DÉPÔT PORTE SES DEUX GARDE-FOUS', () => {
  it('il passe par `exigerAdministrateur`', () => {
    // Redondant avec `admin-architecture`, et délibérément : celui-ci nomme
    // l'écran, si bien qu'un échec dit lequel plutôt que « un écran ».
    expect(ECRAN).toMatch(/exigerAdministrateur\s*\(/);
  });

  it('il déclare `maxDuration`, parce que l’ingestion tourne DANS sa fonction', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ `deposerLivret` appelle `ingererRoute(req)` en mémoire, pas par HTTP. │
    // │ Le travail se fait donc dans la fonction serverless de CETTE page,    │
    // │ et c'est son plafond à elle que Vercel applique. Le déclarer sur la   │
    // │ seule route d'API aurait eu toutes les apparences d'un correctif.     │
    // └──────────────────────────────────────────────────────────────────────┘
    expect(ECRAN).toMatch(/export const maxDuration = \d+;/);
  });

  it('il n’écrit aucun libellé en dur — tout passe par `traduire`', () => {
    // Le même invariant que `frontend-architecture` tient sur tout l'écran ;
    // ici on vérifie le seul point où la tentation est réelle : les deux
    // orientations, qui ressemblent à des valeurs techniques.
    expect(ECRAN).toContain("traduire(langue, 'orientations.paysage')");
    expect(ECRAN).toContain("traduire(langue, 'orientations.portrait')");
  });
});

describe('LA CHAÎNE D’INGESTION ACCEPTE LES DEUX VALEURS, ET LES BORNE', () => {
  it('la route les valide par une énumération FERMÉE', () => {
    // Du texte libre poserait `type_document = 'livre'`, que l'énumération
    // PostgreSQL refuserait — en fin de chaîne, après le travail coûteux.
    expect(ROUTE).toContain("z.enum(['conte', 'livret_pedagogique']).optional()");
    expect(ROUTE).toContain("z.enum(['paysage', 'portrait']).optional()");
  });

  it('le pipeline ne les pose QUE sur un livre neuf', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ Ajouter une version linguistique à un titre existant ne doit rien     │
    // │ changer du titre parent — pas plus son type que son slug ou son       │
    // │ auteur. Les valeurs voyagent donc dans l'`insert`, jamais dans un     │
    // │ `update`.                                                             │
    // └──────────────────────────────────────────────────────────────────────┘
    // `statut: 'brouillon'` n'apparaît que dans l'insertion du livre — c'est
    // l'ancre la plus stable de ce fichier.
    const insertion = PIPELINE.slice(PIPELINE.indexOf("statut: 'brouillon',"));
    const bloc = insertion.slice(0, insertion.indexOf('.select('));

    expect(bloc).toContain('type_document');
    expect(bloc).toContain('orientation');

    // Aucun `update` de `books` ne les touche.
    const majs = [...PIPELINE.matchAll(/\.from\('books'\)[\s\S]{0,200}?\.update\(([\s\S]{0,300}?)\)/g)];
    for (const maj of majs) {
      expect(maj[1]).not.toContain('type_document');
      expect(maj[1]).not.toContain('orientation');
    }
  });
});
