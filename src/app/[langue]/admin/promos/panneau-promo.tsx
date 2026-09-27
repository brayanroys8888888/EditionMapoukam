import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { BlocPanneau, BoutonSoumission, Panneau, stylesAdmin as styles } from '@/components/admin';
import { creerPromo } from './actions';

/**
 * LE PANNEAU DE CRÉATION D'UN CODE PROMOTIONNEL.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CODE SE CRÉE, IL NE SE MODIFIE PAS DEPUIS CET ÉCRAN.                 │
 * │                                                                          │
 * │ `admin_enregistrer_promo` sait faire les deux — elle écrit ou remplace   │
 * │ la ligne du code donné. Mais un code déjà distribué a été imprimé,       │
 * │ dicté, promis : en changer la valeur ferait varier une remise que des    │
 * │ clients tiennent pour acquise, sans que rien ne le dise. Le désactiver   │
 * │ est le geste honnête, et il reste à écrire.                              │
 * │                                                                          │
 * │ Le prototype montre donc un panneau d'ÉDITION que nous n'ouvrons pas.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS CHAMPS DU PROTOTYPE SONT ABSENTS, ET C'EST DÉLIBÉRÉ.              │
 * │                                                                          │
 * │ « S'applique à » (contes, livrets, abonnement, adhésion), « par client » │
 * │ et « première commande uniquement » ne sont pas des champs d'affichage : │
 * │ ils changent ce qu'un code COUVRE, donc le calcul de la remise, donc ce  │
 * │ qui est facturé. `docs/cahier-des-charges.md` ne les porte pas, et       │
 * │ CLAUDE.md interdit d'inventer une règle métier absente de la             │
 * │ spécification. Une note le dit à l'éditeur plutôt qu'un champ muet.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const TYPES = ['pourcentage', 'montant'] as const;
const DEVISES = ['EUR', 'XAF', 'XOF'] as const;
const ZONES = ['international', 'afrique'] as const;

export function PanneauPromo({
  langue,
  fermeture,
}: {
  langue: LangueInterface;
  fermeture: string;
}): ReactNode {
  const t = (cle: CleTraduction): string => traduire(langue, cle);

  return (
    <Panneau
      langue={langue}
      oeil={t('admin.promos')}
      titre={t('admin.promoNouveau')}
      fermeture={fermeture}
    >
      <form className={styles.formulaire} action={creerPromo.bind(null, langue)}>
        {/*
          ┌────────────────────────────────────────────────────────────────┐
          │ LE MOTIF DU CHAMP EST CELUI DE LA ROUTE, NI PLUS NI MOINS.     │
          │                                                                │
          │ Lettres et chiffres, sans tiret : c'est la règle du serveur, et │
          │ elle a sa raison — « un code se dicte au téléphone et se        │
          │ recopie à la main ». Un motif plus PERMISSIF que le serveur est │
          │ un piège : le formulaire accepte, la route refuse, et l'éditeur │
          │ reçoit une erreur pour une saisie que l'écran lui a laissé      │
          │ faire. Le client doit toujours céder.                           │
          │                                                                │
          │ Le prototype montre « DAVE-ATELIER » : ses codes portent des    │
          │ tirets. Les autoriser est une décision, pas un détail d'écran,  │
          │ et elle appartient au propriétaire.                             │
          │                                                                │
          │ Le tiret NU dans une classe est par ailleurs interdit : les     │
          │ navigateurs compilent `pattern` avec l'indicateur `v`, et un    │
          │ motif invalide fait LEVER `checkValidity` — le formulaire ne    │
          │ part alors jamais, sans message ni erreur visible.              │
          │ `motifs-html.test.ts` monte la garde.                           │
          └────────────────────────────────────────────────────────────────┘
        */}
        <BlocPanneau titre={t('admin.promoCode')}>
          <input
            className={`${styles.saisie} ${styles.saisieCode}`}
            id="promo-code"
            name="code"
            required
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9]+"
            autoComplete="off"
          />
          <p className={styles.aide}>{t('admin.promoCodeAide')}</p>
        </BlocPanneau>

        <BlocPanneau titre={t('admin.promoType')}>
          <select className={styles.saisie} id="promo-type" name="type" defaultValue="pourcentage">
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`admin.promoType_${type}` as CleTraduction)}
              </option>
            ))}
          </select>

          <label className={styles.libelle} htmlFor="promo-valeur">
            {t('admin.promoValeur')}
          </label>
          <input
            className={styles.saisie}
            id="promo-valeur"
            name="valeur"
            type="number"
            min={1}
            required
          />
          <p className={styles.aide}>{t('admin.promoValeurAide')}</p>
        </BlocPanneau>

        {/*
          ┌──────────────────────────────────────────────────────────────────┐
          │ DEVISE ET ZONE RESTENT VISIBLES, MÊME POUR UN POURCENTAGE.       │
          │                                                                  │
          │ Les masquer demanderait du JavaScript là où il n'y en a aucun —  │
          │ et un champ masqué reste un champ rempli : c'est l'action qui     │
          │ décide de ne pas les envoyer. Leur aide explique quand ils       │
          │ comptent. Un champ qui disparaît sans explication apprend moins   │
          │ qu'un champ qui dit à quoi il sert.                               │
          └──────────────────────────────────────────────────────────────────┘
        */}
        <BlocPanneau titre={t('admin.promoDeviseZone')}>
          <label className={styles.libelle} htmlFor="promo-devise">
            {t('admin.promoDevise')}
          </label>
          <select className={styles.saisie} id="promo-devise" name="devise" defaultValue="EUR">
            {DEVISES.map((devise) => (
              <option key={devise} value={devise}>
                {devise}
              </option>
            ))}
          </select>

          <label className={styles.libelle} htmlFor="promo-zone">
            {t('admin.promoZone')}
          </label>
          <select
            className={styles.saisie}
            id="promo-zone"
            name="zone"
            defaultValue="international"
          >
            {ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {t(`admin.conteZone_${zone}` as CleTraduction)}
              </option>
            ))}
          </select>
          <p className={styles.aide}>{t('admin.promoDeviseAide')}</p>
        </BlocPanneau>

        <BlocPanneau titre={t('admin.colValidite')}>
          <div className={styles.tiroirGrille}>
            <div className={styles.tiroirFait}>
              <label className={styles.libelle} htmlFor="promo-debut">
                {t('admin.promoDebut')}
              </label>
              <input className={styles.saisie} id="promo-debut" name="debut_le" type="date" />
            </div>
            <div className={styles.tiroirFait}>
              <label className={styles.libelle} htmlFor="promo-expire">
                {t('admin.promoExpire')}
              </label>
              <input className={styles.saisie} id="promo-expire" name="expire_le" type="date" />
            </div>
          </div>
          <p className={styles.aide}>{t('admin.promoDebutAide')}</p>
        </BlocPanneau>

        <BlocPanneau titre={t('admin.promoUsageMax')}>
          <input
            className={styles.saisie}
            id="promo-usage"
            name="usage_max"
            type="number"
            min={1}
            placeholder={t('admin.usageIllimite')}
          />
          <p className={styles.aide}>{t('admin.promoUsageMaxAide')}</p>
        </BlocPanneau>

        <div className={styles.interrupteur}>
          {/*
            Le témoin de MÊME NOM, posé avant la case : une case décochée n'est
            pas envoyée du tout, et sans lui la route lirait « actif » là où
            l'éditeur a décoché.
          */}
          <input type="hidden" name="actif" value="non" />
          <input type="checkbox" id="promo-actif" name="actif" value="oui" defaultChecked />
          <label className={styles.interrupteurNom} htmlFor="promo-actif">
            {t('admin.promoActifCreation')}
          </label>
        </div>

        {/*
          La portée : dite en toutes lettres, parce qu'elle n'est pas
          paramétrable. L'éditeur doit savoir qu'un code porte sur TOUT le
          panier avant de le distribuer.
        */}
        <div className={styles.enClair}>
          <p className={styles.enClairTitre}>{t('admin.promoPortee')}</p>
          <p className={styles.enClairTexte}>{t('admin.promoPorteeTout')}</p>
          <p className={styles.aide}>{t('admin.promoPorteeAide')}</p>
        </div>
        {/*
          Les actions sont DANS le formulaire, et non dans le pied du tiroir :
          `BoutonSoumission` lit `useFormStatus`, qui n'existe que sous un
          `<form>`. Hors de lui, le bouton ne saurait jamais qu'un envoi est
          en cours, et l'éditeur presserait deux fois.
        */}
        <div className={styles.tiroirActions}>
          <a className={styles.boutonDiscret} href={fermeture}>
            {t('admin.cmdAnnuler')}
          </a>
          <BoutonSoumission>{t('admin.promoCreer')}</BoutonSoumission>
        </div>
      </form>
    </Panneau>
  );
}
