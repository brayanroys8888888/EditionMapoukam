import { render } from '@react-email/render';

import { MessageEmail } from '@/emails/message';
import type { EmailRendu, LangueEmail } from '@/domain/emails/templates';

/**
 * LE RENDU HTML D'UN EMAIL — la couche adaptateur, jamais le domaine.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE N'EST PAS DANS `src/domain/emails/`.                        │
 * │                                                                          │
 * │ `rendre()` est une fonction pure qui rend des chaînes ; elle se teste    │
 * │ sans rien allumer, et c'est ce qui fait sa valeur. `render()` de React   │
 * │ Email, lui, monte un arbre React et le sérialise : c'est une            │
 * │ TRANSFORMATION, pas une règle, et elle appartient à la couche qui        │
 * │ transporte.                                                              │
 * │                                                                          │
 * │ La séparation a une conséquence pratique : le domaine reste rendable     │
 * │ sans React, donc les modèles restent testables tels quels.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TEXTE RESTE LA SOURCE, LE HTML EN EST UNE VUE.                       │
 * │                                                                          │
 * │ On ne rédige rien ici : on met en forme `rendu.texte`. Un email dont la  │
 * │ version HTML dirait autre chose que sa version texte serait un email     │
 * │ dont personne ne sait ce qu'il dit vraiment.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function rendreHtml(rendu: EmailRendu, lienAbsolu: string, langue: LangueEmail) {
  return render(
    <MessageEmail sujet={rendu.sujet} corps={rendu.texte} lien={lienAbsolu} langue={langue} />,
  );
}
