import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { BoutonSoumission, stylesAdmin as styles } from '@/components/admin';
import { modererCommentaire } from './actions';

/**
 * LA FILE DE MODÉRATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES PLUS ANCIENS D'ABORD, ET C'EST LA BASE QUI LE DIT.                  │
 * │                                                                          │
 * │ `admin_lister_commentaires_association` trie par date de création        │
 * │ croissante. Une file traitée par les plus récents laisserait les         │
 * │ premiers messages attendre indéfiniment — et ce sont eux dont l'auteur   │
 * │ attend depuis le plus longtemps.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX BOUTONS, DEUX POIDS.                                               │
 * │                                                                          │
 * │ « Approuver » est le geste courant : il est primaire. « Masquer » est le │
 * │ refus, et il reste discret — un refus qui se clique aussi facilement     │
 * │ qu'une approbation se clique par erreur.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface LigneCommentaire {
  id: string;
  texte: string;
  statut: string;
  cree_le: string;
  auteur_nom: string | null;
  auteur_email: string | null;
  contenu_slug: string;
  contenu_titre: string | null;
}

export function OngletCommentaires({
  langue,
  commentaires,
}: {
  langue: LangueInterface;
  commentaires: LigneCommentaire[];
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);

  if (commentaires.length === 0) {
    return (
      <div className={styles.carte}>
        <p className={styles.grilleVide}>{t('admin.assoFileVide')}</p>
      </div>
    );
  }

  return (
    <div className={styles.fileModeration}>
      {commentaires.map((commentaire) => (
        <article key={commentaire.id} className={`${styles.carte} ${styles.messageCarte}`}>
          {/*
            L'INITIALE, et non une photo : l'espace n'en collecte aucune, et
            un cadre vide à la place d'un visage se lit comme une image qui
            n'a pas chargé.
          */}
          <span className={styles.messageAvatar} aria-hidden="true">
            {(commentaire.auteur_nom ?? '?').trim().charAt(0).toUpperCase()}
          </span>

          <div className={styles.messageCorps}>
            <p className={styles.messageEntete}>
              <span className={styles.messageNom}>
                {commentaire.auteur_nom ?? t('admin.nonPublie')}
              </span>
              <span className={styles.messageDate}>
                {new Date(commentaire.cree_le).toLocaleDateString(langue, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </span>
            </p>

            <p className={styles.messageSur}>
              {t('admin.assoSurArticle').replace(
                '{titre}',
                commentaire.contenu_titre ?? commentaire.contenu_slug,
              )}
            </p>

            <p className={styles.messageTexte}>{commentaire.texte}</p>
          </div>

          <div className={styles.messageGestes}>
            <form action={modererCommentaire.bind(null, langue)} className={styles.formulaireNu}>
              <input type="hidden" name="id" value={commentaire.id} />
              <input type="hidden" name="decision" value="masque" />
              <BoutonSoumission variante="discret">{t('admin.assoMasquer')}</BoutonSoumission>
            </form>

            <form action={modererCommentaire.bind(null, langue)} className={styles.formulaireNu}>
              <input type="hidden" name="id" value={commentaire.id} />
              <input type="hidden" name="decision" value="publie" />
              <BoutonSoumission variante="primaire">{t('admin.assoApprouver')}</BoutonSoumission>
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}
