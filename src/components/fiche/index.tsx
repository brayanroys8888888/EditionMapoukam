import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { FicheLivre } from '@/domain/catalog/types';
import { Couverture } from '@/components/catalogue/couverture';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/**
 * FICHE D'UN CONTE — §4.1 F3.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES ACTIONS SE LISENT, ELLES NE SE DÉDUISENT PAS.                       │
 * │                                                                          │
 * │ `canRead` ouvre la lecture, `canDownload` ouvre le fichier. Ces deux     │
 * │ champs sont rendus par le moteur de droits, et cette page les AFFICHE.  │
 * │                                                                          │
 * │ Le raccourci tentant serait de déduire le téléchargement du motif :      │
 * │ « purchase donc téléchargeable ». Il donne le bon résultat la plupart    │
 * │ du temps — et le mauvais exactement là où la règle métier centrale se    │
 * │ joue, c'est-à-dire sur l'abonné, qui lit sans jamais pouvoir conserver.  │
 * │                                                                          │
 * │ Un test d'architecture échoue si un composant de ce dossier compare      │
 * │ `reason` à proximité d'un téléchargement.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════════════════════════
// EN-TÊTE
// ═══════════════════════════════════════════════════════════════════════════

export function EnteteFiche({
  langue,
  fiche,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
}): ReactNode {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:gap-8">
      {fiche.couverture ? (
        // La taille « fiche » (800 px) est ICI légitime : une seule image par
        // page, et c'est l'argument de vente principal de l'écran. La grille,
        // elle, n'a droit qu'à la vignette.
        <Couverture
          langue={langue}
          url={fiche.couverture.fiche}
          largeur={800}
          hauteur={1200}
          tailles="(max-width: 768px) 90vw, 320px"
          classeImage="w-full max-w-[20rem] rounded-lg border border-border object-cover"
          classeSubstitut="flex aspect-[2/3] w-full max-w-[20rem] items-center justify-center rounded-lg border border-dashed border-border bg-muted p-4 text-center text-sm text-muted-foreground"
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-3xl font-bold leading-tight">{fiche.titre}</h1>

        <p className="text-muted-foreground">
          {traduire(langue, 'catalogue.parAuteur').replace('{auteur}', fiche.auteur)}
        </p>

        {fiche.region ? (
          <div>
            <Badge variant="secondary">{traduire(langue, `regions.${fiche.region}`)}</Badge>
          </div>
        ) : null}

        {fiche.resume ? <p className="max-w-prose leading-relaxed">{fiche.resume}</p> : null}
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ce que le lecteur peut faire, et ce qu'on lui explique de ce qu'il ne peut pas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CAS QUI COMPTE : L'ABONNÉ.                                           │
 * │                                                                          │
 * │ Il a `canRead: true` et `canDownload: false`. Aucun bouton de            │
 * │ téléchargement ne doit paraître — et surtout, l'écran doit DIRE pourquoi │
 * │ et comment l'obtenir. Sans cette phrase, l'absence du bouton se lit      │
 * │ comme une panne, et le client écrit au support au lieu d'acheter.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ActionsFiche({
  langue,
  fiche,
  actionAjout,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
  /**
   * Ajout au panier — une Server Action, jamais un lien.
   *
   * Un `GET` qui modifie un panier est rejoué par le moindre préchargement de
   * navigateur, et par tout robot qui suit les liens de la page.
   */
  actionAjout?: (donnees: FormData) => void | Promise<void>;
}): ReactNode {
  const { canRead, canDownload } = fiche.acces;

  return (
    <section className="flex flex-col gap-4" aria-label={traduire(langue, 'acces.lireEnLigne')}>
      <div className="flex flex-wrap items-center gap-3">
        {/* La lecture : complète si le droit est acquis, extrait sinon. */}
        <Button asChild>
          <a href={`/${langue}/lire/${fiche.slug}`}>
            {canRead ? traduire(langue, 'fiche.lireEnLigne') : traduire(langue, 'fiche.lireExtrait')}
          </a>
        </Button>

        {/* Le téléchargement suit `canDownload`, et rien d'autre. */}
        {canDownload ? (
          <Button asChild variant="secondary">
            <a href={`/${langue}/compte/bibliotheque`}>{traduire(langue, 'fiche.telecharger')}</a>
          </Button>
        ) : null}

        {/* L'achat : proposé quand le titre est vendu et pas déjà détenu. */}
        {fiche.prix && !canDownload && actionAjout ? (
          <form action={actionAjout}>
            <Button type="submit" variant="secondary">
              {traduire(langue, 'fiche.ajouterAuPanier')} — {fiche.prix.affichage}
            </Button>
          </form>
        ) : null}
      </div>

      {/*
        L'EXPLICATION DE CE QUI MANQUE.

        Elle ne paraît que pour qui lit sans pouvoir conserver — un abonné, ou
        un lecteur d'un titre gratuit — et jamais pour qui détient déjà le
        fichier. Proposer d'acheter à quelqu'un qui a acheté est le contresens
        que la troisième ligne du catalogue existe déjà pour éviter.
      */}
      {canRead && !canDownload && fiche.disponible_achat ? (
        <p className="max-w-prose rounded-md bg-muted p-4 text-sm text-muted-foreground">
          {traduire(langue, 'fiche.telechargementParAchat')}
        </p>
      ) : null}

      {canDownload ? (
        <p className="text-sm font-semibold">{traduire(langue, 'fiche.dansVotreBibliotheque')}</p>
      ) : null}

      {fiche.achat_hors_zone ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          {traduire(langue, 'acces.horsZone')}
        </p>
      ) : null}

      {/*
        « Bientôt dans l'abonnement » — piloté par `abonnement_a_partir_du`,
        calculé en base. La date est FORMATÉE ici, jamais calculée : la fenêtre
        dépend d'un réglage que l'administration déplace à la seconde et
        rétroactivement.
      */}
      {fiche.abonnement_a_partir_du ? (
        <p className="text-sm text-muted-foreground">
          {traduire(langue, 'fiche.bientotAbonnement').replace(
            '{date}',
            new Date(fiche.abonnement_a_partir_du).toLocaleDateString(langue),
          )}
        </p>
      ) : null}

      {!canRead && !fiche.prix && !fiche.achat_hors_zone ? (
        <p className="text-sm text-muted-foreground">{traduire(langue, 'fiche.indisponible')}</p>
      ) : null}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BANDEAU D'EXTRAIT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rappelle que la lecture en cours est partielle.
 *
 * Le nombre de pages vient de `pages_extrait` et de `nb_pages`, tous deux
 * rendus par l'API : l'écran ne compte rien lui-même.
 */
export function BandeauExtrait({
  langue,
  fiche,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
}): ReactNode {
  if (fiche.acces.canRead || fiche.nb_pages === null) return null;

  return (
    <p className="rounded-md border border-border bg-accent p-4 text-sm text-accent-foreground">
      {traduire(langue, 'fiche.extraitSeul').replace('{pages}', String(fiche.nb_pages))}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DÉTAILS
// ═══════════════════════════════════════════════════════════════════════════

function Detail({ intitule, valeur }: { intitule: string; valeur: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{intitule}</dt>
      <dd className="text-sm font-medium">{valeur}</dd>
    </div>
  );
}

export function DetailsFiche({
  langue,
  fiche,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
}): ReactNode {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold">{traduire(langue, 'fiche.details')}</h2>
      <Separator />

      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Detail intitule={traduire(langue, 'fiche.auteur')} valeur={fiche.auteur} />

        {fiche.illustrateur ? (
          <Detail intitule={traduire(langue, 'fiche.illustrateur')} valeur={fiche.illustrateur} />
        ) : null}

        {fiche.nb_pages !== null ? (
          <Detail intitule={traduire(langue, 'fiche.pages')} valeur={String(fiche.nb_pages)} />
        ) : null}

        {fiche.origine_culturelle ? (
          <Detail intitule={traduire(langue, 'fiche.origine')} valeur={fiche.origine_culturelle} />
        ) : null}

        {fiche.langues.length > 0 ? (
          <Detail
            intitule={traduire(langue, 'fiche.langues')}
            valeur={fiche.langues.map((code) => traduire(langue, `langue.${code === 'fr' ? 'fr' : 'en'}`)).join(', ')}
          />
        ) : null}

        {fiche.themes.length > 0 ? (
          <Detail intitule={traduire(langue, 'fiche.themes')} valeur={fiche.themes.join(', ')} />
        ) : null}
      </dl>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function Suggestions({
  langue,
  fiche,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
}): ReactNode {
  if (fiche.suggestions.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold">{traduire(langue, 'fiche.suggestions')}</h2>

      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {fiche.suggestions.map((suggestion) => (
          <li key={suggestion.id}>
            <a
              href={`/${langue}/contes/${suggestion.slug}`}
              className="text-sm font-medium hover:underline"
            >
              {suggestion.titre}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
