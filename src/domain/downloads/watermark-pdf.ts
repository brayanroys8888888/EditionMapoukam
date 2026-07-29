import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

import { mentionFiligrane } from './copie';

/**
 * Filigrane d'un PDF — §9.4, §10.2.
 *
 * Module PUR : des octets entrent, des octets sortent. La police est FOURNIE
 * par l'appelant, pour que ce module ne touche jamais au disque.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DESSINÉ DANS LE FLUX DE CONTENU, JAMAIS EN ANNOTATION.                  │
 * │                                                                          │
 * │ Une annotation PDF — et à plus forte raison un calque — se retire d'un   │
 * │ clic dans n'importe quel éditeur, y compris gratuit et en ligne. Le      │
 * │ filigrane serait alors purement décoratif : présent à la livraison,      │
 * │ absent dès le premier partage, c'est-à-dire absent quand il sert.        │
 * │                                                                          │
 * │ `drawText` écrit dans le flux de contenu de la page, au même titre que   │
 * │ l'illustration. L'en retirer demande de reconstruire le flux — faisable, │
 * │ mais plus qu'un clic, et c'est tout ce qu'un DRM social vise.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SUR TOUTES LES PAGES, PAS SEULEMENT LA PREMIÈRE.                        │
 * │                                                                          │
 * │ Un filigrane en première page se retire en supprimant une page. Sur      │
 * │ quarante-huit pages, il faut quarante-huit interventions — et le fichier │
 * │ perd sa pagination si l'on s'y prend mal.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Marge et corps du pied de page, en points typographiques. */
const PIED = {
  margeBasse: 12,
  margeGauche: 18,
  corps: 6.5,
} as const;

/**
 * Opacité du pied de page.
 *
 * Assez visible pour dissuader — le lecteur doit voir son adresse — assez
 * discret pour ne pas gêner la lecture d'un album illustré destiné à un enfant.
 */
const OPACITE = 0.45;

export interface MetadonneesCopie {
  copieId: string;
  email: string;
  titre: string;
  auteur: string;
  /** Instant de génération. Fourni : la lecture directe de l'heure est interdite ici. */
  genereLe: Date;
}

/**
 * Applique le filigrane à un PDF.
 *
 * @param police octets d'une police TrueType. Voir plus bas pourquoi une
 *               police standard ne convient pas.
 * @throws si le PDF est illisible ou si l'écriture échoue. L'appelant ne doit
 *         JAMAIS retomber sur le fichier d'origine — voir `service.ts`.
 */
export async function filigranerPdf(
  pdf: Buffer,
  meta: MetadonneesCopie,
  police: Buffer,
): Promise<Buffer> {
  const document = await PDFDocument.load(pdf, {
    // Un PDF fourni par le client peut porter des anomalies bénignes que les
    // lecteurs tolèrent. Les refuser ici bloquerait un titre déjà vendu.
    ignoreEncryption: false,
    throwOnInvalidObject: false,
  });

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ POLICE EMBARQUÉE, ET C'EST INDISPENSABLE.                             │
  // │                                                                        │
  // │ Les polices standard de pdf-lib (`StandardFonts.Helvetica`) sont en    │
  // │ encodage WinAnsi et LÈVENT UNE EXCEPTION sur tout caractère hors de ce │
  // │ jeu. Une adresse email internationalisée — elles existent — ou un      │
  // │ simple caractère inattendu dans un titre ferait alors échouer la       │
  // │ génération, et l'acheteur n'obtiendrait jamais son fichier.            │
  // │                                                                        │
  // │ Une TrueType embarquée encode par la table de correspondance de la     │
  // │ police : un caractère absent rend le glyphe `.notdef` au lieu de lever.│
  // │ Le pied de page reste imparfait, le téléchargement aboutit.            │
  // │                                                                        │
  // │ `subset: true` n'embarque que les glyphes réellement employés —        │
  // │ quelques kilo-octets au lieu de quatre cents.                          │
  // └────────────────────────────────────────────────────────────────────────┘
  document.registerFontkit(fontkit);
  const fonte = await document.embedFont(police, { subset: true });

  const mention = mentionFiligrane(meta.email, meta.copieId);

  for (const page of document.getPages()) {
    dessinerPied(page, fonte, mention);
  }

  inscrireMetadonnees(document, meta);

  return Buffer.from(await document.save({ useObjectStreams: false }));
}

/** Écrit la mention en pied de page, dans le flux de contenu. */
function dessinerPied(
  page: ReturnType<PDFDocument['getPages']>[number],
  fonte: PDFFont,
  mention: string,
): void {
  const { width } = page.getSize();

  // La largeur est mesurée pour ne pas déborder : sur une page étroite, le
  // corps est réduit plutôt que la mention tronquée. Couper l'adresse email
  // rendrait la trace inexploitable, ce qui est tout ce qu'on lui demande.
  let corps = PIED.corps;
  const largeurUtile = width - PIED.margeGauche * 2;
  while (corps > 4 && fonte.widthOfTextAtSize(mention, corps) > largeurUtile) {
    corps -= 0.25;
  }

  page.drawText(mention, {
    x: PIED.margeGauche,
    y: PIED.margeBasse,
    size: corps,
    font: fonte,
    color: rgb(0.35, 0.35, 0.35),
    opacity: OPACITE,
  });
}

/**
 * Inscrit la copie dans les métadonnées du document.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUXIÈME COUCHE, INVISIBLE.                                             │
 * │                                                                          │
 * │ Si quelqu'un rogne le pied de page — au massicot numérique, en           │
 * │ recadrant les pages — la trace subsiste ici. C'est elle qui rend la      │
 * │ journalisation des téléchargements réellement exploitable : sans         │
 * │ identifiant retrouvable sur le fichier, le journal ne dit que « ces      │
 * │ vingt personnes ont téléchargé ce titre », ce qui ne désigne personne.   │
 * │                                                                          │
 * │ Les deux couches ne se remplacent pas : la visible dissuade, l'invisible │
 * │ identifie.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function inscrireMetadonnees(document: PDFDocument, meta: MetadonneesCopie): void {
  document.setTitle(meta.titre);
  document.setAuthor(meta.auteur);
  document.setSubject(`Exemplaire personnel — réf. ${meta.copieId}`);
  // Les mots-clés sont un tableau : l'identifiant y figure seul, ce qui le rend
  // cherchable tel quel par un outil d'inspection.
  document.setKeywords([`copie:${meta.copieId}`]);
  document.setProducer(`Éditions Mapoukam — exemplaire ${meta.copieId}`);
  document.setCreationDate(meta.genereLe);
  document.setModificationDate(meta.genereLe);
}
