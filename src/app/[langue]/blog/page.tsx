import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { langueValide, traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { articlesRecents, type Article } from '@/content/blog';
import { Revele } from '@/components/v2/revele';
import styles from '@/components/v2/blog.module.css';
import boutique from '@/components/v2/boutique.module.css';

/**
 * LE BLOG — liste des articles.
 */
interface Parametres {
  params: Promise<{ langue: string }>;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'v2.blogTitre'),
    description: traduire(langue, 'v2.blogTexte'),
  };
}

const IMAGE_PAR_CATEGORIE: Record<Article['categorie'], string> = {
  accompagnement: '/images/blog-1.png',
  pedagogie: '/images/blog-2.png',
  culture: '/images/blog-3.png',
  association: '/images/blog-4.png',
};

function CarteArticle({
  langue,
  article,
  vedette = false,
}: {
  langue: LangueInterface;
  article: Article;
  vedette?: boolean;
}): ReactNode {
  const categorie = traduire(langue, `v2.cat_${article.categorie}` as CleTraduction);
  const image = IMAGE_PAR_CATEGORIE[article.categorie] || '/images/blog-1.png';

  const corps = (
    <>
      <span className={styles.categorie}>{categorie}</span>

      <span className={vedette ? `${styles.titre} ${styles.titreVedette}` : styles.titre}>
        {article.titre}
      </span>

      <span className={styles.chapeau}>{article.chapeau}</span>

      <span className={styles.meta}>
        <time dateTime={article.publieLe}>
          {new Date(`${article.publieLe}T00:00:00Z`).toLocaleDateString(langue, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </time>
        <span aria-hidden="true">·</span>
        <span>
          {traduire(langue, 'v2.blogMinutes').replace('{minutes}', String(article.minutes))}
        </span>
      </span>

      <span className={styles.lire}>
        {traduire(langue, 'v2.blogLire')}
        <span className={styles.fleche} aria-hidden="true">
          →
        </span>
      </span>
    </>
  );

  if (vedette) {
    return (
      <a className={styles.carteVedette} href={`/${langue}/blog/${article.slug}`}>
        <span className={styles.vedetteVisuel}>
          <img src={image} alt={article.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </span>
        <span className={styles.vedetteCorps}>{corps}</span>
      </a>
    );
  }

  return (
    <a className={styles.carte} href={`/${langue}/blog/${article.slug}`}>
      <span className={styles.carteVisuel}>
        <img src={image} alt={article.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </span>
      <span className={styles.carteCorps}>{corps}</span>
    </a>
  );
}

export default async function PageBlog({ params }: Parametres) {
  const langue = langueValide((await params).langue);
  const articles = articlesRecents();

  const [premier, ...suite] = articles;

  return (
    <>
      <div className={boutique.banniere} data-banniere>
        <div className={boutique.banniereInterieur}>
          <span className={boutique.oeil}>{traduire(langue, 'v2.blogOeil')}</span>
          <h1 className={boutique.banniereTitre}>{traduire(langue, 'v2.blogTitre')}</h1>
          <p className={boutique.banniereTexte}>{traduire(langue, 'v2.blogTexte')}</p>
        </div>
      </div>

      <div className={boutique.page}>
        {articles.length === 0 ? (
          <p className={boutique.compte}>{traduire(langue, 'v2.blogVide')}</p>
        ) : (
          <ul className={styles.liste}>
            {premier ? (
              <li className={styles.vedette}>
                <CarteArticle langue={langue} article={premier} vedette />
              </li>
            ) : null}

            {suite.map((article, rang) => (
              <li key={article.slug}>
                <Revele rang={rang}>
                  <CarteArticle langue={langue} article={article} />
                </Revele>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
