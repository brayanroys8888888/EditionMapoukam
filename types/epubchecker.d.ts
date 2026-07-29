/**
 * Déclaration de types pour `epubchecker`.
 *
 * Le paquet est publié sans types. Sans cette déclaration, l'import échoue à la
 * compilation, et le contourner par un `any` serait interdit par CLAUDE.md.
 *
 * Seule la surface réellement utilisée est décrite — la validation d'un EPUB et
 * la lecture de son rapport. Décrire davantage donnerait l'illusion d'une
 * définition officielle, alors que celle-ci est écrite à la main d'après le
 * README du paquet.
 *
 * Rappel : le validateur lui-même n'est PAS dans le paquet npm. Il est
 * téléchargé à l'installation depuis GitHub, et son absence rend le test qui
 * l'utilise inopérant — voir `tests/integration/ingestion.test.ts`.
 */
declare module 'epubchecker' {
  export interface MessageEpubcheck {
    /** `FATAL`, `ERROR`, `WARNING` ou `INFO`. */
    severity: string;
    message: string;
    /** Emplacements concernés dans l'archive. */
    locations?: { path?: string; line?: number; column?: number }[];
  }

  export interface RapportEpubcheck {
    messages: MessageEpubcheck[];
  }

  export interface OptionsEpubcheck {
    includeWarnings?: boolean;
    includeNotices?: boolean;
    output?: string;
    ignore?: RegExp | RegExp[];
    exclude?: RegExp | RegExp[];
    include?: RegExp | RegExp[];
    locale?: string;
  }

  export default function epubchecker(
    fichier: string,
    options?: OptionsEpubcheck,
  ): Promise<RapportEpubcheck>;
}
