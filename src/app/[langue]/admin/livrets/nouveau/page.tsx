import type { Metadata } from 'next';

import { langueValide, messageErreur, traduire } from '@/i18n';
import { GabaritAdmin, BoutonSoumission, stylesAdmin as styles } from '@/components/admin';

import { exigerAdministrateur } from '../../garde';
import { deposerLivret } from '../../contes/actions';

/**
 * DÉPÔT D'UN LIVRET PÉDAGOGIQUE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UN ÉCRAN SÉPARÉ ALORS QUE LA CHAÎNE EST LA MÊME.               │
 * │                                                                          │
 * │ Techniquement, un `<select>` de plus sur l'écran de dépôt des contes     │
 * │ aurait suffi — c'est UNE colonne qui change. Mais un type de document    │
 * │ posé par une liste déroulante est un type qu'on oublie : le défaut       │
 * │ « conte » est juste dans quatre-vingt-dix pour cent des dépôts, et les   │
 * │ dix pour cent restants seraient publiés en contes sans qu'aucun message  │
 * │ ne le signale — `type_document` est NOT NULL avec un défaut, donc rien   │
 * │ ne manque jamais, et `manques_pour_publication` reste muet.              │
 * │                                                                          │
 * │ Deux portes, deux intentions, aucun choix à ne pas oublier. C'est le     │
 * │ seul écart : derrière, même route d'ingestion, mêmes droits, même écran  │
 * │ d'édition, même catalogue.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ORIENTATION SE DÉCLARE, ELLE NE SE DEVINE PAS.                        │
 * │                                                                          │
 * │ La tentation est de la lire dans les dimensions de la première page.     │
 * │ Elle ment : un livret a très souvent une couverture en portrait devant   │
 * │ des planches en paysage, et une page double d'album mesurerait « paysage │
 * │ » sur un conte qui n'en est pas un. Le déposant, lui, sait ce qu'il      │
 * │ dépose — et il peut encore corriger depuis l'écran d'édition.            │
 * │                                                                          │
 * │ Le défaut est `paysage` : c'est la mise en page usuelle d'un livret      │
 * │ d'activités, projeté ou imprimé en A4 à l'italienne.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * LA DURÉE MAXIMALE SE DÉCLARE SUR LA PAGE, PAS SUR LA ROUTE D'API.
 *
 * `deposerLivret` appelle `ingererRoute(req)` EN MÉMOIRE, comme `deposerConte`.
 * Le travail tourne donc dans la fonction serverless de cet écran-ci, et c'est
 * son plafond à elle que Vercel applique. Le déclarer sur la seule route
 * d'ingestion n'aurait rien corrigé, avec toutes les apparences d'un correctif.
 */
export const maxDuration = 60;

interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'admin.livretNouveau'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminLivretNouveau({ params, searchParams }: Parametres) {
  const langue = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;
  const erreur = premier(requete['erreur']);

  return (
    <GabaritAdmin
      langue={langue}
      // Déposer un livret, c'est être dans le rayon des livrets : le rail le
      // dit, et le bouton de retour y ramène.
      section="/livrets"
      titre={traduire(langue, 'admin.livretNouveau')}
      sousTitre={traduire(langue, 'admin.livretNouveauSousTitre')}
      actions={
        <a className={styles.boutonDiscret} href={`/${langue}/admin/livrets`}>
          {traduire(langue, 'admin.livretRetourListe')}
        </a>
      }
    >
      {erreur ? (
        <p className={styles.alerte} role="alert">
          {messageErreur(langue, erreur)}
        </p>
      ) : null}

      <div className={styles.cadre}>
        {/*
          Aucun `encType` posé ici : un formulaire dont l'action est une
          FONCTION est encodé par React, qui avertit en console qu'il remplacera
          celui qu'on aurait écrit. Ce qui borne réellement le dépôt est
          `experimental.serverActions.bodySizeLimit` dans `next.config.ts`,
          aligné sur `TAILLE_MAX_OCTETS` de la route d'ingestion.
        */}
        <form className={styles.formulaire} action={deposerLivret.bind(null, langue)}>
          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="livret-fichier">
              {traduire(langue, 'admin.conteFichier')}
            </label>
            <input
              className={styles.saisie}
              id="livret-fichier"
              name="fichier"
              type="file"
              accept="application/pdf,.pdf"
              required
              aria-describedby="livret-fichier-aide"
            />
            <p className={styles.aide} id="livret-fichier-aide">
              {traduire(langue, 'admin.livretFichierAide')}
            </p>
          </div>

          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="livret-langue">
              {traduire(langue, 'admin.conteLangue')}
            </label>
            <select className={styles.saisie} id="livret-langue" name="langue" defaultValue="fr">
              <option value="fr">{traduire(langue, 'langue.fr')}</option>
              <option value="en">{traduire(langue, 'langue.en')}</option>
            </select>
          </div>

          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="livret-orientation">
              {traduire(langue, 'admin.conteOrientation')}
            </label>
            <select
              className={styles.saisie}
              id="livret-orientation"
              name="orientation"
              defaultValue="paysage"
              aria-describedby="livret-orientation-aide"
            >
              <option value="paysage">{traduire(langue, 'orientations.paysage')}</option>
              <option value="portrait">{traduire(langue, 'orientations.portrait')}</option>
            </select>
            <p className={styles.aide} id="livret-orientation-aide">
              {traduire(langue, 'admin.livretOrientationAide')}
            </p>
          </div>

          {/*
            Titre et auteur restent FACULTATIFS, comme au dépôt d'un conte : la
            chaîne d'ingestion les lit dans le PDF. Les champs existent pour les
            documents qui n'en portent pas — pas pour faire retaper ce que le
            fichier sait déjà.
          */}
          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="livret-titre">
              {traduire(langue, 'admin.conteTitreImpose')}
            </label>
            <input
              className={styles.saisie}
              id="livret-titre"
              name="titre"
              maxLength={300}
              aria-describedby="livret-titre-aide"
            />
            <p className={styles.aide} id="livret-titre-aide">
              {traduire(langue, 'admin.conteTitreImposeAide')}
            </p>
          </div>

          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="livret-auteur">
              {traduire(langue, 'admin.conteAuteurDepot')}
            </label>
            <input className={styles.saisie} id="livret-auteur" name="auteur" maxLength={200} />
          </div>

          <BoutonSoumission libelleChargement={traduire(langue, 'etats.chargement')}>
            {traduire(langue, 'admin.livretDeposer')}
          </BoutonSoumission>
        </form>
      </div>
    </GabaritAdmin>
  );
}
