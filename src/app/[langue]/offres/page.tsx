import type { Metadata } from 'next';

import { langueValide, traduire } from '@/i18n';
import { lireOffres } from '@/lib/offers/service';
import { Erreur } from '@/components/etats';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Les deux formules — §4.1 F4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUS LES MONTANTS VIENNENT DU SERVEUR, SANS EXCEPTION.                  │
 * │                                                                          │
 * │ `lireOffres` est le module qu'emploie `/api/offers`. Aucun nombre n'est  │
 * │ écrit ici : les maquettes portaient 6,90 € et 3,90 €, valeurs inventées  │
 * │ par l'outil de maquettage, et les recopier aurait créé une seconde       │
 * │ grille tarifaire — celle que le client lit avant de payer l'autre.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN EST LE PREMIER OÙ LA RÈGLE MÉTIER CENTRALE SE LIT.            │
 * │                                                                          │
 * │ L'abonnement donne la LECTURE EN LIGNE, jamais le téléchargement.        │
 * │ L'achat donne le FICHIER, sans limite de durée. La page ne se contente   │
 * │ donc pas d'énumérer ce que chaque formule apporte : elle nomme aussi ce  │
 * │ que l'abonnement N'apporte PAS, parce que c'est la confusion qui produit │
 * │ des réclamations à chaque expiration.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'offres.titre'),
    description: traduire(langue, 'offres.intro'),
  };
}

export default async function PageOffres({ params }: Parametres) {
  const langue = langueValide((await params).langue);

  let offres;
  try {
    // Zone d'AFFICHAGE seulement. La zone d'encaissement est déterminée au
    // paiement, depuis le pays réel du moyen de paiement, et elle seule est
    // enregistrée sur la commande.
    offres = await lireOffres('international');
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  const { abonnement, achat_unite: achat } = offres;

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-4xl font-bold">{traduire(langue, 'offres.titre')}</h1>
        <p className="max-w-prose text-muted-foreground">{traduire(langue, 'offres.intro')}</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Abonnement ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">
              {traduire(langue, 'offres.abonnementTitre')}
            </CardTitle>
            <CardDescription>{traduire(langue, 'offres.abonnementResume')}</CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            {/*
              La variante « pas encore ouvert » est pilotée par un réglage
              serveur — `business_settings.abonnement_ouvert` — et JAMAIS par
              un compteur de titres calculé ici. Le seuil de 30 à 40 titres de
              §3.3 est une décision commerciale, pas une règle de code.
            */}
            {!abonnement.ouvert ? (
              <div className="rounded-md bg-muted p-4">
                <p className="font-semibold">
                  {traduire(langue, 'offres.abonnementFermeTitre')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {traduire(langue, 'offres.abonnementFermeCorps')}
                </p>
              </div>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {abonnement.offres.map((offre) => (
                    <li key={offre.code} className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{offre.affichage}</span>
                      <span className="text-sm text-muted-foreground">
                        {traduire(langue, 'offres.abonnementParPeriode').replace(
                          '{periode}',
                          offre.periode,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                {abonnement.jours_essai > 0 ? (
                  <div>
                    <Badge>
                      {traduire(langue, 'offres.abonnementEssai').replace(
                        '{jours}',
                        String(abonnement.jours_essai),
                      )}
                    </Badge>
                  </div>
                ) : null}
              </>
            )}

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">
                {traduire(langue, 'offres.abonnementDonne')}
              </h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                <li>{traduire(langue, 'offres.abonnementDonne1')}</li>
                <li>{traduire(langue, 'offres.abonnementDonne2')}</li>
                <li>{traduire(langue, 'offres.abonnementDonne3')}</li>
              </ul>
            </div>

            {/*
              CE QUE L'ABONNEMENT NE DONNE PAS.

              Énoncé aussi visiblement que ce qu'il donne. `donne_telechargement`
              est rendu explicitement par l'API — toujours `false` — précisément
              pour que cette phrase ne dépende pas de la mémoire de celui qui
              écrit l'écran.
            */}
            <div className="flex flex-col gap-2 rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold">
                {traduire(langue, 'offres.abonnementNeDonnePas')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {traduire(langue, 'offres.abonnementPasTelechargement')}
              </p>
            </div>
          </CardContent>

          {abonnement.ouvert ? (
            <CardFooter>
              <Button asChild>
                <a href={`/${langue}/compte/abonnement`}>
                  {traduire(langue, 'offres.abonnementSouscrire')}
                </a>
              </Button>
            </CardFooter>
          ) : null}
        </Card>

        {/* ── Achat à l'unité ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">
              {traduire(langue, 'offres.achatTitre')}
            </CardTitle>
            <CardDescription>{traduire(langue, 'offres.achatResume')}</CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            <p className="text-2xl font-bold">
              {traduire(langue, 'offres.achatAPartirDe').replace('{montant}', achat.affichage)}
            </p>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{traduire(langue, 'offres.achatDonne')}</h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                <li>{traduire(langue, 'offres.achatDonne1')}</li>
                <li>{traduire(langue, 'offres.achatDonne2')}</li>
                <li>{traduire(langue, 'offres.achatDonne3')}</li>
              </ul>
            </div>
          </CardContent>

          <CardFooter>
            <Button asChild variant="secondary">
              <a href={`/${langue}/catalogue`}>{traduire(langue, 'offres.achatParcourir')}</a>
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* ── Comparatif ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-2xl font-semibold">
          {traduire(langue, 'offres.comparatif')}
        </h2>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>{traduire(langue, 'offres.colonneAbonnement')}</TableHead>
              <TableHead>{traduire(langue, 'offres.colonneAchat')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>{traduire(langue, 'offres.ligneLecture')}</TableCell>
              <TableCell>{traduire(langue, 'offres.oui')}</TableCell>
              <TableCell>{traduire(langue, 'offres.oui')}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{traduire(langue, 'offres.ligneTelechargement')}</TableCell>
              {/*
                Lu depuis l'API, jamais écrit en dur : `donne_telechargement`
                vaut `false` pour l'abonnement et `true` pour l'achat, et c'est
                le serveur qui l'affirme.
              */}
              <TableCell>
                {traduire(langue, abonnement.donne_telechargement ? 'offres.oui' : 'offres.non')}
              </TableCell>
              <TableCell>
                {traduire(langue, achat.donne_telechargement ? 'offres.oui' : 'offres.non')}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{traduire(langue, 'offres.ligneDuree')}</TableCell>
              <TableCell>{traduire(langue, 'offres.dureeAbonnement')}</TableCell>
              <TableCell>{traduire(langue, 'offres.dureeAchat')}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>
    </section>
  );
}
