import { headers } from 'next/headers';

import { langueValide, traduire } from '@/i18n';
import { catalogQuerySchema } from '@/domain/catalog/schemas';
import { listerCatalogue } from '@/lib/catalog/repository';
import { identifierAppelant } from '@/lib/auth/session';
import { GrilleCatalogue } from '@/components/catalogue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Accueil — §4.1 F1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES NOUVEAUTÉS VIENNENT DU CATALOGUE, PAS D'UNE SÉLECTION ÉCRITE ICI.   │
 * │                                                                          │
 * │ Le tri `nouveautes` est celui du catalogue, appliqué en SQL. Choisir à   │
 * │ la main les titres mis en avant aurait produit une liste à tenir à jour  │
 * │ — c'est-à-dire une liste périmée, qui continuerait d'annoncer comme       │
 * │ « nouveau » un conte publié il y a un an.                                │
 * │                                                                          │
 * │ La grille est celle du catalogue, y compris ses trois lignes d'accès :   │
 * │ un lecteur qui possède déjà un titre le voit ici aussi.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const NOMBRE_NOUVEAUTES = 8;

export default async function Accueil({ params }: { params: Promise<{ langue: string }> }) {
  const langue = langueValide((await params).langue);

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );

  // Une vitrine qui tombe parce que la base tousse est pire qu'une vitrine
  // sans mise en avant : la bannière et les formules, elles, s'affichent.
  const nouveautes = await listerCatalogue(
    appelant?.id ?? null,
    catalogQuerySchema.parse({ langue, tri: 'nouveautes', taille: NOMBRE_NOUVEAUTES }),
  ).catch(() => null);

  return (
    <div className="flex flex-col gap-14 px-4 py-10">
      {/* ── Bannière ────────────────────────────────────────────────────── */}
      <section className="mx-auto flex max-w-3xl flex-col items-start gap-5">
        <h1 className="font-serif text-4xl font-bold leading-tight md:text-5xl">
          {traduire(langue, 'accueil.titreBanniere')}
        </h1>
        <p className="text-lg text-muted-foreground">
          {traduire(langue, 'accueil.corpsBanniere')}
        </p>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href={`/${langue}/catalogue`}>{traduire(langue, 'accueil.actionCatalogue')}</a>
          </Button>
          <Button asChild variant="secondary">
            <a href={`/${langue}/offres`}>{traduire(langue, 'accueil.actionOffres')}</a>
          </Button>
        </div>
      </section>

      {/* ── Nouveautés ──────────────────────────────────────────────────── */}
      {nouveautes && nouveautes.entrees.length > 0 ? (
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-2xl font-semibold">
              {traduire(langue, 'accueil.nouveautes')}
            </h2>
            <a href={`/${langue}/catalogue`} className="text-sm underline">
              {traduire(langue, 'accueil.voirTout')}
            </a>
          </div>

          <GrilleCatalogue langue={langue} entrees={nouveautes.entrees} />
        </section>
      ) : null}

      {/* ── Les deux formules ───────────────────────────────────────────── */}
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <h2 className="font-serif text-2xl font-semibold">
          {traduire(langue, 'accueil.deuxFormulesTitre')}
        </h2>

        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif">
                {traduire(langue, 'offres.abonnementTitre')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/*
                Aucun montant ici. Les prix vivent sur la page des offres, qui
                les lit du serveur : les recopier sur l'accueil créerait une
                seconde grille tarifaire, et c'est celle-ci que le visiteur
                lirait en premier.
              */}
              <p className="text-sm text-muted-foreground">
                {traduire(langue, 'accueil.abonnementCourt')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif">{traduire(langue, 'offres.achatTitre')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {traduire(langue, 'accueil.achatCourt')}
              </p>
            </CardContent>
          </Card>
        </div>

        <div>
          <Button asChild variant="secondary">
            <a href={`/${langue}/offres`}>{traduire(langue, 'accueil.enSavoirPlus')}</a>
          </Button>
        </div>
      </section>
    </div>
  );
}
