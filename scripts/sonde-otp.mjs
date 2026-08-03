/**
 * SONDE — le code à usage unique est-il réellement disponible, et pour QUELS
 * usages ?
 *
 * Une lecture de types dit ce que l'API accepte, pas ce que le serveur fait.
 * Ce script l'établit contre la pile locale, pour les DEUX usages dont
 * l'arbitrage Q3 dépend :
 *
 *   * `recovery` — mot de passe oublié ;
 *   * `signup`   — vérification d'adresse à l'inscription.
 *
 * Les deux sont sondés parce que rien ne garantissait qu'ils se comportent
 * pareil : Supabase expose `signup` ET `email` comme types de vérification, et
 * se tromper aurait rendu l'écran de confirmation inopérant sans que rien ne
 * le signale.
 *
 * Jetable, hors de la porte de validation : il répond à une question posée une
 * fois. Il est versionné pour que la réponse soit reproductible, pas pour être
 * rejoué à chaque commit. La couverture PERMANENTE de ces propriétés vit dans
 * `tests/integration/parcours-auth.test.ts`, qui lit le code dans l'email réel.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';

config({ path: '.env.local' });

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const service = createClient(URL_SUPABASE, CLE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(URL_SUPABASE, CLE_ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = `sonde-otp-${randomUUID()}@exemple.test`;
const motDePasse = `Mdp-${randomUUID()}`;
let identifiant = null;

try {
  const cree = await service.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
  });
  if (cree.error) throw new Error(`création : ${cree.error.message}`);
  identifiant = cree.data.user.id;

  // `generateLink` rend CE QUE L'EMAIL PORTERAIT — dont le code à six chiffres.
  const lien = await service.auth.admin.generateLink({ type: 'recovery', email });
  if (lien.error) throw new Error(`generateLink : ${lien.error.message}`);

  const proprietes = lien.data.properties ?? {};
  const code = proprietes.email_otp;

  console.log('── ce que l’email de récupération peut porter ──');
  console.log('  code à usage unique :', code ?? 'ABSENT');
  console.log('  longueur            :', code ? String(code).length : '—');
  console.log('  empreinte de jeton  :', proprietes.hashed_token ? 'présente' : 'absente');
  console.log('  lien complet        :', proprietes.action_link ? 'présent' : 'absent');

  if (!code) throw new Error('aucun code à usage unique — le flux saisi est indisponible');

  // L'échange, avec le client ANONYME : c'est ce que fera la route.
  const echange = await anon.auth.verifyOtp({ email, token: String(code), type: 'recovery' });

  console.log('\n── échange du code ──');
  if (echange.error) {
    console.log('  ÉCHEC :', echange.error.message);
  } else {
    console.log('  session ouverte     :', echange.data.session ? 'oui' : 'non');
    console.log('  utilisateur reconnu :', echange.data.user?.email === email ? 'oui' : 'non');
  }

  // Un code est à USAGE UNIQUE : le rejouer doit échouer. C'est ce qui rend le
  // flux saisi acceptable — sans cela, un code lu par-dessus l'épaule
  // resterait valable.
  const rejeu = await anon.auth.verifyOtp({ email, token: String(code), type: 'recovery' });
  console.log('  rejeu refusé        :', rejeu.error ? 'oui' : 'NON — problème');

  // Un code faux ne doit rien ouvrir.
  const faux = await anon.auth.verifyOtp({ email, token: '000000', type: 'recovery' });
  console.log('  code faux refusé    :', faux.error ? 'oui' : 'NON — problème');

  // ── Second usage : la vérification d'adresse à l'inscription ─────────────
  // `generateLink` de type `signup` crée un compte NON CONFIRMÉ et rend ce que
  // l'email de confirmation porterait — exactement le chemin de `/register`.
  const emailSignup = `sonde-signup-${randomUUID()}@exemple.test`;
  const lienSignup = await service.auth.admin.generateLink({
    type: 'signup',
    email: emailSignup,
    password: `Mdp-${randomUUID()}`,
  });
  if (lienSignup.error) throw new Error(`generateLink signup : ${lienSignup.error.message}`);

  const identifiantSignup = lienSignup.data.user?.id ?? null;
  try {
    const codeSignup = lienSignup.data.properties?.email_otp;

    console.log('\n── email de confirmation d’inscription ──');
    console.log('  code à usage unique :', codeSignup ?? 'ABSENT');
    console.log('  confirmé au départ  :', lienSignup.data.user?.email_confirmed_at ? 'oui' : 'non');

    if (!codeSignup) throw new Error('aucun code — le flux saisi est indisponible pour signup');

    // Quel type accepte l'échange ? `signup` d'abord, `email` en repli.
    let retenu = null;
    for (const type of ['signup', 'email']) {
      const essai = await anon.auth.verifyOtp({
        email: emailSignup,
        token: String(codeSignup),
        type,
      });
      console.log(`\n── échange, type="${type}" ──`);
      if (essai.error) {
        console.log('  ÉCHEC :', essai.error.message);
      } else {
        console.log('  session ouverte     :', essai.data.session ? 'oui' : 'non');
        console.log(
          '  adresse confirmée   :',
          essai.data.user?.email_confirmed_at ? 'oui' : 'non',
        );
        retenu = type;
        break;
      }
    }

    console.log('\n  TYPE À EMPLOYER     :', retenu ?? 'AUCUN — problème');
  } finally {
    if (identifiantSignup) await service.auth.admin.deleteUser(identifiantSignup);
  }
} catch (erreur) {
  console.error('\nSONDE EN ÉCHEC :', erreur instanceof Error ? erreur.message : String(erreur));
  process.exitCode = 1;
} finally {
  if (identifiant) await service.auth.admin.deleteUser(identifiant);
}
