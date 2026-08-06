import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LANGUES_INTERFACE, langueValide, traduire, type CleTraduction } from '@/i18n';
import { ARTICLES, lireArticle } from '@/content/blog';
import { getServerEnv } from '@/lib/config/env';
import styles from '@/components/v2/blog.module.css';
import boutique from '@/components/v2/boutique.module.css';

/**
 * UN ARTICLE DU BLOG.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CONTENU EST STATIQUE, DONC LES PAGES LE SONT AUSSI.                  │
 * │                                                                          │
 * │ `generateStaticParams` fige les articles au build : aucune requête de    │
 * │ base, aucun rendu à la demande. Sur la connexion lente qui est la        │
 * │ condition réelle d'une partie du public (§5.1), c'est la différence      │
 * │ entre une page instantanée et une page qui attend un aller-retour.      │
 * │                                                                          │
 * │ C'est aussi l'un des arguments qui ont fait retenir des fichiers plutôt  │
 * │ qu'une table pour le blog.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Parametres {
  params: Promise<{ langue: string; slug: string }>;
}

export function generateStaticParams(): { langue: string; slug: string }[] {
  return LANGUES_INTERFACE.flatMap((langue) =>
    ARTICLES.map((article) => ({ langue, slug: article.slug })),
  );
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const { langue: langueBrute, slug } = await params;
  const langue = langueValide(langueBrute);
  const article = lireArticle(slug);

  if (!article) return { title: traduire(langue, 'pages.introuvableTitre') };

  const base = getServerEnv().NEXT_PUBLIC_APP_URL;

  return {
    title: article.titre,
    description: article.chapeau,
    alternates: {
      canonical: `${base}/${langue}/blog/${article.slug}`,
      // Sans `hreflang`, les deux versions d'un même article se font
      // concurrence dans les moteurs, qui n'en indexent qu'une (§5.4).
      languages: Object.fromEntries(
        LANGUES_INTERFACE.map((code) => [code, `${base}/${code}/blog/${article.slug}`]),
      ),
    },
    openGraph: { title: article.titre, description: article.chapeau, type: 'article' },
  };
}

export default async function PageArticle({ params }: Parametres) {
  const { langue: langueBrute, slug } = await params;
  const langue = langueValide(langueBrute);

  // Un slug inconnu est un 404, jamais une page vide : une page qui répond
  // 200 sur une adresse qui n'existe pas se fait indexer telle quelle.
  const article = lireArticle(slug);
  if (!article) notFound();

  const categorie = traduire(langue, `v2.cat_${article.categorie}` as CleTraduction);

  return (
    <>
      <div className={boutique.banniere} data-banniere>
        <div className={boutique.banniereInterieur}>
          <span className={boutique.oeil}>{categorie}</span>
          <h1 className={boutique.banniereTitre}>{article.titre}</h1>
          <p className={boutique.banniereTexte}>{article.chapeau}</p>
        </div>
      </div>

      <article className={styles.article}>
        <p className={styles.meta} style={{ marginBottom: '32px' }}>
          <time dateTime={article.publieLe}>
            {new Date(`${article.publieLe}T00:00:00Z`).toLocaleDateString(langue, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              // `UTC` explicite : sans lui, une date à minuit recule d'un jour
              // pour tout lecteur à l'ouest de Greenwich.
              timeZone: 'UTC',
            })}
          </time>
          <span aria-hidden="true">·</span>
          <span>
            {traduire(langue, 'v2.blogMinutes').replace('{minutes}', String(article.minutes))}
          </span>
        </p>

        <div className={styles.corps}>
          {article.sections.map((section) => (
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

        <a className={styles.retour} href={`/${langue}/blog`}>
          <span aria-hidden="true">←</span>
          {traduire(langue, 'v2.blogRetour')}
        </a>
      </article>
    </>
  );
}
