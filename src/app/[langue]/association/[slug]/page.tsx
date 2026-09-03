import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { LANGUES_INTERFACE, langueValide, traduire, type CleTraduction } from '@/i18n';
import { lireContenuAssociatif } from '@/lib/association/service';
import { identifierAppelant } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/config/env';
import { Erreur } from '@/components/etats';
import styles from '@/components/v2/association.module.css';
import boutique from '@/components/v2/boutique.module.css';

/**
 * UN CONTENU DE L'ASSOCIATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE PAGE N'EST PAS FIGÉE AU BUILD, ET ELLE NE PEUT PAS L'ÊTRE.        │
 * │                                                                          │
 * │ Le blog qu'elle remplace employait `generateStaticParams` : son contenu  │
 * │ était le même pour tout le monde. Ici, la MOITIÉ de la page dépend de    │
 * │ qui la demande — un adhérent voit le corps, un visiteur voit un mur.     │
 * │ Une page mise en cache servirait à l'un ce qui est réservé à l'autre.    │
 * │                                                                          │
 * │ Ce coût est assumé : c'est celui d'un contenu payant.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CORPS N'ARRIVE MÊME PAS JUSQU'ICI QUAND IL EST FERMÉ.                │
 * │                                                                          │
 * │ Ce n'est pas cet écran qui masque le texte : `association_contenu` rend  │
 * │ `corps` à `null` quand `can_read` est faux, et la colonne n'est de toute │
 * │ façon accordée à aucun rôle de navigateur. Masquer à l'affichage —       │
 * │ envoyer le texte puis le cacher en CSS — est le défaut classique de ces  │
 * │ murs, et il se contourne avec la vue « source ».                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string; slug: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const { langue: langueBrute, slug } = await params;
  const langue = langueValide(langueBrute);

  /*
   * Les métadonnées sont lues EN VISITEUR — `null` plutôt que l'appelant.
   *
   * Titre et chapeau sont publics par construction : ce sont eux qui donnent
   * envie d'adhérer, et la migration 0069 les accorde à `anon`. Les lire au nom
   * du lecteur connecté ne changerait rien à ce qu'elles contiennent, mais
   * ferait dépendre une balise indexable de l'identité de qui la demande.
   */
  const contenu = await lireContenuAssociatif(null, slug, { langue }).catch(() => null);

  if (!contenu) return { title: traduire(langue, 'pages.introuvableTitre') };

  const base = getServerEnv().NEXT_PUBLIC_APP_URL;

  return {
    title: contenu.titre,
    description: contenu.chapeau,
    alternates: {
      canonical: `${base}/${langue}/association/${contenu.slug}`,
      // Sans `hreflang`, les deux versions d'un même contenu se font
      // concurrence dans les moteurs, qui n'en indexent qu'une (§5.4).
      languages: Object.fromEntries(
        LANGUES_INTERFACE.map((code) => [code, `${base}/${code}/association/${contenu.slug}`]),
      ),
    },
    openGraph: { title: contenu.titre, description: contenu.chapeau, type: 'article' },
  };
}

export default async function PageContenuAssociatif({ params }: Parametres) {
  const { langue: langueBrute, slug } = await params;
  const langue = langueValide(langueBrute);

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );

  let contenu;
  try {
    contenu = await lireContenuAssociatif(appelant?.id ?? null, slug, { langue });
  } catch {
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  // Un slug inconnu est un 404, jamais une page vide : une page qui répond
  // 200 sur une adresse qui n'existe pas se fait indexer telle quelle.
  if (!contenu) notFound();

  const categorie = traduire(langue, `v2.cat_${contenu.categorie}` as CleTraduction);

  return (
    <>
      <div className={boutique.banniere} data-banniere>
        <div className={boutique.banniereInterieur}>
          <span className={boutique.oeil}>{categorie}</span>
          <h1 className={boutique.banniereTitre}>{contenu.titre}</h1>
          <p className={boutique.banniereTexte}>{contenu.chapeau}</p>
        </div>
      </div>

      <article className={styles.article}>
        <p className={styles.meta} style={{ marginBottom: '32px' }}>
          {contenu.publieLe ? (
            <time dateTime={contenu.publieLe.slice(0, 10)}>
              {new Date(contenu.publieLe).toLocaleDateString(langue, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                // `UTC` explicite : sans lui, une date à minuit recule d'un jour
                // pour tout lecteur à l'ouest de Greenwich.
                timeZone: 'UTC',
              })}
            </time>
          ) : null}

          {contenu.minutes ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {traduire(langue, 'v2.assoMinutes').replace('{minutes}', String(contenu.minutes))}
              </span>
            </>
          ) : null}

          {contenu.peutLire ? null : (
            <>
              <span aria-hidden="true">·</span>
              <span className={styles.reserve}>
                <span className={styles.cadenas} aria-hidden="true">
                  🔒
                </span>
                {traduire(langue, 'v2.assoReserve')}
              </span>
            </>
          )}
        </p>

        {/* ── Le corps, quand le droit est ouvert ───────────────────────── */}
        {contenu.sections ? (
          <div className={styles.corps}>
            {contenu.sections.map((section) => (
              <section key={section.titre}>
                <h2>{section.titre}</h2>

                {section.paragraphes?.map((paragraphe) => (
                  <p key={paragraphe}>{paragraphe}</p>
                ))}

                {section.points ? (
                  <ul>
                    {section.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        ) : (
          /*
           * ── LE MUR ────────────────────────────────────────────────────────
           *
           * Il vient APRÈS le titre et le chapeau, jamais à leur place : le
           * lecteur doit savoir ce qu'il n'a pas encore lu avant qu'on lui
           * propose d'adhérer.
           *
           * Deux portes, et l'ordre compte. Un visiteur non connecté est
           * peut-être DÉJÀ adhérent sur un autre appareil : lui proposer
           * d'abord de payer lui ferait acheter deux fois.
           */
          <div className={styles.mur}>
            <h2 className={styles.murTitre}>{traduire(langue, 'v2.assoMurTitre')}</h2>
            <p className={styles.murTexte}>{traduire(langue, 'v2.assoMurTexte')}</p>

            <p className={styles.murActions}>
              {appelant ? null : (
                /* Sans paramètre de retour : l'écran de connexion n'en honore
                   aucun, et en inventer un ici produirait un lien qui promet un
                   retour que rien ne fait. */
                <a className={styles.boutonSecondaire} href={`/${langue}/connexion`}>
                  {traduire(langue, 'v2.assoMurConnexion')}
                </a>
              )}

              <a
                className={styles.bouton}
                href={`/${langue}/abonnement/souscrire?domaine=association`}
              >
                {traduire(langue, 'v2.assoMurAdherer')}
              </a>
            </p>
          </div>
        )}

        <a className={styles.retour} href={`/${langue}/association`}>
          <span aria-hidden="true">←</span>
          {traduire(langue, 'v2.assoRetour')}
        </a>
      </article>
    </>
  );
}
