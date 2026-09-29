'use client';

import { useId, useRef, useState, type ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
/*
 * LE ROTOR EST CELUI DU PROJET, pas un de plus.
 *
 * `BoutonSoumission` s'en sert déjà pour la même chose : dire qu'un geste est
 * parti et qu'on attend le serveur. Un second rotor dessiné ici tournerait à
 * une autre vitesse et dans une autre couleur, sur le même écran — et un test
 * d'architecture l'interdit, justement parce que la divergence est invisible
 * tant qu'on ne met pas les deux côte à côte.
 */
import { RotorInline } from '@/components/etats';
import styles from '@/components/admin/admin.module.css';

/**
 * CHOISIR UN FICHIER SUR L'APPAREIL, OU COLLER UNE ADRESSE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES DEUX, ET PAS L'UN À LA PLACE DE L'AUTRE.                            │
 * │                                                                          │
 * │ Les contenus déjà en base portent des adresses collées à la main, et     │
 * │ certaines pointent des fichiers qui ne nous appartiennent pas. Remplacer │
 * │ le champ par un bouton de dépôt les rendrait illisibles — et forcerait à │
 * │ re-téléverser ce qui est déjà en ligne ailleurs.                         │
 * │                                                                          │
 * │ Le champ de texte reste donc la VALEUR ; le dépôt est un raccourci qui   │
 * │ la remplit. C'est aussi ce qui garde l'écran utilisable si le dépôt      │
 * │ tombe en panne.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE COMPOSANT NE VALIDE RIEN, ET C'EST VOULU.                            │
 * │                                                                          │
 * │ `accept` oriente le sélecteur de fichiers du système ; il ne l'impose    │
 * │ pas, et un fichier glissé le contourne. La route vérifie le rôle, la     │
 * │ taille, le type déclaré ET les octets de tête. Recopier ces contrôles    │
 * │ ici donnerait deux vérités sur ce qui est acceptable, et c'est celle du  │
 * │ navigateur qu'on croirait — celle qui se pilote.                         │
 * │                                                                          │
 * │ Ce qui est fait ici, en revanche, c'est de DIRE ce que le serveur a      │
 * │ répondu : un refus muet ferait chercher la panne dans le fichier.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les rôles que la route connaît. Le rôle décide du bucket, donc du public. */
export type RoleFichier = 'couverture' | 'photo' | 'video' | 'audio' | 'document';

/** Ce que le sélecteur du système proposera en premier. */
const ACCEPT: Record<RoleFichier, string> = {
  couverture: 'image/webp,image/avif,image/png,image/jpeg',
  photo: 'image/webp,image/avif,image/png,image/jpeg',
  video: 'video/mp4,video/webm',
  audio: 'audio/mpeg,audio/mp4,audio/ogg,audio/wav',
  document: 'application/pdf',
};

interface Refus {
  erreur?: { code?: string; message?: string; champs?: Record<string, string[]> };
}

export function ChampFichier({
  langue,
  role,
  onDepose,
}: {
  langue: LangueInterface;
  role: RoleFichier;
  /**
   * Reçoit le CHEMIN DE STOCKAGE — ce qui part en base — ET l'adresse
   * d'aperçu, qui ne sert qu'à l'écran. Les confondre écrirait en base une
   * URL signée, périmée cinq minutes plus tard.
   */
  onDepose: (chemin: string, apercu: string | null) => void;
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);
  const champId = useId();

  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UN DÉPÔT MUET PASSE POUR UN DÉPÔT RATÉ.                              │
   * │                                                                      │
   * │ Sans cette ligne, le seul retour visible était un champ de texte qui  │
   * │ se remplissait d'un chemin de stockage — `association-fichiers/a5b0…` │
   * │ —, c'est-à-dire de ce qui ressemble le plus à rien. L'éditeur croyait │
   * │ son fichier perdu et recommençait, ou renonçait.                      │
   * │                                                                      │
   * │ Le nom d'origine est jeté par le serveur, et c'est voulu ; mais il    │
   * │ est parfaitement bon pour DIRE ce qui vient de partir, ici, à l'écran.│
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const [depose, setDepose] = useState<string | null>(null);
  const entree = useRef<HTMLInputElement>(null);

  const deposer = async (fichier: File): Promise<void> => {
    setEnvoi(true);
    setRefus(null);
    setDepose(null);

    try {
      const corps = new FormData();
      corps.set('role', role);
      corps.set('fichier', fichier);

      const reponse = await fetch('/api/admin/association/fichiers', {
        method: 'POST',
        body: corps,
        // La session voyage par cookie ; rien d'autre n'est transmis.
        credentials: 'same-origin',
      });

      if (!reponse.ok) {
        /*
         * Le message du serveur est PRÉFÉRÉ au nôtre : il dit lequel des
         * quatre contrôles a refusé — le format, la taille, le rôle, ou les
         * octets de tête. Une phrase générique ferait recommencer à l'aveugle.
         */
        const details = (await reponse.json().catch(() => null)) as Refus | null;
        const premier = Object.values(details?.erreur?.champs ?? {})[0]?.[0];
        setRefus(premier ?? details?.erreur?.message ?? t('admin.redDepotEchec'));
        return;
      }

      const { chemin, apercu } = (await reponse.json()) as {
        chemin: string;
        apercu: string | null;
      };
      setDepose(fichier.name);
      onDepose(chemin, apercu);
    } catch {
      // Réseau coupé, requête interrompue : ce n'est pas un refus du serveur,
      // et le dire autrement enverrait chercher un défaut dans le fichier.
      setRefus(t('admin.redDepotReseau'));
    } finally {
      setEnvoi(false);
      /*
       * Le champ est VIDÉ après coup. Sans cela, redéposer deux fois le même
       * fichier — après l'avoir corrigé sur le disque — n'émet aucun
       * évènement : la valeur n'a pas changé, donc rien ne se passe, et l'on
       * croit le dépôt cassé.
       */
      if (entree.current) entree.current.value = '';
    }
  };

  return (
    <span className={styles.depot}>
      <label className={styles.depotBouton} htmlFor={champId}>
        {envoi ? <RotorInline /> : null}
        {envoi ? t('admin.redDepotEnCours') : t('admin.redDepotChoisir')}
      </label>

      <input
        ref={entree}
        className={styles.depotEntree}
        id={champId}
        type="file"
        accept={ACCEPT[role]}
        disabled={envoi}
        onChange={(evenement) => {
          const fichier = evenement.target.files?.[0];
          if (fichier) void deposer(fichier);
        }}
      />

      {refus === null ? null : (
        <span className={styles.depotRefus} role="alert">
          {refus}
        </span>
      )}

      {/*
        `role="status"` et non `alert` : c'est une bonne nouvelle, annoncée
        après coup. Une alerte interromprait la lecture pour dire que tout va
        bien.
      */}
      {depose === null || refus !== null ? null : (
        <span className={styles.depotFait} role="status">
          {t('admin.redDepotFait').replace('{nom}', depose)}
        </span>
      )}
    </span>
  );
}
