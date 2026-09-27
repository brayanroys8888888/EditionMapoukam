"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { traduire, type LangueInterface } from "@/i18n";
import styles from "./admin.module.css";

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ L'APERÇU DE COUVERTURE, AVANT LE DÉPÔT.                                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QU'IL MONTRE EST EXACTEMENT CE QUE L'INGESTION PRODUIRA.              │
 * │                                                                          │
 * │ `src/lib/ingestion/cover.ts` définit la couverture comme la PREMIÈRE     │
 * │ PAGE du PDF, rendue par `@hyzyla/pdfium`. Cet aperçu fait le même geste,  │
 * │ avec le même moteur, dans le navigateur : ce n'est pas une approximation │
 * │ ni une vignette d'un autre dessin — c'est le rendu que la chaîne          │
 * │ déposera, quelques secondes plus tard.                                    │
 * │                                                                          │
 * │ Sans lui, l'éditeur dépose à l'aveugle : il découvre la couverture sur    │
 * │ la fiche, après création d'un brouillon qu'il faudra supprimer si le PDF  │
 * │ n'était pas le bon. Le geste de correction coûte plus cher que le dépôt.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL NE DÉPOSE RIEN, ET C'EST UNE RÈGLE, PAS UNE ÉCONOMIE.                │
 * │                                                                          │
 * │ `covers-architecture` interdit qu'une couverture soit publiée ailleurs   │
 * │ que par `src/lib/storage/covers.ts`. Ce composant ne touche donc à aucun │
 * │ stockage : il lit le fichier que le visiteur vient de choisir, dans SA   │
 * │ mémoire, et dessine sur une toile. Rien ne quitte le navigateur tant que │
 * │ le formulaire n'est pas envoyé.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MOTEUR NE DESCEND QU'AU MOMENT DU CHOIX.                             │
 * │                                                                          │
 * │ `pdfium.wasm` pèse quatre mégaoctets. Il est chargé par un `import()`    │
 * │ dynamique, déclenché par le premier fichier choisi — jamais à            │
 * │ l'affichage de la page. Un éditeur qui ouvre l'écran et repart n'aura    │
 * │ rien téléchargé.                                                         │
 * │                                                                          │
 * │ §5.1 vise le public du site, pas le back-office ; mais quatre mégaoctets │
 * │ servis sans qu'on les ait demandés restent quatre mégaoctets.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** L'identifiant du champ de dépôt, tel que l'écran d'ajout le pose. */
const CHAMP_FICHIER = "conte-fichier";

/**
 * Largeur de rendu, en pixels.
 *
 * 620 px : la colonne fait au plus 420 px, et un écran à deux fois la densité
 * y consomme le double. Au-delà on rendrait des pixels que personne ne voit,
 * sur un moteur qui travaille en mémoire dans l'onglet de l'éditeur.
 */
const LARGEUR_RENDU = 620;

type Etat =
  | { phase: "vide" }
  | { phase: "lecture" }
  | { phase: "pret"; largeur: number; hauteur: number }
  | { phase: "echec"; cause: "illisible" | "protege" };

export function ApercuCouverture({
  langue,
}: {
  langue: LangueInterface;
}): ReactNode {
  const toile = useRef<HTMLCanvasElement | null>(null);
  /*
   * Le jeton du rendu EN COURS.
   *
   * Deux fichiers choisis coup sur coup lancent deux rendus, et le premier
   * peut finir APRES le second : l'editeur verrait alors la couverture du
   * fichier qu'il vient d'abandonner. Chaque rendu pose sa marque en partant
   * et verifie, avant de peindre, qu'elle est toujours la sienne.
   */
  const jeton = useRef<object | null>(null);
  const [etat, setEtat] = useState<Etat>({ phase: "vide" });

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LE COMPOSANT ÉCOUTE LE CHAMP, IL NE LE REND PAS.                        │
   * │                                                                          │
   * │ Le formulaire de dépôt porte des commentaires précis sur son encodage :  │
   * │ son action est une fonction, React choisit l'encodage, et poser le nôtre │
   * │ le ferait écraser en avertissant en console. Faire passer le champ de    │
   * │ fichier sous un composant client aurait remis cette question en jeu pour │
   * │ un aperçu — c'est-à-dire risquer le dépôt pour une commodité.            │
   * │                                                                          │
   * │ L'aperçu s'accroche donc au champ par son identifiant, qui est déjà      │
   * │ stable : `htmlFor` et `aria-describedby` s'y réfèrent. Champ absent,     │
   * │ l'aperçu ne s'installe pas et l'écran fonctionne comme avant.            │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  useEffect(() => {
    const champ = document.getElementById(CHAMP_FICHIER);
    if (!(champ instanceof HTMLInputElement)) return;

    const surChoix = () => {
      const fichier = champ.files?.[0];
      if (!fichier) {
        jeton.current = null;
        setEtat({ phase: "vide" });
        return;
      }

      void dessiner(fichier);
    };

    const dessiner = async (fichier: File) => {
      const marque = {};
      jeton.current = marque;
      setEtat({ phase: "lecture" });

      try {
        const octets = new Uint8Array(await fichier.arrayBuffer());

        // Le moteur, seulement maintenant — quatre mégaoctets de WebAssembly.
        const { PDFiumLibrary } = await import("@hyzyla/pdfium");
        const moteur = await PDFiumLibrary.init({
          wasmUrl: "/wasm/pdfium.wasm",
        });

        try {
          const pdf = await moteur.loadDocument(octets);
          try {
            const page = pdf.getPage(0);
            const { originalWidth } = page.getOriginalSize();
            const echelle =
              originalWidth > 0 ? LARGEUR_RENDU / originalWidth : 1;
            const rendu = await page.render({
              scale: echelle,
              render: "bitmap",
            });

            if (jeton.current !== marque) return;
            peindre(toile.current, rendu);
            setEtat({
              phase: "pret",
              largeur: rendu.width,
              hauteur: rendu.height,
            });
          } finally {
            pdf.destroy();
          }
        } finally {
          moteur.destroy();
        }
      } catch (erreur) {
        if (jeton.current !== marque) return;
        /*
         * Un PDF protégé par mot de passe échoue au CHARGEMENT, pas au rendu,
         * et c'est le seul échec qu'on sache nommer. Tout le reste — fichier
         * tronqué, PDF malformé, mémoire insuffisante — se dit « illisible » :
         * inventer un diagnostic plus précis serait deviner.
         */
        const message =
          erreur instanceof Error ? erreur.message.toLowerCase() : "";
        setEtat({
          phase: "echec",
          cause: message.includes("password") ? "protege" : "illisible",
        });
      }
    };

    champ.addEventListener("change", surChoix);
    return () => {
      // Un rendu encore en vol ne peindra pas : sa marque n'est plus la bonne.
      jeton.current = null;
      champ.removeEventListener("change", surChoix);
    };
  }, []);

  return (
    <aside className={styles.apercu} aria-live="polite">
      <p className={styles.apercuTitre}>
        {traduire(langue, "admin.apercuTitre")}
      </p>

      <div className={styles.apercuCadre} data-etat={etat.phase}>
        {/*
          La toile est TOUJOURS dans l'arbre, même vide : la retirer puis la
          remettre ferait perdre la référence entre le rendu et la peinture,
          et le dessin arriverait sur une toile déjà détachée.
        */}
        <canvas
          ref={toile}
          className={styles.apercuToile}
          hidden={etat.phase !== "pret"}
          role="img"
          aria-label={traduire(langue, "admin.apercuAlt")}
        />

        {etat.phase === "vide" ? (
          <p className={styles.apercuMessage}>
            {traduire(langue, "admin.apercuVide")}
          </p>
        ) : null}

        {etat.phase === "lecture" ? (
          <p className={styles.apercuMessage}>
            {traduire(langue, "admin.apercuLecture")}
          </p>
        ) : null}

        {etat.phase === "echec" ? (
          <p className={styles.apercuEchec}>
            {traduire(
              langue,
              etat.cause === "protege"
                ? "admin.apercuProtege"
                : "admin.apercuIllisible",
            )}
          </p>
        ) : null}
      </div>

      <p className={styles.apercuLegende}>
        {etat.phase === "pret"
          ? `${String(etat.largeur)} × ${String(etat.hauteur)} px`
          : traduire(langue, "admin.apercuSource")}
      </p>
    </aside>
  );
}

/**
 * Peint le rendu brut sur la toile.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES CANAUX SORTENT DÉJÀ EN RGBA — NE PAS LES ÉCHANGER.                  │
 * │                                                                          │
 * │ `page.types.d.ts` annonce `colorSpace: "BGRA"` par défaut, et la lecture │
 * │ naturelle est d'échanger les deux canaux extrêmes pour la toile. C'est   │
 * │ FAUX : `render: 'bitmap'` rend du RGBA, et l'échange donne une image     │
 * │ parfaitement nette où les oranges sont bleus.                            │
 * │                                                                          │
 * │ Vérifié plutôt que supposé — la même page rendue côté serveur, une fois  │
 * │ telle quelle et une fois permutée : la version NON permutée est celle    │
 * │ qui sort chaude, et c'est aussi celle que `rasteriser.ts` passe à sharp  │
 * │ en `channels: 4` depuis toujours. Les couvertures du catalogue en ligne  │
 * │ le confirment.                                                            │
 * │                                                                          │
 * │ L'erreur ne casse rien et ne se signale nulle part : sur un document en  │
 * │ noir et blanc elle est invisible, sur une couverture de conte africain   │
 * │ elle saute aux yeux — mais seulement si on connaît l'original.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function peindre(
  toile: HTMLCanvasElement | null,
  rendu: { data: Uint8Array; width: number; height: number },
): void {
  if (!toile) return;

  const pinceau = toile.getContext("2d");
  if (!pinceau) return;

  toile.width = rendu.width;
  toile.height = rendu.height;

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LE PAPIER EST BLANC, ET ON LE DESSINE — PIXEL PAR PIXEL.                │
   * │                                                                          │
   * │ Un PDF ne peint pas son propre fond : les blancs de la page sont des     │
   * │ TROUS, et `rasteriser.ts` pose le même aplat sous le PNG côté serveur.   │
   * │                                                                          │
   * │ Mais `putImageData` REMPLACE les pixels de la toile, il ne compose pas   │
   * │ avec elle : un `fillRect` blanc posé avant serait effacé par le dessin,  │
   * │ et la page arriverait transparente sur la carte crème. L'aplatissement   │
   * │ se fait donc ici, canal par canal, contre du blanc.                      │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const pixels = new Uint8ClampedArray(rendu.data.length);
  for (let i = 0; i < rendu.data.length; i += 4) {
    const a = (rendu.data[i + 3] ?? 255) / 255;
    const surBlanc = (canal: number): number => canal * a + 255 * (1 - a);

    pixels[i] = surBlanc(rendu.data[i] ?? 0); // R
    pixels[i + 1] = surBlanc(rendu.data[i + 1] ?? 0); // V
    pixels[i + 2] = surBlanc(rendu.data[i + 2] ?? 0); // B
    pixels[i + 3] = 255;
  }

  pinceau.putImageData(new ImageData(pixels, rendu.width, rendu.height), 0, 0);
}
