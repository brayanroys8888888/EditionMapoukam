import type { Metadata } from 'next';

import { langueValide, messageErreur, traduire } from '@/i18n';
import { GabaritAdmin, BoutonSoumission, stylesAdmin as styles } from '@/components/admin';

import { exigerAdministrateur } from '../../garde';
import { deposerConte } from '../actions';

/**
 * AJOUT D'UN CONTE — le dépôt d'un PDF, et rien d'autre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL N'Y A PAS DE FORMULAIRE « CRÉER UN CONTE VIDE », ET C'EST VOULU.     │
 * │                                                                          │
 * │ Un conte naît de son fichier : la chaîne d'ingestion en tire le titre,   │
 * │ le nombre de pages, la couche de texte, les images de chaque page en     │
 * │ deux résolutions et l'EPUB. Un titre créé à la main serait une coquille  │
 * │ que rien ne pourrait remplir ensuite — et `manques_pour_publication`     │
 * │ refuserait de le publier, sans que l'éditeur comprenne pourquoi.         │
 * │                                                                          │
 * │ Le dépôt mène donc DROIT à l'écran d'édition du brouillon produit, où    │
 * │ se renseigne ce que le PDF ne porte pas : origine culturelle, âges,      │
 * │ prix. C'est là que le titre devient publiable.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'INGESTION EST LONGUE, ET L'ÉCRAN LE DIT AVANT PLUTÔT QU'APRÈS.       │
 * │                                                                          │
 * │ poppler et `sharp` travaillent sur le document entier ; deux places      │
 * │ seulement tournent en parallèle, et l'attente est bornée à dix minutes.  │
 * │ Un bouton qui reste enfoncé sans explication fait presser une seconde    │
 * │ fois — c'est-à-dire déposer le même fichier deux fois.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
/**
 * LA DURÉE MAXIMALE SE DÉCLARE ICI AUSSI, ET C'EST CONTRE-INTUITIF.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'INGESTION NE TOURNE PAS DANS LA FONCTION DE LA ROUTE D'API.           │
 * │                                                                          │
 * │ `deposerConte` appelle `ingererRoute(req)` DIRECTEMENT, en mémoire,      │
 * │ plutôt que par un `fetch` vers `/api/admin/books/ingest`. Le travail se  │
 * │ fait donc dans la fonction serverless de CETTE PAGE — celle qui héberge  │
 * │ la Server Action — et c'est son plafond à elle que Vercel applique.      │
 * │                                                                          │
 * │ Le déclarer sur la seule route d'API n'aurait donc rien corrigé, et      │
 * │ aurait eu toutes les apparences d'un correctif.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
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
    title: traduire(langue, 'admin.conteNouveau'),
    robots: { index: false, follow: false },
  };
}

export default async function PageAdminConteNouveau({ params, searchParams }: Parametres) {
  const langue = await exigerAdministrateur((await params).langue);
  const requete = await searchParams;
  const erreur = premier(requete['erreur']);

  return (
    <GabaritAdmin
      langue={langue}
      section="/contes"
      titre={traduire(langue, 'admin.conteNouveau')}
      sousTitre={traduire(langue, 'admin.conteNouveauSousTitre')}
      actions={
        <a className={styles.boutonDiscret} href={`/${langue}/admin/contes`}>
          {traduire(langue, 'admin.conteRetourListe')}
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
          ┌────────────────────────────────────────────────────────────────────┐
          │ AUCUN ENCODAGE POSÉ ICI — REACT LE CHOISIT, ET ÉCRASE LE NÔTRE.  │
          │                                                                    │
          │ Le réflexe est de déclarer l'encodage multipart, sans quoi un       │
          │ formulaire ordinaire n'enverrait que le NOM du fichier. Mais un     │
          │ formulaire dont l'action est une FONCTION est encodé par React,     │
          │ qui choisit lui-même son encodage et avertit en console qu'il       │
          │ remplacera celui qu'on a posé.                                      │
          │                                                                    │
          │ Ce qui borne réellement le dépôt est ailleurs :                     │
          │ `experimental.serverActions.bodySizeLimit` dans `next.config.ts`,   │
          │ aligné sur `TAILLE_MAX_OCTETS` de la route d'ingestion.             │
          └────────────────────────────────────────────────────────────────────┘
        */}
        <form className={styles.formulaire} action={deposerConte.bind(null, langue)}>
          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="conte-fichier">
              {traduire(langue, 'admin.conteFichier')}
            </label>
            <input
              className={styles.saisie}
              id="conte-fichier"
              name="fichier"
              type="file"
              accept="application/pdf,.pdf"
              required
              aria-describedby="conte-fichier-aide"
            />
            <p className={styles.aide} id="conte-fichier-aide">
              {traduire(langue, 'admin.conteFichierAide')}
            </p>
          </div>

          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="conte-langue">
              {traduire(langue, 'admin.conteLangue')}
            </label>
            <select className={styles.saisie} id="conte-langue" name="langue" defaultValue="fr">
              <option value="fr">{traduire(langue, 'langue.fr')}</option>
              <option value="en">{traduire(langue, 'langue.en')}</option>
            </select>
          </div>

          {/*
            Titre et auteur sont FACULTATIFS : la chaîne d'ingestion les lit
            dans le PDF. Les champs existent pour les documents qui n'en
            portent pas, ou qui en portent un mauvais — pas pour obliger à
            retaper ce que le fichier sait déjà.
          */}
          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="conte-titre">
              {traduire(langue, 'admin.conteTitreImpose')}
            </label>
            <input
              className={styles.saisie}
              id="conte-titre"
              name="titre"
              maxLength={300}
              aria-describedby="conte-titre-aide"
            />
            <p className={styles.aide} id="conte-titre-aide">
              {traduire(langue, 'admin.conteTitreImposeAide')}
            </p>
          </div>

          <div className={styles.champ}>
            <label className={styles.libelle} htmlFor="conte-auteur">
              {traduire(langue, 'admin.conteAuteurDepot')}
            </label>
            <input className={styles.saisie} id="conte-auteur" name="auteur" maxLength={200} />
          </div>

          <BoutonSoumission libelleChargement={traduire(langue, 'etats.chargement')}>
            {traduire(langue, 'admin.conteDeposer')}
          </BoutonSoumission>

        </form>
      </div>
    </GabaritAdmin>
  );
}
