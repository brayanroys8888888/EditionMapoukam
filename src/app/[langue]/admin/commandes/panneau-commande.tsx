import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { BlocPanneau, EtapeSuivi, Panneau, stylesAdmin as styles } from '@/components/admin';
import { rembourser } from './actions';

/**
 * LE PANNEAU D'UNE COMMANDE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA FRISE RACONTE CE QUI S'EST PASSÉ, PAS CE QU'ON SOUHAITE.             │
 * │                                                                          │
 * │ Quatre statuts, quatre récits. Celui d'une commande « en attente » se    │
 * │ termine sur une étape CREUSE — la confirmation du prestataire n'est pas  │
 * │ arrivée — et c'est tout l'intérêt de l'écran : dire à l'éditeur que      │
 * │ l'argent n'est ni encaissé ni perdu, mais en suspens chez un tiers.      │
 * │                                                                          │
 * │ Les libellés distinguent la carte du paiement mobile, parce que « validé │
 * │ sur le téléphone » et « autorisé par la banque » ne décrivent pas le     │
 * │ même geste — et que la personne au bout du fil, elle, sait lequel elle a │
 * │ fait.                                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export interface LigneAchat {
  book_id: string;
  slug: string;
  type_document: 'conte' | 'livret_pedagogique';
  langue: string;
  prix_unitaire: number;
  devise: string;
}

export interface DetailCommande {
  id: string;
  numero: number;
  nom: string | null;
  email: string | null;
  montant_total: number;
  remise: number;
  devise: string;
  zone: string;
  statut: 'en_attente' | 'paye' | 'echoue' | 'rembourse';
  moyen_paiement: 'carte' | 'orange_money' | 'mtn_momo' | 'autre' | null;
  motif_remboursement: string | null;
  pays_paiement: string | null;
  cree_le: string;
  paye_le: string | null;
  maj_le: string;
  acheteur_anonymise: boolean;
  code_promo: string | null;
  lignes: LigneAchat[];
}

const MOTIFS = [
  'demande_client',
  'paiement_double',
  'fichier_defectueux',
  'geste_commercial',
] as const;

const LIBELLE_MOTIF: Record<(typeof MOTIFS)[number], CleTraduction> = {
  demande_client: 'admin.cmdMotifDemandeClient',
  paiement_double: 'admin.cmdMotifPaiementDouble',
  fichier_defectueux: 'admin.cmdMotifFichierDefectueux',
  geste_commercial: 'admin.cmdMotifGesteCommercial',
};

/** `true` quand le paiement s'est fait sur un téléphone, et non par carte. */
function surTelephone(moyen: DetailCommande['moyen_paiement']): boolean {
  return moyen === 'orange_money' || moyen === 'mtn_momo';
}

export function PanneauCommande({
  langue,
  commande,
  fermeture,
  filtres,
  confirmeRemboursement,
  urlConfirmer,
  formater,
}: {
  langue: LangueInterface;
  commande: DetailCommande;
  fermeture: string;
  /**
   * Le formateur de la devise de CETTE commande, résolu par la page.
   *
   * Le tiroir ne le résout pas lui-même : `lireDevise` touche la base, et
   * une commande de huit lignes ferait huit allers-retours pour la même
   * réponse. La page en tient déjà un par devise présente.
   */
  formater: (montant: number) => string;
  /** Les filtres courants, reportés dans le formulaire pour survivre à l'envoi. */
  filtres: { statut?: string; devise?: string; q?: string };
  confirmeRemboursement: boolean;
  urlConfirmer: string;
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);
  const anonyme = t('admin.nonPublie');

  const dateLongue = (iso: string): string =>
    new Date(iso).toLocaleDateString(langue, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });


  /*
   * L'étiquette reprend EXACTEMENT celle de la ligne du tableau : même
   * libellé, même teinte. Un tiroir qui nommerait l'état autrement que la
   * liste d'où on vient ferait douter d'avoir ouvert la bonne commande.
   */
  const libelleStatut: CleTraduction = (
    {
      paye: 'admin.cmdPayee',
      en_attente: 'admin.cmdEnAttente',
      echoue: 'admin.cmdEchouee',
      rembourse: 'admin.cmdRemboursee',
    } as const
  )[commande.statut];

  const etatPastille =
    commande.statut === 'paye'
      ? styles.etatPublie
      : commande.statut === 'en_attente'
        ? styles.etatAccent
        : commande.statut === 'echoue'
          ? styles.etatAlerte
          : styles.etatBrouillon;

  const intitule =
    commande.statut === 'paye'
      ? 'admin.cmdTotalPaye'
      : commande.statut === 'rembourse'
        ? 'admin.cmdTotalRembourse'
        : 'admin.cmdTotalMontant';

  return (
    <Panneau
      langue={langue}
      oeil={t('admin.panneauCommande')}
      titre={`EM-${String(commande.numero)}`}
      fermeture={fermeture}
      /*
       * PENDANT LA CONFIRMATION, LE PIED DISPARAIT.
       *
       * La carte de confirmation porte deja ses deux boutons ; laisser
       * « Fermer » en bas donnerait trois sorties pour une seule decision, et
       * la plus visible — collante, en bas a droite — serait celle qui ne
       * confirme rien. Le prototype masque le pied pour la meme raison.
       */
      pied={
        confirmeRemboursement ? undefined : commande.statut === 'paye' ? (
          <a className={styles.boutonSecondaire} href={urlConfirmer}>
            {t('admin.cmdRembourser')}
          </a>
        ) : (
          <a className={styles.boutonDiscret} href={fermeture}>
            {t('admin.panneauFermer')}
          </a>
        )
      }
    >
      {/* ── 1. L'état, et quand ─────────────────────────────────────────── */}
      <div className={styles.tiroirEtat}>
        <span className={`${styles.etat} ${etatPastille}`}>{t(libelleStatut)}</span>
        <p className={styles.tiroirMeta}>
          {dateLongue(commande.cree_le)} · {t(`admin.conteZone_${commande.zone}` as CleTraduction)}
        </p>
      </div>

      {/* ── 2. Le client ────────────────────────────────────────────────── */}
      <BlocPanneau titre={t('admin.colClient')}>
        <p className={styles.tiroirNom}>
          {commande.acheteur_anonymise ? anonyme : (commande.nom ?? anonyme)}
        </p>
        {commande.acheteur_anonymise ? null : (
          <p className={styles.tiroirMeta}>{commande.email ?? ''}</p>
        )}
      </BlocPanneau>

      {/* ── 3. Le contenu, ligne par ligne ──────────────────────────────── */}
      <BlocPanneau titre={t('admin.colContenu')}>
        {commande.lignes.map((ligne) => (
          <div key={`${ligne.book_id}-${ligne.langue}`} className={styles.tiroirLigne}>
            <div>
              <p className={styles.tiroirLigneNom}>{ligne.slug}</p>
              <p className={styles.tiroirLigneType}>
                {t(`documents.${ligne.type_document}` as CleTraduction)}
              </p>
            </div>
            <p className={styles.tiroirLignePrix}>{formater(ligne.prix_unitaire)}</p>
          </div>
        ))}

        {/*
          La remise est rendue NÉGATIVE et à part, jamais fondue dans le total :
          une commande dont on ne voit que le montant final ne permet pas de
          vérifier qu'un code promotionnel a bien été décompté.
        */}
        {commande.remise > 0 ? (
          <div className={`${styles.tiroirLigne} ${styles.tiroirRemise}`}>
            <p className={styles.tiroirLigneNom}>
              {t('admin.cmdCodePromo')} {commande.code_promo ?? ''}
            </p>
            <p className={styles.tiroirLignePrix}>− {formater(commande.remise)}</p>
          </div>
        ) : null}

        <div className={styles.tiroirTotal}>
          <span>{t(intitule)}</span>
          <span>{formater(commande.montant_total)}</span>
        </div>

        {commande.moyen_paiement ? (
          <p className={styles.tiroirMeta}>
            {t(
              (
                {
                  carte: 'admin.moyenCarte',
                  orange_money: 'admin.moyenOrangeMoney',
                  mtn_momo: 'admin.moyenMtnMomo',
                  autre: 'admin.moyenAutre',
                } as const
              )[commande.moyen_paiement],
            )}
          </p>
        ) : null}
      </BlocPanneau>

      {/* ── 4. La frise de suivi ────────────────────────────────────────── */}
      <BlocPanneau titre={t('admin.cmdSuivi')}>
        <ol className={styles.suivi}>
          <EtapeSuivi etat="faite" libelle={t('admin.cmdEtapeCreee')} detail={dateLongue(commande.cree_le)} />

          {commande.statut === 'paye' || commande.statut === 'rembourse' ? (
            <>
              <EtapeSuivi
                etat="faite"
                libelle={t(
                  surTelephone(commande.moyen_paiement)
                    ? 'admin.cmdEtapeValidee'
                    : 'admin.cmdEtapeAutorisee',
                )}
              />
              <EtapeSuivi etat="faite" libelle={t('admin.cmdEtapeConfirmee')} />
              <EtapeSuivi
                etat="faite"
                libelle={t('admin.cmdEtapeAcces')}
                detail={commande.paye_le ? dateLongue(commande.paye_le) : undefined}
                derniere={commande.statut === 'paye'}
              />
              {commande.statut === 'rembourse' ? (
                <EtapeSuivi
                  etat="incident"
                  libelle={t('admin.cmdEtapeRembourse')}
                  detail={
                    commande.motif_remboursement
                      ? t(LIBELLE_MOTIF[commande.motif_remboursement as (typeof MOTIFS)[number]])
                      : dateLongue(commande.maj_le)
                  }
                  derniere
                />
              ) : null}
            </>
          ) : null}

          {commande.statut === 'en_attente' ? (
            <>
              <EtapeSuivi etat="faite" libelle={t('admin.cmdEtapeDemande')} />
              <EtapeSuivi etat="attente" libelle={t('admin.cmdEtapeAttente')} derniere />
            </>
          ) : null}

          {commande.statut === 'echoue' ? (
            <EtapeSuivi etat="incident" libelle={t('admin.cmdEtapeRefuse')} derniere />
          ) : null}
        </ol>
      </BlocPanneau>

      {/* ── 5. Ce que la commande a ouvert ──────────────────────────────── */}
      {commande.statut === 'paye' ? (
        <BlocPanneau titre={t('admin.cmdAccesOuverts')}>
          <p className={styles.tiroirMeta}>{t('admin.cmdAccesTexte')}</p>
        </BlocPanneau>
      ) : null}

      {/* ── 6. L'attente, dite pour ce qu'elle est ──────────────────────── */}
      {commande.statut === 'en_attente' ? (
        <div className={styles.avertissement}>
          <p className={styles.tiroirNom}>{t('admin.cmdAttenteTitre')}</p>
          <p className={styles.tiroirMeta}>{t('admin.cmdAttenteTexte')}</p>
        </div>
      ) : null}

      {/* ── 7. La confirmation de remboursement ─────────────────────────── */}
      {confirmeRemboursement ? (
        <form action={rembourser.bind(null, langue)} className={styles.confirmation}>
          <input type="hidden" name="commande" value={commande.id} />
          {filtres.statut ? <input type="hidden" name="statut" value={filtres.statut} /> : null}
          {filtres.devise ? <input type="hidden" name="devise" value={filtres.devise} /> : null}
          {filtres.q ? <input type="hidden" name="q" value={filtres.q} /> : null}

          <p className={styles.tiroirNom}>{t('admin.cmdRemboursementTitre')}</p>
          <p className={styles.tiroirMeta}>{t('admin.cmdRemboursementTexte')}</p>

          {/*
            Le motif est REQUIS, et la liste est close. Un champ libre aurait
            laissé écrire n'importe quoi à destination d'un client — y compris
            ce qu'on n'écrit pas à un client.
          */}
          <p className={styles.tiroirBlocTitre}>
            <label htmlFor="motif-remboursement">{t('admin.cmdMotif')}</label>
          </p>
          <select id="motif-remboursement" name="motif" required className={styles.champ}>
            {MOTIFS.map((motif) => (
              <option key={motif} value={motif}>
                {t(LIBELLE_MOTIF[motif])}
              </option>
            ))}
          </select>

          <div className={styles.tiroirActions}>
            <a className={styles.boutonDiscret} href={fermeture}>
              {t('admin.cmdAnnuler')}
            </a>
            <button type="submit" className={styles.boutonPrimaire}>
              {t('admin.cmdConfirmerRemboursement')}
            </button>
          </div>
        </form>
      ) : null}
    </Panneau>
  );
}
