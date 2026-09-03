import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { FicheLivre } from '@/domain/catalog/types';
import type { AvisDuLivre } from '@/lib/catalog/avis';
import { Bouton } from '@/components/base';
import styles from './avis.module.css';

/**
 * LES AVIS DES LECTEURS SUR UN TITRE — §4.1, migration 0072.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE COMPOSANT NE DÉCIDE D'AUCUN DROIT.                                   │
 * │                                                                          │
 * │ Qui peut écrire un avis est décidé par la politique                      │
 * │ `book_reviews_ecriture`, qui exige `(access_for(uid, book_id)).can_read` │
 * │ — l'unique implémentation du droit de lire, celle qu'appellent déjà la   │
 * │ lecture en ligne et le téléchargement.                                   │
 * │                                                                          │
 * │ L'écran LIT `fiche.acces.canRead` pour savoir s'il montre le formulaire  │
 * │ ou une explication. Il ne le RECALCULE pas — pas de « a acheté ou est    │
 * │ abonné » écrit ici, qui serait une seconde implémentation et finirait    │
 * │ par diverger. Un test d'architecture l'impose.                           │
 * │                                                                          │
 * │ Et si l'écran se trompait malgré tout, la base refuserait : le           │
 * │ formulaire n'est qu'une politesse posée devant une porte déjà fermée.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI « PEUT LIRE » ET NON « A ACHETÉ ».                             │
 * │                                                                          │
 * │ Un avis se donne sur ce qu'on a lu. Réserver l'écriture aux seuls        │
 * │ ACHETEURS en priverait les abonnés — c'est-à-dire le chemin de lecture   │
 * │ principal de la plateforme — et interdirait tout avis sur un titre       │
 * │ offert, que n'importe qui peut lire en entier. `can_read` couvre les     │
 * │ trois cas, et c'est déjà lui qui décide ce que le lecteur a pu ouvrir.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const NOTE_MAX = 5;

/**
 * Les étoiles, purement DÉCORATIVES.
 *
 * La note chiffrée est écrite à côté. Cinq caractères annoncés un par un par
 * un lecteur d'écran seraient du bruit, d'où l'`aria-hidden`.
 */
function Etoiles({ note }: { note: number }): ReactNode {
  const pleines = Math.round(note);
  return (
    <span className={styles.etoiles} aria-hidden="true">
      {'★'.repeat(pleines)}
      {'☆'.repeat(Math.max(0, NOTE_MAX - pleines))}
    </span>
  );
}

export function SectionAvis({
  langue,
  fiche,
  avis,
  connecte,
  actionDepot,
  actionRetrait,
}: {
  langue: LangueInterface;
  fiche: FicheLivre;
  avis: AvisDuLivre;
  /** L'appelant a une session. Distinct du droit d'écrire : il faut les deux. */
  connecte: boolean;
  actionDepot?: (donnees: FormData) => void | Promise<void>;
  actionRetrait?: () => void | Promise<void>;
}): ReactNode {
  const mien = avis.mien;

  return (
    <section id="avis" className={styles.section} aria-labelledby="titre-avis">
      <div className={styles.entete}>
        <h2 id="titre-avis" className={styles.titre}>
          {traduire(langue, 'fiche.avisTitre')}
        </h2>

        {avis.moyenne !== null ? (
          <p className={styles.synthese}>
            <Etoiles note={avis.moyenne} />
            <span className={styles.moyenne}>
              {traduire(langue, 'fiche.avisMoyenne').replace(
                '{moyenne}',
                avis.moyenne.toLocaleString(langue),
              )}
            </span>
            <span>
              {avis.publies.length === 1
                ? traduire(langue, 'fiche.avisNombreUn')
                : traduire(langue, 'fiche.avisNombre').replace(
                    '{nombre}',
                    String(avis.publies.length),
                  )}
            </span>
          </p>
        ) : null}
      </div>

      {avis.publies.length === 0 ? (
        <p className={styles.vide}>{traduire(langue, 'fiche.avisAucun')}</p>
      ) : (
        <ul className={styles.liste}>
          {avis.publies.map((un) => (
            <li key={un.id} className={styles.avis}>
              <p className={styles.synthese}>
                <Etoiles note={un.note} />
                {/*
                  La note chiffrée est ÉCRITE, et non seulement dessinée : elle
                  est la seule forme que lit un lecteur d'écran, et la seule
                  que voit quelqu'un qui distingue mal les couleurs.
                */}
                <span className={styles.moyenne}>
                  {traduire(langue, 'fiche.avisMoyenne').replace('{moyenne}', String(un.note))}
                </span>
              </p>

              <p className={styles.avisTexte}>{un.texte}</p>
              <p className={styles.avisAuteur}>{un.auteur}</p>
            </li>
          ))}
        </ul>
      )}

      {/*
        ┌────────────────────────────────────────────────────────────────────┐
        │ TROIS ÉTATS, ET UN SEUL VISIBLE À LA FOIS.                        │
        │                                                                    │
        │ Visiteur non connecté : une invitation à se connecter. Connecté     │
        │ mais sans accès au titre : la raison, dite explicitement. Sans      │
        │ cette phrase, l'absence de formulaire se lit comme une panne — le   │
        │ même défaut que le bouton de téléchargement manquant chez l'abonné. │
        └────────────────────────────────────────────────────────────────────┘
      */}
      {!connecte ? (
        <p className={styles.invite}>
          {/*
            Pas de `?suite=` : l'écran de connexion ne lit aucun paramètre de
            retour aujourd'hui. En poser un ici promettrait un retour à la
            fiche qui n'aurait pas lieu — mieux vaut un lien qui tient parole.
          */}
          <a href={`/${langue}/connexion`}>{traduire(langue, 'fiche.avisConnexion')}</a>
        </p>
      ) : !fiche.acces.canRead ? (
        <p className={styles.invite}>{traduire(langue, 'fiche.avisReserve')}</p>
      ) : actionDepot ? (
        <>
          {mien ? (
            <div className={styles.etat}>
              <p>
                {mien.statut === 'publie'
                  ? traduire(langue, 'fiche.avisPublie')
                  : mien.statut === 'rejete'
                    ? traduire(langue, 'fiche.avisRefuse')
                    : traduire(langue, 'fiche.avisEnAttente')}
              </p>
              {mien.statut === 'rejete' && mien.motif_rejet ? (
                <p className={styles.etatMotif}>{mien.motif_rejet}</p>
              ) : null}
            </div>
          ) : null}

          <form className={styles.formulaire} action={actionDepot}>
            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="avis-note">
                {traduire(langue, 'fiche.avisNote')}
              </label>
              {/*
                Un `<select>` de cinq valeurs, et non un rang d'étoiles
                cliquables : les étoiles demandent du JavaScript pour être
                utilisables au clavier, et cet écran est rendu côté serveur.
                Un menu déroulant est accessible sans une ligne de script.
              */}
              <select
                className={styles.saisie}
                id="avis-note"
                name="note"
                required
                defaultValue={mien ? String(mien.note) : ''}
              >
                <option value="" disabled>
                  {traduire(langue, 'fiche.avisNoteVide')}
                </option>
                {[5, 4, 3, 2, 1].map((note) => (
                  <option key={note} value={note}>
                    {traduire(langue, 'fiche.avisMoyenne').replace('{moyenne}', String(note))}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="avis-nom">
                {traduire(langue, 'fiche.avisNom')}
              </label>
              {/*
                Le nom affiché est CHOISI, jamais déduit du compte : l'adresse
                électronique est une donnée personnelle, et le nom du profil
                n'a pas été donné pour être publié sous un avis public.
              */}
              <input
                className={styles.saisie}
                id="avis-nom"
                name="auteur_affiche"
                maxLength={60}
                required
                defaultValue={mien?.auteur ?? ''}
                aria-describedby="avis-nom-aide"
              />
              <p className={styles.aide} id="avis-nom-aide">
                {traduire(langue, 'fiche.avisNomAide')}
              </p>
            </div>

            <div className={styles.champ}>
              <label className={styles.libelle} htmlFor="avis-texte">
                {traduire(langue, 'fiche.avisTexte')}
              </label>
              <textarea
                className={`${styles.saisie} ${styles.zoneTexte}`}
                id="avis-texte"
                name="texte"
                minLength={10}
                maxLength={2000}
                required
                defaultValue={mien?.texte ?? ''}
                aria-describedby="avis-texte-aide"
              />
              <p className={styles.aide} id="avis-texte-aide">
                {traduire(langue, 'fiche.avisTexteAide')}
              </p>
            </div>

            <div className={styles.boutons}>
              <Bouton type="submit">
                {traduire(langue, mien ? 'fiche.avisCorriger' : 'fiche.avisDeposer')}
              </Bouton>
            </div>
          </form>

          {/*
            Le retrait est un formulaire À PART, et non un second bouton du
            premier : deux boutons dans un même formulaire partagent sa
            validation, et « Retirer » refuserait de partir tant que le texte
            est trop court — c'est-à-dire exactement quand on veut l'effacer.
          */}
          {mien && actionRetrait ? (
            <form className={styles.retrait} action={actionRetrait}>
              <Bouton type="submit" variante="discret">
                {traduire(langue, 'fiche.avisRetirer')}
              </Bouton>
            </form>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
