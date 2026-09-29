import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { reinitialiserQuotaAdmin } from '@/lib/admin/route-helpers';
import { POST as depotRoute } from '@/app/api/admin/association/fichiers/route';
import {
  BUCKET_FICHIERS_ASSOCIATION,
  BUCKET_IMAGES_ASSOCIATION,
  estCheminAssociatif,
  mediaAssociatif,
} from '@/lib/storage/association';
import { createServiceClient } from '@/lib/supabase/clients';

import { closePool, queryOne } from '../helpers/db';
import { corpsJson, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * LE DÉPÔT DE FICHIERS DE L'ASSOCIATION — migration `0109`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST ÉPROUVÉ ICI EST LA LIGNE ENTRE LES DEUX BUCKET.              │
 * │                                                                          │
 * │ La couverture est PUBLIQUE — elle s'affiche sur les cartes de qui n'a    │
 * │ pas encore adhéré, et c'est ce qui donne envie d'adhérer. Tout le reste  │
 * │ est PRIVÉ : ces fichiers vivent dans le corps, que la base ne rend que   │
 * │ si `can_read` est vrai, et leur adresse seule ne doit servir à rien.     │
 * │                                                                          │
 * │ Le jour où un rôle basculerait du mauvais côté, RIEN ne casserait :      │
 * │ l'écran s'afficherait, les fichiers se liraient, et une fiche réservée   │
 * │ serait téléchargeable par son adresse. D'où ces deux sens éprouvés       │
 * │ SÉPARÉMENT.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let editeur: TestUser;
let intrus: TestUser;

/** Les chemins déposés pendant le fichier, à effacer à la fin. */
const deposes: string[] = [];

/** Un PNG minuscule mais VALIDE — la route lit ses octets de tête. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Un PDF minimal : la signature suffit à ce que la route accepte. */
const PDF = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1');

function requete(corps: FormData): Request {
  return new Request('http://localhost:3000/api/admin/association/fichiers', {
    method: 'POST',
    headers: { authorization: `Bearer ${editeur.accessToken}` },
    body: corps,
  });
}

async function deposer(
  role: string,
  contenu: Buffer,
  type: string,
  nom = 'essai',
): Promise<Response> {
  const corps = new FormData();
  corps.set('role', role);
  corps.set('fichier', new File([new Uint8Array(contenu)], nom, { type }));
  return depotRoute(requete(corps));
}

beforeAll(async () => {
  [editeur, intrus] = await Promise.all([createTestUser({ admin: true }), createTestUser()]);
});

beforeEach(() => {
  // Les routes d'administration sont contingentées : sans cette remise à zéro,
  // les derniers appels du fichier seraient refusés sans rapport avec le sujet.
  reinitialiserQuotaAdmin();
});

afterAll(async () => {
  const client = createServiceClient();
  for (const bucket of [BUCKET_IMAGES_ASSOCIATION, BUCKET_FICHIERS_ASSOCIATION]) {
    const chemins = deposes
      .filter((c) => c.startsWith(`${bucket}/`))
      .map((c) => c.slice(bucket.length + 1));
    if (chemins.length > 0) await client.storage.from(bucket).remove(chemins);
  }

  await deleteTestUser(editeur);
  await deleteTestUser(intrus);
  await closePool();
});

describe('les deux bucket existent, et ne sont pas du même côté du mur', () => {
  it('l’un est public, l’autre ne l’est pas', async () => {
    const images = await queryOne<{ public: boolean }>(
      'select public from storage.buckets where id = $1',
      [BUCKET_IMAGES_ASSOCIATION],
    );
    const fichiers = await queryOne<{ public: boolean }>(
      'select public from storage.buckets where id = $1',
      [BUCKET_FICHIERS_ASSOCIATION],
    );

    expect(images?.public).toBe(true);
    expect(fichiers?.public).toBe(false);
  });

  it('le bucket privé porte un refus EXPLICITE pour les rôles clients', async () => {
    /*
     * `storage.objects` a déjà RLS sans politique, donc tout serait refusé de
     * toute façon. La politique explicite est là pour que l'intention se LISE
     * dans le schéma plutôt que se déduise d'une absence — et pour qu'un
     * `grant` distrait, plus tard, ne suffise pas à ouvrir la porte.
     */
    const politique = await queryOne<{ nom: string }>(
      `select policyname as nom from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'association_fichiers_aucun_acces_client'`,
    );

    expect(politique).not.toBeNull();
  });
});

describe('la route de dépôt', () => {
  it('range une COUVERTURE dans le bucket public', async () => {
    const reponse = await deposer('couverture', PNG, 'image/png');
    expect(reponse.status).toBe(201);

    const { chemin } = await corpsJson<{ chemin: string }>(reponse);
    deposes.push(chemin);

    expect(chemin.startsWith(`${BUCKET_IMAGES_ASSOCIATION}/`)).toBe(true);
  });

  it('range une PHOTO DE CORPS dans le bucket privé — même format, autre public', async () => {
    /*
     * Le rôle décide, pas le format. Trancher sur le format mettrait la photo
     * d'un article réservé en accès libre, avec la couverture.
     */
    const reponse = await deposer('photo', PNG, 'image/png');
    expect(reponse.status).toBe(201);

    const { chemin } = await corpsJson<{ chemin: string }>(reponse);
    deposes.push(chemin);

    expect(chemin.startsWith(`${BUCKET_FICHIERS_ASSOCIATION}/`)).toBe(true);
  });

  it('range une FICHE PDF dans le bucket privé', async () => {
    const reponse = await deposer('document', PDF, 'application/pdf');
    expect(reponse.status).toBe(201);

    const { chemin } = await corpsJson<{ chemin: string }>(reponse);
    deposes.push(chemin);

    expect(chemin.startsWith(`${BUCKET_FICHIERS_ASSOCIATION}/`)).toBe(true);
  });

  it('rend AUSSI une adresse d’aperçu, qui n’est pas celle qu’on stocke', async () => {
    /*
     * Deux valeurs, à ne pas confondre. `chemin` part en base ; `apercu` ne
     * sert qu'à l'écran. Sans lui, le fichier qu'on vient de déposer apparaît
     * cassé — le champ porte un chemin de stockage, qu'un navigateur prend
     * pour une adresse relative. L'éditeur croirait son dépôt raté.
     *
     * Et l'inverse compte autant : écrire l'aperçu en base y poserait une URL
     * signée, périmée cinq minutes plus tard.
     */
    const reponse = await deposer('document', PDF, 'application/pdf');
    const { chemin, apercu } = await corpsJson<{ chemin: string; apercu: string }>(reponse);
    deposes.push(chemin);

    expect(chemin.startsWith(`${BUCKET_FICHIERS_ASSOCIATION}/`)).toBe(true);
    expect(apercu).toContain('token=');
    expect(apercu).not.toBe(chemin);
  });

  it('JETTE le nom d’origine — il ne sert à rien et il se devine', async () => {
    /*
     * Un nom lisible se déduit d'un autre : `atelier-douala.pdf` et
     * `atelier-yaounde.pdf`. Sur le bucket public, cela suffirait à trouver ce
     * qui n'a pas encore été annoncé. Ce qui compte du nom — l'extension — est
     * redéduit du type MIME, que la route a vérifié contre les octets.
     */
    const reponse = await deposer('couverture', PNG, 'image/png', 'Atelier de Douala — 2026.png');
    const { chemin } = await corpsJson<{ chemin: string }>(reponse);
    deposes.push(chemin);

    expect(chemin).not.toContain('Atelier');
    expect(chemin).not.toContain(' ');
    expect(chemin.endsWith('.png')).toBe(true);
  });

  it('REFUSE un fichier dont les octets démentent le type annoncé', async () => {
    /*
     * `file.type` est déclaré par le navigateur, et un navigateur se pilote.
     * Un exécutable renommé `.png` passe le contrôle de format et celui de
     * taille sans broncher ; seuls les octets de tête le démentent.
     */
    const reponse = await deposer('couverture', Buffer.from('MZ\u0090\u0000ce n’est pas une image'), 'image/png');

    // 400 `requete_invalide` : la convention du dépôt pour une entrée qui ne
    // passe pas les contrôles, la même que pour un champ hors bornes.
    expect(reponse.status).toBe(400);
    const details = await corpsJson<ReponseErreur & { erreur: { champs?: Record<string, string[]> } }>(
      reponse,
    );
    expect(JSON.stringify(details)).toContain('format');
  });

  it('REFUSE un format que le rôle n’accepte pas', async () => {
    // Une vidéo à la place d'une couverture : rien ne l'afficherait, et le
    // plafond du bucket public la refuserait bien plus tard.
    const reponse = await deposer('couverture', PDF, 'application/pdf');
    expect(reponse.status).toBe(400);
  });

  it('REFUSE un rôle inconnu', async () => {
    const reponse = await deposer('n-importe-quoi', PNG, 'image/png');
    expect(reponse.status).toBe(400);
  });

  it('REFUSE un non-administrateur, et un visiteur', async () => {
    const corps = new FormData();
    corps.set('role', 'couverture');
    corps.set('fichier', new File([new Uint8Array(PNG)], 'a.png', { type: 'image/png' }));

    const parIntrus = await depotRoute(
      new Request('http://localhost:3000/api/admin/association/fichiers', {
        method: 'POST',
        headers: { authorization: `Bearer ${intrus.accessToken}` },
        body: corps,
      }),
    );
    // 404 et non 403 : « vous n'avez pas accès » confirmerait qu'il y a une
    // administration à cette adresse.
    expect([403, 404]).toContain(parIntrus.status);

    const corpsAnonyme = new FormData();
    corpsAnonyme.set('role', 'couverture');
    corpsAnonyme.set('fichier', new File([new Uint8Array(PNG)], 'a.png', { type: 'image/png' }));
    const parVisiteur = await depotRoute(
      new Request('http://localhost:3000/api/admin/association/fichiers', {
        method: 'POST',
        body: corpsAnonyme,
      }),
    );
    expect([401, 404]).toContain(parVisiteur.status);
  });
});

describe('servir un fichier déposé', () => {
  it('rend une adresse collée à la main TELLE QUELLE', async () => {
    /*
     * Les huit contenus déjà en base portent des adresses écrites à la main.
     * Les couper viderait l'écran, et migrer des fichiers qui ne nous
     * appartiennent pas n'est pas au programme.
     */
    expect(estCheminAssociatif('/images/association/logo-dave.jpg')).toBe(false);
    expect(await mediaAssociatif('https://exemple.test/a.mp4')).toBe('https://exemple.test/a.mp4');
  });

  it('rend la couverture en URL PUBLIQUE — donc cachable', async () => {
    const reponse = await deposer('couverture', PNG, 'image/png');
    const { chemin } = await corpsJson<{ chemin: string }>(reponse);
    deposes.push(chemin);

    const url = await mediaAssociatif(chemin);

    expect(url).toContain('/storage/v1/object/public/');
    // Pas de signature : une couverture doit survivre au CDN, et §5.1 rappelle
    // qu'une part importante du public est sur réseau lent.
    expect(url).not.toContain('token=');
  });

  it('rend un fichier privé en URL SIGNÉE, et jamais en clair', async () => {
    const reponse = await deposer('document', PDF, 'application/pdf');
    const { chemin } = await corpsJson<{ chemin: string }>(reponse);
    deposes.push(chemin);

    const url = await mediaAssociatif(chemin);

    expect(url).toContain('/object/sign/');
    expect(url).toContain('token=');
    expect(url).not.toContain('/object/public/');
  });
});
