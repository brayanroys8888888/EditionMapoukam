import { getServerEnv } from '@/lib/config/env';

import type { ModeGoogle } from './google';

/**
 * LECTURE DE L'INTERRUPTEUR — côté serveur, et seulement là.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE N'EST PAS DANS `google.ts`.                                 │
 * │                                                                          │
 * │ `google.ts` est importé par les FORMULAIRES, pour construire le lien du  │
 * │ bouton. S'il lisait l'environnement du serveur, `getServerEnv` entrerait │
 * │ dans le paquet du navigateur — et cette fonction refuse justement de     │
 * │ s'exécuter côté client, parce qu'elle touche la clé de service.          │
 * │                                                                          │
 * │ Les écrans reçoivent donc un BOOLÉEN en propriété, calculé ici par la    │
 * │ page. C'est le même parti pris que partout ailleurs dans ce dépôt : un   │
 * │ composant affiche ce qu'on lui donne, il ne décide de rien.              │
 * │                                                                          │
 * │ Et la variable n'est PAS préfixée `NEXT_PUBLIC_` : une valeur publique   │
 * │ serait figée au moment de la construction, alors que tout l'intérêt de   │
 * │ l'interrupteur est de pouvoir basculer sans redéployer.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function modeGoogle(): ModeGoogle {
  return getServerEnv().AUTH_GOOGLE;
}

/** Le bouton « Continuer avec Google » doit-il être proposé ? */
export function googleActif(): boolean {
  return modeGoogle() !== 'desactive';
}
