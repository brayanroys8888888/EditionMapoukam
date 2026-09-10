import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

import { NOM_COMMERCIAL } from '@/domain/marque';
import { BLANC, PALETTE_EMAIL } from './palette';
import type { LangueEmail } from '@/domain/emails/templates';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LA MISE EN FORME HTML D'UN EMAIL — ET RIEN D'AUTRE.                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER N'ÉCRIT AUCUN TEXTE DESTINÉ AU LECTEUR.                      │
 * │                                                                          │
 * │ Le sujet et le corps viennent de `src/domain/emails/templates.ts`, qui   │
 * │ reste l'unique endroit où vit la prose des emails. Recopier ici une      │
 * │ version HTML de ces phrases donnerait DEUX rédactions du même message :  │
 * │ celle que lit un client texte et celle que lit un client HTML. Elles     │
 * │ divergeraient à la première correction faite d'un seul côté, et la       │
 * │ divergence serait invisible — personne ne lit les deux.                  │
 * │                                                                          │
 * │ Ce composant REÇOIT donc le texte déjà rendu et se contente de lui       │
 * │ donner une forme. Le seul libellé qu'il porte est celui du bouton, et    │
 * │ c'est un libellé d'INTERFACE, pas un message.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DES STYLES EN LIGNE, ET C'EST LA SEULE FAÇON QUI MARCHE.                │
 * │                                                                          │
 * │ Gmail retire les feuilles de style, Outlook ignore la moitié des         │
 * │ sélecteurs. Un email se style attribut par attribut, sur des tableaux —  │
 * │ ce que les composants de React Email produisent pour nous. On n'emploie  │
 * │ donc PAS les modules CSS du site : ils ne survivraient pas au transport. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN LIEN SIGNÉ, ICI NON PLUS.                                         │
 * │                                                                          │
 * │ Le bouton pointe vers `lien`, que `rendre()` a construit à partir d'un   │
 * │ CHEMIN relatif. Ce composant ne peut donc pas fabriquer d'URL de         │
 * │ fichier, pour la même raison que les modèles ne le peuvent pas.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Le libellé du bouton. C'est de l'interface, d'où sa présence ici. */
const ACTION: Record<LangueEmail, string> = {
  fr: 'Ouvrir mon espace',
  en: 'Open my account',
};

/** Le pied, qui dit pourquoi ce message est arrivé. */
const PIED: Record<LangueEmail, string> = {
  fr: 'Vous recevez cet email parce que vous avez un compte sur',
  en: 'You are receiving this email because you have an account on',
};

export interface ProprietesMessage {
  sujet: string;
  /** Le corps TEXTE déjà rendu, lien compris. */
  corps: string;
  /** L'URL absolue vers laquelle le bouton mène. */
  lien: string;
  langue: LangueEmail;
}

/**
 * Découpe le corps texte en blocs, et isole le lien.
 *
 * Le lien est écrit sur sa propre ligne dans les modèles. En HTML il devient
 * un bouton, et la ligne d'URL brute disparaît : la laisser afficherait
 * l'adresse en toutes lettres juste au-dessus du bouton qui y mène.
 */
function blocs(corps: string, lien: string): string[] {
  return corps
    .split('\n\n')
    .map((bloc) =>
      bloc
        .split('\n')
        .filter((ligne) => ligne.trim() !== lien && !ligne.trim().startsWith('http'))
        .join(' ')
        .trim(),
    )
    .filter((bloc) => bloc !== '');
}

export function MessageEmail({ sujet, corps, lien, langue }: ProprietesMessage): ReactNode {
  const paragraphes = blocs(corps, lien);

  return (
    <Html lang={langue}>
      <Head />
      {/*
        L'aperçu est ce que la boîte de réception affiche À CÔTÉ du sujet.
        Laissé vide, les clients y mettent le premier texte trouvé — souvent
        « Bonjour, ». On y met le sujet, qui est déjà écrit pour être lu par
        qui regarde l'écran par-dessus l'épaule.
      */}
      <Preview>{sujet}</Preview>

      <Body style={corpsStyle}>
        <Container style={conteneur}>
          <Text style={marque}>{NOM_COMMERCIAL}</Text>

          <Heading style={titre}>{sujet}</Heading>

          {paragraphes.map((paragraphe) => (
            <Text style={texte} key={paragraphe}>
              {paragraphe}
            </Text>
          ))}

          <Section style={{ marginTop: '28px', marginBottom: '28px' }}>
            <Button style={bouton} href={lien}>
              {ACTION[langue]}
            </Button>
          </Section>

          <Hr style={filet} />

          {/*
            L'URL est répétée en toutes lettres SOUS le filet : un client qui
            n'affiche pas les boutons — ou un lecteur méfiant, qui a raison de
            l'être — doit pouvoir lire où le lien mène avant de cliquer.
          */}
          <Text style={pied}>
            {PIED[langue]} {NOM_COMMERCIAL}.
            <br />
            <Link href={lien} style={lienPied}>
              {lien}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/*
 * Les couleurs viennent de `palette.ts`, qui REFLÈTE `tokens.css` et dont un
 * test vérifie l'égalité. Aucune valeur littérale n'est écrite ici : le test
 * `design-tokens` les refuse dans un `.tsx`, et il a raison de les refuser.
 */
const corpsStyle = {
  backgroundColor: PALETTE_EMAIL.fond,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: '24px 0',
};

const conteneur = {
  backgroundColor: PALETTE_EMAIL.carte,
  border: `1px solid ${PALETTE_EMAIL.ligne}`,
  borderRadius: '12px',
  margin: '0 auto',
  maxWidth: '600px',
  padding: '32px',
};

const marque = {
  color: PALETTE_EMAIL.terreEncre,
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  margin: '0 0 20px',
  textTransform: 'uppercase' as const,
};

const titre = {
  color: PALETTE_EMAIL.encre,
  fontSize: '24px',
  lineHeight: '1.3',
  margin: '0 0 20px',
};

const texte = {
  color: PALETTE_EMAIL.encre,
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 14px',
};

const bouton = {
  backgroundColor: PALETTE_EMAIL.terre,
  borderRadius: '999px',
  color: BLANC,
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: 600,
  padding: '13px 26px',
  textDecoration: 'none',
};

const filet = { borderColor: PALETTE_EMAIL.ligne, margin: '28px 0 18px' };

const pied = { color: PALETTE_EMAIL.encreDouce, fontSize: '13px', lineHeight: '1.6', margin: 0 };

const lienPied = { color: PALETTE_EMAIL.terreEncre, wordBreak: 'break-all' as const };

export default MessageEmail;
