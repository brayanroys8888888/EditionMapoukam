import { createServiceClient } from '@/lib/supabase/clients';
import { signer } from '@/lib/storage/signed-url';
import { servirPage } from './page-service';
import type { LangueInterface } from '@/i18n';

/**
 * LES PREMIÈRES PLANCHES D'UN TITRE, POUR LA BANDE D'APERÇU DE SA FICHE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN SECOND CHEMIN DE LECTURE — C'EST TOUT L'INTÉRÊT DE CE MODULE.     │
 * │                                                                          │
 * │ La table des pages porte le contenu vendu, et le serveur l'atteint avec  │
 * │ `service_role` : RLS ne rattrape rien à cet étage. La garantie tient à   │
 * │ un point de passage unique, `servirPage`, qui appelle `getAccess` AVANT  │
 * │ de lire quoi que ce soit. `book-pages-architecture.test.ts` interdit à   │
 * │ tout autre fichier de la nommer — et il lit le fichier ENTIER, ce        │
 * │ commentaire compris. C'est pourquoi elle n'est pas écrite ici.           │
 * │                                                                          │
 * │ Ce module APPELLE `servirPage`, page par page, et hérite de son          │
 * │ contrôle : un visiteur qui n'a droit qu'à l'extrait reçoit l'extrait, et │
 * │ rien de plus — la boucle s'arrête sur le premier refus, exactement là    │
 * │ où le moteur de droits la coupe.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX RÉSOLUTIONS, ET C'EST LE §5.1 QUI LE DEMANDE.                      │
 * │                                                                          │
 * │ Une bande de quatre vignettes de 112 px n'a aucune raison de télécharger │
 * │ quatre planches pleine définition sur une connexion mobile lente. La     │
 * │ vignette prend l'allégée, la planche affichée prend la haute.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface Planche {
  numero: number;
  /** URL signée de la planche affichée en grand. */
  url: string;
  /** URL signée de la vignette — même page, définition réduite. */
  vignette: string;
  /*
   * Les dimensions RÉELLES de la planche, quand l'ingestion les a relevées.
   * `null` sur un dépôt ancien : le rapport de forme est alors imposé par la
   * feuille de style, et une valeur inventée aurait fait sauter la mise en
   * page au chargement de l'image.
   */
  largeur: number | null;
  hauteur: number | null;
}

/**
 * Au plus huit planches.
 *
 * La bande d'aperçu n'est pas un lecteur : au-delà d'une rangée de vignettes,
 * elle cesse d'aider à choisir et devient une seconde façon de lire le titre.
 * C'est `/lire` qui feuillette, et lui seul.
 */
const PLAFOND = 8;

export async function lirePlanches(
  userId: string | null,
  bookId: string,
  langue: LangueInterface,
  options: { plafond?: number } = {},
): Promise<Planche[]> {
  const plafond = Math.min(options.plafond ?? PLAFOND, PLAFOND);
  const client = createServiceClient();
  const planches: Planche[] = [];

  for (let numero = 1; numero <= plafond; numero += 1) {
    const resultat = await servirPage(userId, { bookId, langue, numero }, { client });

    /*
     * Le premier refus ARRÊTE la boucle, quel qu'il soit.
     *
     * `page_introuvable` dit qu'on a atteint la fin du titre ; `hors_extrait`
     * dit qu'on a atteint la limite du droit. Les deux veulent dire « il n'y a
     * plus rien à montrer ici », et continuer ne ferait que payer des
     * allers-retours pour se faire refuser autant de fois.
     */
    if (!resultat.ok) break;

    const [haute, allegee] = await Promise.all([
      signer(resultat.page.cheminHaute, {
        livreGratuit: resultat.page.livreGratuit,
        client,
      }),
      signer(resultat.page.cheminAllegee, {
        livreGratuit: resultat.page.livreGratuit,
        client,
      }),
    ]);

    // Une planche dont l'objet manque au stockage n'est pas une anomalie de
    // droits : on la saute, et la bande montre les autres.
    if (!haute || !allegee) continue;

    planches.push({
      numero: resultat.page.numero,
      url: haute.url,
      vignette: allegee.url,
      largeur: resultat.page.largeur,
      hauteur: resultat.page.hauteur,
    });
  }

  return planches;
}
