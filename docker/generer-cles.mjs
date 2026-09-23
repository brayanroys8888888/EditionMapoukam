#!/usr/bin/env node
/**
 * ╔════════════════════════════════════════════════════════════════════════╗
 * ║ LES TROIS SECRETS DE LA PILE — et ce qui arrive si on les recopie.     ║
 * ║                                                                        ║
 * ║   node docker/generer-cles.mjs >> .env                                 ║
 * ║                                                                        ║
 * ║ Produit `JWT_SECRET`, `ANON_KEY` et `SERVICE_ROLE_KEY`. Les deux       ║
 * ║ dernières ne sont pas des secrets indépendants : ce sont des JWT       ║
 * ║ SIGNÉS par le premier. Les mélanger — une clé d'un `.env`, un secret   ║
 * ║ d'un autre — donne une pile qui démarre, répond, et refuse toute       ║
 * ║ requête avec « invalid JWT », sans dire laquelle des deux est fausse.  ║
 * ║                                                                        ║
 * ║ Aucune valeur d'exemple n'est fournie volontairement. Celles qui       ║
 * ║ circulent dans les tutoriels de Supabase sont PUBLIQUES : leur         ║
 * ║ `service_role` ouvre la base entière, RLS contourné.                   ║
 * ║                                                                        ║
 * ║ Écrit en Node sans dépendance : le dépôt n'ajoute pas un paquet pour   ║
 * ║ trois lignes de HMAC.                                                  ║
 * ╚════════════════════════════════════════════════════════════════════════╝
 */
import { Buffer } from 'node:buffer';
import { createHmac, randomBytes } from 'node:crypto';

/** Dix ans. Un jeton d'anon expiré fait tomber le site entier, d'un coup. */
const DUREE_SECONDES = 10 * 365 * 24 * 3600;

const base64url = (valeur) => Buffer.from(valeur).toString('base64url');

/** Le secret : 64 caractères hexadécimaux. gotrue en exige 32 au minimum. */
const secret = process.argv[2] ?? randomBytes(32).toString('hex');

function jeton(role) {
  const emis = Math.floor(Date.now() / 1000);
  const entete = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const charge = base64url(
    JSON.stringify({ role, iss: 'supabase', iat: emis, exp: emis + DUREE_SECONDES }),
  );
  const signature = createHmac('sha256', secret)
    .update(`${entete}.${charge}`)
    .digest('base64url');
  return `${entete}.${charge}.${signature}`;
}

const lignes = [
  '',
  `# Générées le ${new Date().toISOString().slice(0, 10)} par docker/generer-cles.mjs.`,
  '# Les deux clés sont signées par JWT_SECRET : changer l\'un invalide les autres.',
  `JWT_SECRET=${secret}`,
  `ANON_KEY=${jeton('anon')}`,
  `SERVICE_ROLE_KEY=${jeton('service_role')}`,
  '',
  '# Deux secrets indépendants, qui ne signent rien de commun avec ce qui précède.',
  `FAKE_WEBHOOK_SECRET=${randomBytes(24).toString('hex')}`,
  `BETTER_AUTH_SECRET=${randomBytes(32).toString('base64')}`,
  '',
  `# Le mot de passe de la base — LETTRES ET CHIFFRES SEULEMENT : il entre dans`,
  `# des URL de connexion, et un caractère spécial non échappé y coupe la chaîne.`,
  `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`,
  '',
];

process.stdout.write(lignes.join('\n'));
