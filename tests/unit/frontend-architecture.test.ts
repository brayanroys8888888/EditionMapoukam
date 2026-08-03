import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { fichiersSources } from '../helpers/sources';

/**
 * ARCHITECTURE DU FRONTEND — une seule implémentation, des deux côtés du réseau.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS FOIS DANS CE PROJET, UNE RÈGLE ÉCRITE EN SQL ET EN TYPESCRIPT A   │
 * │ RENDU DES VERDICTS OPPOSÉS.                                             │
 * │                                                                          │
 * │ Le frontend ajoute un TROISIÈME niveau — le navigateur — et c'est là que │
 * │ la divergence coûterait le plus cher : elle serait invisible du serveur, │
 * │ donc invisible des tests d'intégration, et se manifesterait comme un     │
 * │ prix faux ou un bouton proposé à tort.                                   │
 * │                                                                          │
 * │ Ce fichier interdit la troisième implémentation, plutôt que de la        │
 * │ rattraper après coup (docs/PLAN.md §5 quinquies).                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();

/**
 * Sources d'interface : composants et pages.
 *
 * Deux exclusions, toutes deux NOMMÉES sur un chemin exact plutôt que définies
 * par un motif — un filtre large finirait par couvrir un écran réel :
 *
 *   `/src/app/api/` — ce sont les routes, du code serveur. Elles emploient
 *   légitimement la clé de service et `new Date()`, et leurs règles sont
 *   couvertes par les tests d'architecture du backend.
 *
 *   `/src/app/dev/` — la console de SIMULATION. Elle n'est pas l'interface du
 *   produit : CLAUDE.md la veut « très rudimentaire », elle est fermée en
 *   production, et aucun utilisateur ne la voit. Lui imposer la charte, la
 *   traduction et l'horloge métier coûterait sans rien protéger — elle
 *   AFFICHE d'ailleurs l'heure réelle à côté de l'heure simulée, ce qui est
 *   sa raison d'être.
 */
function sourcesInterface(): string[] {
  const composants = fichiersSources(join(RACINE, 'src', 'components'), /\.tsx?$/);
  const pages = fichiersSources(join(RACINE, 'src', 'app'), /\.tsx$/).filter((fichier) => {
    const normalise = fichier.replace(/\\/g, '/');
    return !normalise.includes('/src/app/api/') && !normalise.includes('/src/app/dev/');
  });
  return [...composants, ...pages];
}

function chemin(fichier: string): string {
  return relative(RACINE, fichier).replace(/\\/g, '/');
}

describe('le parcours porte sur quelque chose', () => {
  it('trouve des sources d’interface', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ GARDE D'EFFECTIF. Une liste vide se lirait « aucune infraction »   │
    // │ alors qu'elle signifierait « rien n'a été lu » — la classe de      │
    // │ défaut n°3 de §5 sexies, trouvée sur six tests d'architecture.     │
    // └────────────────────────────────────────────────────────────────────┘
    expect(sourcesInterface().length).toBeGreaterThanOrEqual(2);
  });
});

describe('AUCUNE RÈGLE MÉTIER RECALCULÉE CÔTÉ INTERFACE', () => {
  it('aucun composant ni page n’emploie la clé de service', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ CLAUDE.md règle 2 : la clé `service_role` ne quitte jamais le      │
    // │ serveur. Un composant qui l'importerait la ferait entrer dans le   │
    // │ bundle client — et donnerait à chaque visiteur un accès total.     │
    // └────────────────────────────────────────────────────────────────────┘
    const coupables = sourcesInterface()
      .filter((f) => /createServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(f, 'utf8')))
      .map(chemin);

    expect(coupables).toEqual([]);
  });

  it('aucun composant ne DÉDUIT un droit depuis `reason`', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ `canDownload` NE SE DÉDUIT JAMAIS DE `reason` (docs/PLAN.md D5).   │
    // │                                                                    │
    // │ Un conte à la fois gratuit et acheté rend `reason: 'purchase'` ET  │
    // │ `canDownload: true` ; un abonné rend `reason: 'subscription'` ET   │
    // │ `canDownload: false`. Comparer `reason` pour décider d'un          │
    // │ téléchargement donne le bon résultat la plupart du temps — et le   │
    // │ mauvais exactement là où la règle métier centrale se joue.         │
    // └────────────────────────────────────────────────────────────────────┘
    const coupables: string[] = [];

    for (const fichier of sourcesInterface()) {
      const source = readFileSync(fichier, 'utf8');
      // Un `reason` comparé à une valeur, dans un contexte qui parle de
      // téléchargement : c'est la déduction interdite.
      if (/reason\s*===?\s*'(purchase|granted)'[\s\S]{0,120}(telecharg|download)/i.test(source)) {
        coupables.push(chemin(fichier));
      }
      if (/(telecharg|download)[\s\S]{0,120}reason\s*===?\s*'(purchase|granted)'/i.test(source)) {
        coupables.push(chemin(fichier));
      }
    }

    expect(coupables).toEqual([]);
  });

  it('aucun composant ne formate un montant lui-même', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE FRANC CFA N'A PAS DE SOUS-UNITÉ.                                │
    // │                                                                    │
    // │ 500 vaut 500 FCFA, quand 500 vaut 5,00 €. Une division par cent    │
    // │ écrite dans un composant multiplierait par cent l'erreur sur une   │
    // │ zone entière. Le serveur rend `prix.affichage`, déjà formaté par   │
    // │ `src/domain/money`, seule autorité sur le nombre de décimales.     │
    // └────────────────────────────────────────────────────────────────────┘
    const coupables: string[] = [];

    for (const fichier of sourcesInterface()) {
      const source = readFileSync(fichier, 'utf8');
      for (const motif of [
        /montant\s*\/\s*100/,
        /prix[\w.]*\s*\/\s*100/,
        /toFixed\(2\)/,
        /Intl\.NumberFormat/,
      ]) {
        if (motif.test(source)) coupables.push(`${chemin(fichier)} → ${String(motif)}`);
      }
    }

    expect(coupables).toEqual([]);
  });

  it('aucun composant n’additionne des montants', () => {
    // Le total d'un panier vient de `PUT /api/orders`, jamais d'une addition :
    // il dépend de la zone d'ENCAISSEMENT, que seule la commande connaît.
    const coupables = sourcesInterface()
      .filter((f) => /\.reduce\([\s\S]{0,160}(prix_unitaire|montant)/.test(readFileSync(f, 'utf8')))
      .map(chemin);

    expect(coupables).toEqual([]);
  });

  it('aucun composant ne compare une date à l’horloge du NAVIGATEUR', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Sous horloge simulée, l'horloge du navigateur n'est pas celle du   │
    // │ serveur. Un abonnement « qui expire dans trois jours » s'y         │
    // │ afficherait comme expiré depuis six mois.                          │
    // │                                                                    │
    // │ Toute date de référence vient de `GET /api/time`.                  │
    // └────────────────────────────────────────────────────────────────────┘
    const coupables: string[] = [];

    for (const fichier of sourcesInterface()) {
      const source = readFileSync(fichier, 'utf8');
      if (/Date\.now\(\)|new Date\(\s*\)/.test(source)) {
        coupables.push(chemin(fichier));
      }
    }

    expect(coupables).toEqual([]);
  });

  it('aucun composant ne recalcule la fenêtre de nouveauté', () => {
    // Elle dépend de `fenetre_nouveaute_jours`, que l'administration déplace à
    // la seconde ET rétroactivement. L'API rend `abonnement_a_partir_du`.
    const coupables = sourcesInterface()
      .filter((f) =>
        /fenetre_nouveaute|90\s*\*\s*24|publie_le[\s\S]{0,80}[+-][\s\S]{0,40}jours/i.test(
          readFileSync(f, 'utf8'),
        ),
      )
      .map(chemin);

    expect(coupables).toEqual([]);
  });
});

describe('ÉTATS ET COMPOSANTS PARTAGÉS, JAMAIS RECOPIÉS', () => {
  it('aucun écran ne fabrique son propre indicateur de chargement', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Treize écrans qui réinventent chacun leur affichage produisent     │
    // │ treize comportements sur connexion lente — la condition la plus    │
    // │ courante de cette audience, et celle qu'on voit le moins en        │
    // │ écrivant le code.                                                  │
    // └────────────────────────────────────────────────────────────────────┘
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ LA RÈGLE VISE LA FABRICATION, PAS LA MENTION.                    │
    // │                                                                  │
    // │ Une première version cherchait les mots « rotor » et « spinner » │
    // │ n'importe où. Elle a signalé `loading.tsx`, dont le COMMENTAIRE   │
    // │ explique justement qu'il emploie un squelette *et non un rotor*.  │
    // │                                                                  │
    // │ Un consommateur des états partagés les IMPORTE. Un fabricant, non │
    // │ — c'est cette distinction qui sépare les deux, et non le          │
    // │ vocabulaire employé pour la décrire.                              │
    // └──────────────────────────────────────────────────────────────────┘
    // La COUCHE PARTAGÉE est celle qui a le droit de fabriquer : c'est sa
    // fonction. La règle vise les écrans et les composants de domaine, qui
    // doivent la consommer.
    const partages = ['etats', 'base'].map((dossier) =>
      join(RACINE, 'src', 'components', dossier).replace(/\\/g, '/'),
    );

    const coupables = sourcesInterface()
      .filter((f) => !partages.some((p) => f.replace(/\\/g, '/').startsWith(p)))
      .filter((fichier) => {
        const source = readFileSync(fichier, 'utf8');
        const fabrique =
          /@keyframes|animation:\s|aria-busy=|role=['"]status['"]/.test(source);
        const consomme = /from '@\/components\/etats'/.test(source);
        return fabrique && !consomme;
      })
      .map(chemin);

    expect(coupables).toEqual([]);
  });

  it('aucune chaîne visible n’est écrite en dur dans un composant', () => {
    // Tout texte affiché passe par `traduire()`. Une chaîne en dur est
    // intraduisible, et ne se découvre qu'en basculant l'interface en anglais
    // — c'est-à-dire jamais, sur un poste francophone.
    const coupables: string[] = [];

    for (const fichier of sourcesInterface()) {
      const source = readFileSync(fichier, 'utf8');
      // Du texte entre balises, contenant au moins deux mots dont un accentué
      // ou une majuscule initiale : la signature d'une phrase, pas d'un
      // identifiant.
      for (const trouve of source.matchAll(/>\s*([A-ZÀ-Ü][\wÀ-ÿ']+(?:\s+[\wÀ-ÿ']+){2,})\s*</g)) {
        coupables.push(`${chemin(fichier)} → ${(trouve[1] ?? '').slice(0, 40)}`);
      }
    }

    expect(coupables).toEqual([]);
  });
});

describe('LE CONTRAT D’API NE REDÉCLARE AUCUN CHAMP MÉTIER', () => {
  it('dérive des types du domaine plutôt que de les recopier', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Le backend connaît déjà la forme de ce qu'il rend. Redécrire       │
    // │ `EntreeCatalogue` à la main pour le frontend en ferait une         │
    // │ TROISIÈME source de vérité, après le SQL et le TypeScript serveur. │
    // └────────────────────────────────────────────────────────────────────┘
    const contrat = readFileSync(join(RACINE, 'src', 'domain', 'api', 'contract.ts'), 'utf8');

    for (const type of ['EntreeCatalogue', 'AccessDecision', 'PrixAffiche', 'RegionConte']) {
      expect(contrat, `${type} doit être importé, jamais redéclaré`).not.toMatch(
        new RegExp(`interface\\s+${type}\\b`),
      );
      expect(contrat).toContain(type);
    }

    expect(contrat).toMatch(/from '@\/domain\/catalog\/types'/);
    expect(contrat).toMatch(/from '@\/domain\/access\/types'/);
  });
});
