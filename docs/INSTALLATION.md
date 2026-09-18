# Installer le projet, du clone au site qui tourne

> Écrit le 18 septembre 2026.

Ce document ne liste pas les paquets npm. Il dit **où ils sont déjà listés**, et
il couvre ce que npm ne sait pas installer — ce qui est précisément la partie
qui bloque un nouveau poste.

---

## 1. Le « requirements.txt » de ce projet existe déjà

Dans l'écosystème Node, deux fichiers tiennent ce rôle, et ils sont versionnés :

| Fichier | Rôle |
| --- | --- |
| `package.json` | les dépendances voulues, en **intervalles** de versions — 16 pour l'application, 22 pour le développement |
| `package-lock.json` | les versions **exactes** réellement installées, arbre transitif compris |

```bash
npm ci      # installe EXACTEMENT le verrou — à privilégier
npm install # résout les intervalles et peut METTRE À JOUR le verrou
```

**Préférez `npm ci`.** Il installe à l'octet près ce qui a été éprouvé par la
porte de validation, et il échoue franchement si `package.json` et le verrou
divergent — au lieu de « réparer » silencieusement en changeant des versions.

> ┌──────────────────────────────────────────────────────────────────────────┐
> │ NE PAS CRÉER DE SECONDE LISTE DE DÉPENDANCES.                            │
> │                                                                          │
> │ Un `requirements.txt`, un `dependances.md` ou tout autre inventaire tenu  │
> │ à la main deviendrait une seconde source de vérité. Elle ne serait mise   │
> │ à jour ni par `npm install`, ni par `npm audit fix`, ni par Dependabot —  │
> │ elle divergerait donc dès la première montée de version, et c'est         │
> │ toujours la copie périmée qui a l'air d'avoir raison.                     │
> │                                                                          │
> │ C'est la même règle que partout ailleurs dans ce dépôt : une règle        │
> │ écrite deux fois diverge.                                                 │
> └──────────────────────────────────────────────────────────────────────────┘

Quelques dépendances sont **forcées** à une version précise dans le bloc
`overrides` de `package.json` — `sharp`, `postcss`, `nanoid`,
`brace-expansion`. Ce ne sont pas des caprices : chacune ferme un avis de
sécurité sur un paquet transitif que personne ne déclare directement.

---

## 2. Ce que npm ne peut PAS installer

C'est ici que se joue une installation réussie. Aucun de ces outils ne vient
avec `npm ci`.

| Outil | Pourquoi il faut l'avoir | Sans lui |
| --- | --- | --- |
| **Node 20 ou plus** | `package.json` l'exige (`engines`) | rien ne démarre |
| **Docker** | la pile Supabase locale (base, auth, stockage, capture d'emails) tourne dedans | tous les écrans qui lisent la base rendent « Quelque chose n'a pas fonctionné » |
| **poppler** — `pdftoppm`, `pdftotext` | la chaîne d'ingestion des PDF les appelle en sous-processus, à **24 endroits** du code | l'ingestion bascule sur le chemin de secours, plus lent, et certains tests échouent |
| **Java** | uniquement pour `npm run audit:epub`, qui lance `vendors/epubcheck/epubcheck.jar` | seul cet audit échoue ; le reste du projet est indifférent |

La **CLI Supabase**, elle, est une dépendance de développement : `npm ci`
l'installe, il n'y a rien à faire de plus.

Pour vérifier ce qui manque :

```bash
node --version        # doit afficher v20 ou plus
pdftoppm -v           # poppler
pdftotext -v          # poppler
java -version         # facultatif, pour l'audit EPUB seulement
```

Pour la pile Supabase, **interrogez-la plutôt que d'interroger Docker** :

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:54321/auth/v1/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:54321/rest/v1/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:54324/     # capture d'emails
```

Trois `200`, et la pile est saine.

> ┌──────────────────────────────────────────────────────────────────────────┐
> │ `docker ps` PEUT RESTER SUSPENDU ALORS QUE TOUT VA BIEN.                 │
> │                                                                          │
> │ Mesuré sur ce projet le 18 septembre 2026 : la commande n'a pas rendu la │
> │ main en cinq minutes, à trois reprises — pendant que la base, l'API et   │
> │ la capture d'emails répondaient toutes en quelques millisecondes.        │
> │                                                                          │
> │ C'est la CLI de Docker Desktop qui est lente, pas la pile. Diagnostiquer │
> │ avec `docker ps` mène donc à la conclusion inverse de la réalité, et      │
> │ fait chercher une panne là où il n'y en a pas. Les trois `curl`          │
> │ ci-dessus interrogent ce dont on a réellement besoin.                    │
> │                                                                          │
> │ Un blocage de `docker ps` signifie le plus souvent que Docker Desktop    │
> │ est en train de démarrer : laissez-lui une minute, puis reprenez par les │
> │ `curl`.                                                                  │
> └──────────────────────────────────────────────────────────────────────────┘

---

## 3. L'installation, dans l'ordre

L'ordre n'est pas décoratif : chaque étape a besoin de la précédente.

```bash
# 1. Les paquets
npm ci

# 2. La pile Supabase locale (Docker doit tourner)
npm run supabase:start
#    Elle affiche l'URL de l'API, la clé anon et la clé service_role.
#    Gardez cette sortie sous les yeux pour l'étape 3.

# 3. L'environnement
cp .env.example .env.local
#    Puis coller les deux clés affichées à l'étape 2 (voir §4).

# 4. Le schéma et le jeu de démonstration
npm run db:migrate
npm run db:seed

# 5. Un compte administrateur
npm run admin:creer
#    Il affiche l'adresse et le mot de passe UNE fois. Notez-les.

# 6. Le serveur
npm run dev
```

Le site répond alors sur `http://localhost:3000`, et l'administration sur
`http://localhost:3000/fr/admin`.

---

## 4. Les variables d'environnement

`.env.example` en porte **29**. La plupart ont déjà une valeur par défaut
utilisable : il n'y a que **deux** variables réellement obligatoires pour
démarrer en local.

| Variable | Où la trouver |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | affichée par `npm run supabase:start` |
| `SUPABASE_SERVICE_ROLE_KEY` | affichée par `npm run supabase:start` |

Les six autres variables laissées vides sont **conditionnelles**, et le projet
démarre sans elles :

- `NOTCHPAY_PUBLIC_KEY`, `NOTCHPAY_PRIVATE_KEY`, `NOTCHPAY_HASH_KEY` — exigées
  seulement si `PAYMENT_PROVIDER=notchpay`. En développement, le faux
  prestataire et la console `/dev` suffisent ;
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` — exigées
  seulement si `AUTH_GOOGLE=better-auth`. Le défaut est `desactive` : aucune
  route Google ne répond et aucun bouton n'apparaît.

**Aucun fichier `.env*` n'est versionné** : ils sont tous ignorés par git, et
c'est la règle 6 de `CLAUDE.md`.

---

## 5. Vérifier que l'installation est saine

```bash
npm run verify    # typecheck + lint + 1941 tests
```

C'est la porte de validation du projet. Elle doit sortir en code 0.

> ⚠ **Arrêtez le serveur de développement avant de la lancer.**
> `tests/unit/middleware.test.ts` simule une panne réseau ; un serveur qui
> écoute sur le port 3000 lui répond et fait échouer le test. C'est la
> contradiction nommée dans `CLAUDE.md` : `verify` exige que rien n'écoute sur
> 3000, `npm run rendu` exige au contraire un serveur en marche.

---

## 6. Trois pièges déjà payés

**`npm run db:reset` efface le mot de passe de l'administrateur.** La graine
rétablit le compte tel qu'elle le pose. Relancez simplement
`npm run admin:creer` — il est idempotent et réaffiche le mot de passe.

**Après chaque migration, régénérez les types.**

```bash
npm run db:migrate
npm run db:types    # PAS optionnel
```

`src/lib/admin/service.ts` contraint ses appels RPC aux fonctions réellement
présentes dans le type généré : une fonction ajoutée en SQL et non régénérée ne
compile pas. C'est le comportement voulu.

**Un conte ingéré à l'essai reste en base et fausse les tests.** Le jeu de
démonstration compte **14 titres** ; `access.test.ts` et `schema.test.ts`
échouent sur 15, avec un message qui ne parle jamais d'ingestion. Effacez les
contes d'essai après chaque essai manuel.

---

## 7. Où regarder ensuite

| Fichier | Ce qu'il porte |
| --- | --- |
| `CLAUDE.md` | le contexte permanent du projet — à lire en premier |
| `REPRISE.md` | l'état du chantier en cours et les pièges rencontrés |
| `docs/cahier-des-charges.md` | la spécification, elle fait foi |
| `docs/API-CONTRAT.md` | le contrat des routes |
| `docs/AVANT-MISE-EN-PRODUCTION.md` | ce qui reste à faire avant la mise en ligne |
| `docs/NOTCHPAY.md` | où coller les clés de paiement |
