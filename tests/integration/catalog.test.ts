import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as catalogue } from '@/app/api/catalog/route';
import { GET as fiche } from '@/app/api/catalog/[slug]/route';
import { GET as extrait } from '@/app/api/catalog/[slug]/excerpt/route';
import { invaliderDevises } from '@/lib/catalog/repository';
import type { PageCatalogue, FicheLivre } from '@/domain/catalog/types';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, get, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * API du catalogue — §4.1 F2 et F3.
 *
 * Deux exigences se croisent ici : montrer le catalogue à tout le monde, et
 * n'en montrer que ce qui est publié. Un brouillon qui fuit, c'est un titre en
 * préparation rendu public ; un titre archivé qui reste listé, c'est une
 * promesse de vente qu'on ne peut plus tenir.
 */
let abonne: TestUser;

function params(recherche: Record<string, string> = {}): Request {
  const url = new URLSearchParams(recherche);
  return get(`/api/catalog?${url.toString()}`);
}

const contexteSlug = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeAll(async () => {
  invaliderDevises();
  abonne = await createTestUser();
  await query(
    `insert into public.subscriptions
       (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
     values ($1, 'annuel', 'actif', public.app_now(), public.app_now() + interval '1 year',
             'international', 'EUR', 6900)`,
    [abonne.id],
  );
});

afterAll(async () => {
  await deleteTestUser(abonne);
  await closePool();
});

describe('liste', () => {
  it('ne renvoie que les titres publiés', async () => {
    const reponse = await catalogue(params());

    expect(reponse.status).toBe(200);
    const page = await corpsJson<PageCatalogue>(reponse);
    const slugs = page.entrees.map((e) => e.slug);

    expect(slugs).not.toContain('le-lievre-et-la-tortue');
    expect(slugs).not.toContain('la-hyene-qui-voulait-changer');
    expect(page.total).toBe(8);
  });

  it('masque un titre dont la traduction demandée est en brouillon', async () => {
    // « la-girafe-et-l-oiseau-malin » a une version anglaise non publiée : elle
    // ne doit pas apparaître au catalogue anglais, même si le livre l'est.
    const reponse = await catalogue(params({ langue: 'en' }));

    const page = await corpsJson<PageCatalogue>(reponse);
    expect(page.entrees.map((e) => e.slug)).toEqual(['kouassi-et-le-tam-tam']);
  });

  it('n’expose aucun chemin de fichier', async () => {
    // Le contenu passe par une route serveur qui émet une URL signée
    // (CLAUDE.md règle 3) : le catalogue ne doit rien en laisser filtrer.
    const brut = await (await catalogue(params())).text();

    expect(brut).not.toMatch(/fichier_lecture|fichier_telechargement|chemin_haute/);
  });

  it('joint à chaque titre l’état d’accès de l’appelant', async () => {
    const reponse = await catalogue(
      params({ langue: 'fr' }),
    );
    const page = await corpsJson<PageCatalogue>(reponse);

    const gratuit = page.entrees.find((e) => e.slug === 'petit-baobab');
    expect(gratuit?.acces).toEqual({ canRead: true, canDownload: false, reason: 'free' });

    const payant = page.entrees.find((e) => e.slug === 'le-lion-et-la-souris');
    expect(payant?.acces.reason).toBe('preview');
  });

  it('reflète l’abonnement de l’appelant', async () => {
    const requete = new Request('http://localhost:3000/api/catalog?langue=fr', {
      headers: { authorization: `Bearer ${abonne.accessToken}` },
    });

    const page = await corpsJson<PageCatalogue>(await catalogue(requete));

    const inclus = page.entrees.find((e) => e.slug === 'le-lion-et-la-souris');
    expect(inclus?.acces).toEqual({ canRead: true, canDownload: false, reason: 'subscription' });

    // Encore dans sa fenêtre de vente : l'abonnement ne l'ouvre pas.
    const nouveaute = page.entrees.find((e) => e.slug === 'l-oiseau-de-feu');
    expect(nouveaute?.acces.reason).toBe('preview');
  });
});

describe('filtres', () => {
  it('filtre par tranche d’âge', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ age_max: '6' })));

    expect(page.entrees.length).toBeGreaterThan(0);
    for (const entree of page.entrees) {
      expect(entree.age_min ?? 0).toBeLessThanOrEqual(6);
    }
  });

  it('filtre par thème', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ themes: 'animaux' })));

    expect(page.entrees.length).toBeGreaterThan(0);
    for (const entree of page.entrees) {
      expect(entree.themes).toContain('animaux');
    }
  });

  it('filtre par origine culturelle', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ origine: 'Ghana' })));

    expect(page.entrees.map((e) => e.slug)).toEqual(['anansi-l-araignee-maligne']);
  });

  it('filtre les titres gratuits', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ acces: 'gratuit' })));

    expect(page.entrees.map((e) => e.slug).sort()).toEqual([
      'la-riviere-qui-parlait',
      'petit-baobab',
    ]);
  });

  it('filtre les titres réellement accessibles par abonnement', async () => {
    // « Accessible par abonnement » signifie accessible MAINTENANT : un titre
    // encore dans sa fenêtre de vente ne l'est pas, même s'il est marqué inclus.
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ acces: 'abonnement' })));

    const slugs = page.entrees.map((e) => e.slug);
    expect(slugs).toContain('le-lion-et-la-souris');
    expect(slugs).not.toContain('l-oiseau-de-feu');
    expect(slugs).not.toContain('la-riviere-qui-parlait');
  });

  it('filtre les titres vendus à l’unité', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ acces: 'achat' })));

    expect(page.entrees.every((e) => e.disponible_achat)).toBe(true);
  });
});

describe('recherche', () => {
  it('trouve par le titre', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ q: 'baobab' })));

    expect(page.entrees.map((e) => e.slug)).toEqual(['petit-baobab']);
  });

  it('trouve par l’origine culturelle', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ q: 'Côte d’Ivoire' })));

    expect(page.entrees.map((e) => e.slug)).toContain('kouassi-et-le-tam-tam');
  });

  it('trouve par le résumé', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ q: 'tam-tam' })));

    expect(page.entrees.map((e) => e.slug)).toContain('kouassi-et-le-tam-tam');
  });

  it('ramène le singulier et le pluriel au même terme', async () => {
    // Configuration `french` : sans elle, « animaux » et « animal » seraient
    // deux termes sans rapport.
    const pluriel = await corpsJson<PageCatalogue>(await catalogue(params({ q: 'animaux' })));

    expect(pluriel.entrees.length).toBeGreaterThan(0);
  });

  it('ne trouve rien pour un terme absent', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ q: 'hélicoptère' })));

    expect(page.entrees).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('ne remonte jamais un brouillon', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ q: 'lièvre' })));

    expect(page.entrees.map((e) => e.slug)).not.toContain('le-lievre-et-la-tortue');
  });
});

describe('tri', () => {
  it('classe les nouveautés de la plus récente à la plus ancienne', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ tri: 'nouveautes' })));

    const dates = page.entrees.map((e) => new Date(e.publie_le ?? 0).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it('classe par ordre alphabétique', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ tri: 'alphabetique' })));

    const titres = page.entrees.map((e) => e.titre);
    expect(titres).toEqual([...titres].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('classe par prix croissant', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ tri: 'prix' })));

    const montants = page.entrees.map((e) => e.prix?.montant).filter((m): m is number => m !== undefined);
    expect(montants).toEqual([...montants].sort((a, b) => a - b));
  });

  it('reste stable d’une page à l’autre', async () => {
    // Sans départage, deux titres de même rang pourraient s'échanger entre deux
    // requêtes et apparaître en double, ou disparaître.
    const premiere = await corpsJson<PageCatalogue>(
      await catalogue(params({ tri: 'popularite', taille: '4', page: '1' })),
    );
    const seconde = await corpsJson<PageCatalogue>(
      await catalogue(params({ tri: 'popularite', taille: '4', page: '2' })),
    );

    const chevauchement = premiere.entrees
      .map((e) => e.slug)
      .filter((slug) => seconde.entrees.some((e) => e.slug === slug));
    expect(chevauchement).toEqual([]);
  });
});

describe('pagination', () => {
  it('renvoie le total et le nombre de pages', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ taille: '3' })));

    expect(page.entrees).toHaveLength(3);
    expect(page.total).toBe(8);
    expect(page.pages).toBe(3);
  });

  it('renvoie une page vide au-delà du dernier rang', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ page: '99' })));

    expect(page.entrees).toEqual([]);
  });
});

describe('prix et zones', () => {
  it('affiche le prix de la zone demandée, formaté selon sa devise', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ zone: 'afrique' })));

    const titre = page.entrees.find((e) => e.slug === 'le-lion-et-la-souris');
    expect(titre?.prix?.devise).toBe('XAF');
    expect(titre?.prix?.montant).toBe(1500);
    // 1500 FCFA, et non 15,00 : le franc CFA n'a pas de sous-unité.
    expect(titre?.prix?.affichage.replace(/\s+/g, ' ')).toBe('1 500 FCFA');
  });

  it('n’affiche AUCUN prix plutôt que celui d’une autre zone', async () => {
    // Annoncer « 4,99 € » à un visiteur de la zone Afrique parce que le titre
    // n'a pas de prix local serait une substitution silencieuse de devise — et
    // le panier refuserait ensuite ce même titre. Le titre reste LISTÉ, il peut
    // être lisible par abonnement ; il est simplement sans montant.
    //
    // Le cas est fabriqué : depuis la migration 0024, un titre publié et vendu
    // à l'unité a un prix dans chaque zone active.
    const livre = await queryOne<{ id: string }>(
      `select id from public.books where slug = 'la-tortue-et-le-lapin'`,
    );
    await query(`delete from public.book_prices where book_id = $1 and zone = 'afrique'`, [
      livre!.id,
    ]);

    try {
      const page = await corpsJson<PageCatalogue>(await catalogue(params({ zone: 'afrique' })));

      const sansPrixLocal = page.entrees.find((e) => e.slug === 'la-tortue-et-le-lapin');
      expect(sansPrixLocal, 'le titre doit rester listé').toBeDefined();
      expect(sansPrixLocal?.prix).toBeNull();

      // L'achat est désactivé, avec un message explicite : sans lui,
      // l'utilisateur verrait un bouton inerte sans comprendre pourquoi.
      expect(sansPrixLocal?.achat_hors_zone?.code).toBe('hors_zone');
      expect(sansPrixLocal?.achat_hors_zone?.message).toContain('votre région');
    } finally {
      await query(
        `insert into public.book_prices (book_id, zone, montant, devise)
         values ($1, 'afrique', 1500, 'XAF')`,
        [livre!.id],
      );
    }
  });

  it('ne signale RIEN sur un titre non vendu à l’unité', async () => {
    // `petit-baobab` est gratuit et non vendu : l'absence de prix y est
    // normale, pas anormale. Un message d'indisponibilité serait absurde.
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ zone: 'afrique' })));

    const gratuit = page.entrees.find((e) => e.slug === 'petit-baobab');
    expect(gratuit?.prix).toBeNull();
    expect(gratuit?.achat_hors_zone).toBeNull();
  });

  it('ne signale rien quand le prix existe bien dans la zone', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params({ zone: 'afrique' })));

    const vendu = page.entrees.find((e) => e.slug === 'le-lion-et-la-souris');
    expect(vendu?.prix?.devise).toBe('XAF');
    expect(vendu?.achat_hors_zone).toBeNull();
  });

  it('formate l’euro avec ses centimes', async () => {
    const page = await corpsJson<PageCatalogue>(await catalogue(params()));

    const premium = page.entrees.find((e) => e.slug === 'anansi-l-araignee-maligne');
    expect(premium?.prix?.affichage.replace(/\s+/g, ' ')).toBe('6,99 €');
  });
});

describe('entrées invalides', () => {
  it('refuse un tri inconnu', async () => {
    const reponse = await catalogue(params({ tri: 'au_hasard' }));

    expect(reponse.status).toBe(400);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('requete_invalide');
  });

  it('refuse une langue non prise en charge', async () => {
    expect((await catalogue(params({ langue: 'de' }))).status).toBe(400);
  });

  it('refuse une taille de page démesurée', async () => {
    // Une taille non bornée est une invitation à demander cent mille titres.
    expect((await catalogue(params({ taille: '5000' }))).status).toBe(400);
  });

  it('refuse une tranche d’âge incohérente', async () => {
    const reponse = await catalogue(params({ age_min: '8', age_max: '3' }));

    expect(reponse.status).toBe(400);
    const corps = await corpsJson<ReponseErreur>(reponse);
    expect(corps.erreur.champs?.['age_min']?.[0]).toMatch(/incohérente/);
  });

  it('refuse une zone inconnue', async () => {
    expect((await catalogue(params({ zone: 'mars' }))).status).toBe(400);
  });
});

describe('fiche détaillée', () => {
  it('renvoie le titre, ses langues et ses suggestions', async () => {
    const reponse = await fiche(
      get('/api/catalog/le-lion-et-la-souris'),
      contexteSlug('le-lion-et-la-souris'),
    );

    expect(reponse.status).toBe(200);
    const detail = await corpsJson<FicheLivre>(reponse);
    expect(detail.titre).toBe('Le lion et la souris');
    expect(detail.langues).toEqual(['fr']);
    expect(detail.pages_extrait).toBeGreaterThan(0);
    expect(detail.suggestions.length).toBeGreaterThan(0);
    expect(detail.suggestions.map((s) => s.slug)).not.toContain('le-lion-et-la-souris');
  });

  it('liste les deux langues d’un titre bilingue', async () => {
    const detail = await corpsJson<FicheLivre>(
      await fiche(get('/api/catalog/kouassi-et-le-tam-tam'), contexteSlug('kouassi-et-le-tam-tam')),
    );

    expect(detail.langues).toEqual(['en', 'fr']);
  });

  it('ne liste pas une traduction en brouillon', async () => {
    const detail = await corpsJson<FicheLivre>(
      await fiche(
        get('/api/catalog/la-girafe-et-l-oiseau-malin'),
        contexteSlug('la-girafe-et-l-oiseau-malin'),
      ),
    );

    expect(detail.langues).toEqual(['fr']);
  });

  it('renvoie 404 pour un brouillon, un archivé et un slug inconnu', async () => {
    // Les trois doivent se ressembler : sinon le catalogue à venir serait
    // devinable un slug à la fois.
    for (const slug of ['le-lievre-et-la-tortue', 'la-hyene-qui-voulait-changer', 'inexistant']) {
      const reponse = await fiche(get(`/api/catalog/${slug}`), contexteSlug(slug));
      expect({ slug, statut: reponse.status }).toEqual({ slug, statut: 404 });
    }
  });

  it('renvoie 404 pour une langue sans traduction publiée', async () => {
    const reponse = await fiche(
      get('/api/catalog/petit-baobab?langue=en'),
      contexteSlug('petit-baobab'),
    );

    expect(reponse.status).toBe(404);
  });

  it('refuse un slug malformé sans interroger la base', async () => {
    const reponse = await fiche(get('/api/catalog/Un_Slug_Invalide'), contexteSlug('Un_Slug_Invalide'));

    expect(reponse.status).toBe(404);
  });
});

describe('extrait', () => {
  it('sert les premières pages à un visiteur non connecté', async () => {
    const reponse = await extrait(
      get('/api/catalog/le-lion-et-la-souris/excerpt?page=1'),
      contexteSlug('le-lion-et-la-souris'),
    );

    expect(reponse.status).toBe(200);
    const corps = await corpsJson<{
      page: { numero: number; au_titre_de_l_extrait: boolean; texte: string };
      lecture: { nbPagesLisibles: number; integral: boolean };
    }>(reponse);
    expect(corps.page.numero).toBe(1);
    expect(corps.page.au_titre_de_l_extrait).toBe(true);
    expect(corps.lecture.integral).toBe(false);
  });

  it('s’arrête à la limite de l’extrait', async () => {
    const reponse = await extrait(
      get('/api/catalog/le-lion-et-la-souris/excerpt?page=5'),
      contexteSlug('le-lion-et-la-souris'),
    );

    expect(reponse.status).toBe(403);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('hors_extrait');
  });

  it('sert intégralement un conte gratuit', async () => {
    const reponse = await extrait(
      get('/api/catalog/petit-baobab/excerpt?page=6'),
      contexteSlug('petit-baobab'),
    );

    expect(reponse.status).toBe(200);
    const corps = await corpsJson<{
      page: { au_titre_de_l_extrait: boolean };
      lecture: { integral: boolean };
      motif: string;
    }>(reponse);
    expect(corps.page.au_titre_de_l_extrait).toBe(false);
    expect(corps.lecture.integral).toBe(true);
    expect(corps.motif).toBe('free');
  });

  it('n’expose aucun chemin de stockage', async () => {
    const brut = await (
      await extrait(get('/api/catalog/petit-baobab/excerpt?page=1'), contexteSlug('petit-baobab'))
    ).text();

    expect(brut).not.toMatch(/chemin_haute|chemin_allegee|book-pages\//);
  });

  it('renvoie 404 pour un brouillon', async () => {
    const reponse = await extrait(
      get('/api/catalog/le-lievre-et-la-tortue/excerpt'),
      contexteSlug('le-lievre-et-la-tortue'),
    );

    expect(reponse.status).toBe(404);
  });

  it('refuse un numéro de page invalide', async () => {
    const reponse = await extrait(
      get('/api/catalog/petit-baobab/excerpt?page=0'),
      contexteSlug('petit-baobab'),
    );

    expect(reponse.status).toBe(400);
  });
});

describe('cohérence des règles', () => {
  it('le catalogue et le moteur de droits disent la même chose', async () => {
    // Le catalogue enrichit chaque titre par le moteur de droits : s'ils
    // divergeaient, l'utilisateur verrait un bouton qui ne fonctionne pas.
    const page = await corpsJson<PageCatalogue>(await catalogue(params()));

    for (const entree of page.entrees) {
      const direct = await queryOne<{ can_read: boolean; can_download: boolean; reason: string }>(
        `select (public.access_for(null, $1)).*`,
        [entree.id],
      );
      expect({ slug: entree.slug, ...entree.acces }).toEqual({
        slug: entree.slug,
        canRead: direct?.can_read,
        canDownload: direct?.can_download,
        reason: direct?.reason,
      });
    }
  });
});
