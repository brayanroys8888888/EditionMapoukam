import fr from '@/i18n/fr.json';

/**
 * LE NOM COMMERCIAL — une seule écriture, dans tout le dépôt.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE MODULE EXISTE PLUTÔT QU'UNE CONSTANTE RECOPIÉE.             │
 * │                                                                          │
 * │ Le nom était écrit en dur à six endroits de `src/domain/emails/          │
 * │ templates.ts` — sous la forme « Édition Mapoukam » — pendant que         │
 * │ l'interface s'apprêtait à en adopter une autre. Deux orthographes de la  │
 * │ même marque, dans le même produit : exactement la classe de défaut       │
 * │ recensée en `docs/PLAN.md` §5 terdecies, celle de l'apostrophe.          │
 * │                                                                          │
 * │ La différence avec les autres occurrences de cette classe : ici, PERSONNE │
 * │ ne compare les deux valeurs. Rien n'aurait donc signalé la divergence —  │
 * │ un client aurait simplement reçu un email signé d'un nom qui ne figure   │
 * │ nulle part sur le site.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La valeur vient du dictionnaire français, qui reste la source. Elle est
 * identique en anglais : **un nom propre ne se traduit pas**, et un test de
 * parité vérifie que les deux dictionnaires portent bien la même chaîne.
 *
 * Ce module est PUR — un import de JSON, rien d'autre. Il peut donc être lu
 * par les modèles d'emails, qui doivent le rester (étape 15).
 */
export const NOM_COMMERCIAL: string = fr.marque.nom;
