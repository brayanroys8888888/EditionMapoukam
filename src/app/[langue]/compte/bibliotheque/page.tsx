import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, traduire } from '@/i18n';
import { lireBibliotheque } from '@/lib/account/bibliotheque';
import { abonnementCourant } from '@/lib/subscriptions/handlers';
import { identifierAppelant } from '@/lib/auth/session';
import { Erreur } from '@/components/etats';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/**
 * Ma bibliothèque — §4.2 F7.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCRAN LE PLUS IMPORTANT DU PROJET, ET LE PLUS FACILE À RATER.         │
 * │                                                                          │
 * │ « Abonnement expiré + bibliothèque remplie » est LE cas métier central,  │
 * │ et le bug classique de ce domaine. Il doit répondre à trois questions    │
 * │ sans ambiguïté :                                                         │
 * │                                                                          │
 * │   * ce que j'ai PERDU — la lecture des titres d'abonnement, nommée ;    │
 * │   * ce que je GARDE — mes achats, lecture ET téléchargement, sans        │
 * │     limite de durée ;                                                    │
 * │   * POURQUOI — l'abonnement ouvrait la lecture, jamais le fichier.       │
 * │                                                                          │
 * │ Le bouton de téléchargement suit `peut_telecharger`, jamais un motif ni  │
 * │ un statut d'abonnement. C'est ce qui garantit qu'un abonné expiré        │
 * │ retrouve ses achats intacts.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return { title: traduire(langue, 'compte.bibliotheque') };
}

export default async function PageBibliotheque({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  let bibliotheque;
  let abonnement;
  try {
    [bibliotheque, abonnement] = await Promise.all([
      lireBibliotheque(appelant.id, langue),
      abonnementCourant(appelant.id),
    ]);
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ `statutEffectif`, JAMAIS `statut`.                                     │
  // │                                                                        │
  // │ Le second est ce que le prestataire a rapporté ; le premier replie les │
  // │ dates et décrit la réalité. Un abonnement dont la période est échue    │
  // │ sans qu'aucun événement ne soit arrivé — un webhook perdu — est encore │
  // │ « actif » au sens rapporté, et ne l'est plus au sens observé.          │
  // │                                                                        │
  // │ L'avertissement ne paraît donc QUE si l'abonnement a réellement pris   │
  // │ fin : un abonné actif n'a rien perdu, et le lui annoncer serait        │
  // │ alarmant à tort.                                                       │
  // └────────────────────────────────────────────────────────────────────────┘
  const abonnementPerdu =
    abonnement !== null && abonnement.statutEffectif !== 'actif' && abonnement.statutEffectif !== 'essai';

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <h1 className="font-serif text-3xl font-bold">
        {traduire(langue, 'compte.bibliotheque')}
      </h1>

      {/* ── Abonnement expiré : les trois questions ─────────────────────── */}
      {abonnementPerdu ? (
        <section className="flex flex-col gap-3 rounded-md border border-border bg-accent p-5">
          <h2 className="font-semibold text-accent-foreground">
            {traduire(langue, 'compte.perteAbonnementTitre')}
          </h2>

          {/* Ce que j'ai perdu. */}
          <p className="text-sm text-accent-foreground">
            {traduire(langue, 'compte.perteAbonnementPerdu')}
          </p>

          {/*
            Ce que je garde — en gras, parce que c'est la phrase qui évite la
            réclamation. Elle est affichée MÊME si la bibliothèque est vide :
            un abonné expiré sans achat doit lire la perte, et c'est le
            contre-test de ce comportement.
          */}
          <p className="text-sm font-semibold text-accent-foreground">
            {traduire(langue, 'compte.perteAbonnementGarde')}
          </p>

          {/* Pourquoi. */}
          <p className="text-sm text-accent-foreground">
            {traduire(langue, 'compte.perteAbonnementPourquoi')}
          </p>

          <div>
            <Button asChild size="sm">
              <a href={`/${langue}/offres`}>
                {traduire(langue, 'compte.perteAbonnementAction')}
              </a>
            </Button>
          </div>
        </section>
      ) : null}

      {/* ── Mes contes ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-2xl font-semibold">
          {traduire(langue, 'compte.achatsTitre')}
        </h2>

        {bibliotheque.achats.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground">{traduire(langue, 'compte.achatsVide')}</p>
            <Button asChild variant="secondary">
              <a href={`/${langue}/catalogue`}>
                {traduire(langue, 'compte.achatsVideAction')}
              </a>
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {bibliotheque.achats.map((entree) => (
              <li
                key={entree.livre_id}
                className="flex flex-col gap-3 border-b border-border pb-4"
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <a
                    href={`/${langue}/contes/${entree.slug}`}
                    className="font-medium hover:underline"
                  >
                    {entree.titre}
                  </a>

                  {entree.source === 'offert' ? (
                    <Badge variant="secondary">{traduire(langue, 'compte.offert')}</Badge>
                  ) : null}

                  {/*
                    Dit explicitement, et pas seulement sous-entendu : c'est la
                    réponse à « qu'est-ce que je garde ? », posée avant même
                    que la question ne se pose.
                  */}
                  {entree.peut_telecharger ? (
                    <span className="text-sm text-muted-foreground">
                      {traduire(langue, 'compte.conserveSansLimite')}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {entree.acces.canRead ? (
                    <Button asChild size="sm">
                      <a href={`/${langue}/lire/${entree.slug}`}>
                        {traduire(langue, 'compte.lire')}
                      </a>
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {traduire(langue, 'compte.plusAccessible')}
                    </span>
                  )}

                  {/*
                    TOUTES LES COMBINAISONS LANGUE × FORMAT, énumérées depuis
                    les versions PUBLIÉES du titre : un conte en deux langues
                    offre quatre téléchargements. Le droit vient de
                    `peut_telecharger`, jamais d'un motif d'accès.
                  */}
                  {entree.peut_telecharger
                    ? entree.langues.flatMap((codeLangue) =>
                        (['pdf', 'epub'] as const).map((format) => (
                          <Button
                            key={`${codeLangue}-${format}`}
                            asChild
                            size="sm"
                            variant="secondary"
                          >
                            <a
                              href={`/api/downloads/${entree.livre_id}?langue=${codeLangue}&format=${format}`}
                            >
                              {traduire(langue, 'compte.telechargerFormat')
                                .replace('{format}', format.toUpperCase())}{' '}
                              ({codeLangue.toUpperCase()})
                            </a>
                          </Button>
                        )),
                      )
                    : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Reprendre ma lecture ────────────────────────────────────────── */}
      {bibliotheque.en_cours.length > 0 ? (
        <>
          <Separator />

          <section className="flex flex-col gap-4">
            <h2 className="font-serif text-2xl font-semibold">
              {traduire(langue, 'compte.enCoursTitre')}
            </h2>

            <ul className="flex flex-col gap-3">
              {bibliotheque.en_cours.map((entree) => (
                <li key={entree.livre_id} className="flex flex-wrap items-center gap-3">
                  <a
                    href={`/${langue}/contes/${entree.slug}`}
                    className="font-medium hover:underline"
                  >
                    {entree.titre}
                  </a>

                  {entree.reprise ? (
                    <span className="text-sm text-muted-foreground">
                      {traduire(langue, 'compte.reprisePage').replace(
                        '{page}',
                        String(entree.reprise.page),
                      )}
                    </span>
                  ) : null}

                  {/*
                    La progression SURVIT à la perte d'accès : un ancien abonné
                    voit sa page de reprise sans pouvoir rouvrir le conte. On
                    ne propose donc « Lire » que si le moteur de droits le
                    permet — proposer une porte qui se refermera serait pire
                    que ne rien proposer.
                  */}
                  {entree.acces.canRead ? (
                    <Button asChild size="sm" variant="secondary">
                      <a href={`/${langue}/lire/${entree.slug}`}>
                        {traduire(langue, 'compte.lire')}
                      </a>
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {traduire(langue, 'compte.plusAccessible')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </section>
  );
}
