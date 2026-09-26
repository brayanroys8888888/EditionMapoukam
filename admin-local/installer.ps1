# ╔══════════════════════════════════════════════════════════════════════════╗
# ║ ADMINISTRATION LOCALE — installation sur un poste Windows                ║
# ╚══════════════════════════════════════════════════════════════════════════╝
#
# Lancé par Installer.cmd. Peut être relancé sans rien perdre : chaque étape
# vérifie d'abord ce qui est déjà en place.
#
#   1. Node.js 20 ou plus          (winget, si absent)
#   2. poppler                     (winget, si absent)
#   3. les dépendances du site     (npm ci)
#   4. la configuration            (trois questions, écrite dans admin-local\.env)
#   5. la vérification du poste    (Supabase joignable, clés acceptées)
#   6. la construction du site
#   7. un raccourci sur le Bureau
#
# Ce fichier est enregistré en UTF-8 AVEC BOM : sans lui, Windows PowerShell
# 5.1 le lit en ANSI et chaque accent devient deux caractères illisibles.

$ErrorActionPreference = 'Stop'
# Accents lisibles, dans ce que ce script écrit comme dans ce que node renvoie.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Racine = Split-Path -Parent $PSScriptRoot
Set-Location $Racine

function Etape($texte) { Write-Host "`n== $texte" -ForegroundColor Cyan }
function Ok($texte) { Write-Host "  OK  $texte" -ForegroundColor Green }
function Echec($texte) {
  Write-Host "`n  ECHEC  $texte`n" -ForegroundColor Red
  exit 1
}

# Relit le PATH de la machine : un programme installé par winget n'est pas
# visible de cette fenêtre sans cela.
function RafraichirPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User')
}

function WingetInstaller($id, $nom) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Echec "winget est absent : installez « App Installer » depuis le Microsoft Store, puis relancez."
  }
  Write-Host "  Installation de $nom..."
  winget install -e --id $id --accept-package-agreements --accept-source-agreements --silent
  if ($LASTEXITCODE -ne 0) { Echec "L'installation de $nom a échoué (winget, code $LASTEXITCODE)." }
  RafraichirPath
}

# ── 1. Node.js ────────────────────────────────────────────────────────────────
Etape 'Node.js'
function VersionNode {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { return 0 }
  $v = (& node -v) -replace '^v', ''
  return [int]($v.Split('.')[0])
}
if ((VersionNode) -lt 20) {
  WingetInstaller 'OpenJS.NodeJS.LTS' 'Node.js LTS'
  if ((VersionNode) -lt 20) {
    Echec "Node.js est installé mais pas encore visible : fermez cette fenêtre et relancez Installer.cmd."
  }
}
Ok ("Node.js " + (& node -v))

# ── 2. poppler ────────────────────────────────────────────────────────────────
Etape 'poppler (lecture des PDF)'
function PopplerPresent {
  if ($env:POPPLER_BIN_DIR -and (Test-Path (Join-Path $env:POPPLER_BIN_DIR 'pdftoppm.exe'))) { return $true }
  $paquets = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path $paquets) {
    $trouve = Get-ChildItem $paquets -Directory -Filter 'oschwartz10612.Poppler*' -ErrorAction SilentlyContinue |
      ForEach-Object { Get-ChildItem $_.FullName -Recurse -Filter 'pdftoppm.exe' -ErrorAction SilentlyContinue } |
      Select-Object -First 1
    if ($trouve) { return $true }
  }
  return $false
}
if (-not (PopplerPresent)) {
  WingetInstaller 'oschwartz10612.Poppler' 'poppler'
  if (-not (PopplerPresent)) { Echec "poppler reste introuvable après installation." }
}
Ok 'poppler'

# ── 3. Les dépendances ────────────────────────────────────────────────────────
Etape 'Dépendances du site (quelques minutes la première fois)'
$verrou = Join-Path $Racine 'package-lock.json'
$temoin = Join-Path $Racine 'node_modules\.package-lock.json'
if (-not (Test-Path $temoin) -or ((Get-Item $verrou).LastWriteTime -gt (Get-Item $temoin).LastWriteTime)) {
  & npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Echec "npm ci a échoué (code $LASTEXITCODE)." }
}
Ok 'dépendances installées'

# ── 4. La configuration ───────────────────────────────────────────────────────
Etape 'Configuration'
$config = Join-Path $PSScriptRoot '.env'
if (Test-Path $config) {
  Ok 'admin-local\.env existe déjà (supprimez-le pour reposer les questions)'
} else {
  Write-Host '  Trois valeurs, dans Supabase : Project Settings -> API.'
  $url = (Read-Host '  Project URL (https://....supabase.co)').Trim().TrimEnd('/')
  $anon = (Read-Host '  Clé « anon public »').Trim()
  $secure = Read-Host '  Clé « service_role » (la saisie reste masquée)' -AsSecureString
  $service = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()

  if ($url -notmatch '^https://[^\s]+$') { Echec "Adresse invalide : $url" }
  if (-not $anon -or -not $service) { Echec 'Une clé est vide.' }

  $contenu = @(
    '# Administration locale — NE JAMAIS VERSIONNER NI ENVOYER CE FICHIER.',
    '# Il contient la clé service_role : un accès total à la base de production.',
    "NEXT_PUBLIC_SUPABASE_URL=$url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon",
    "SUPABASE_SERVICE_ROLE_KEY=$service",
    ''
  ) -join "`n"
  # UTF-8 SANS BOM : un BOM collerait trois octets au nom de la première
  # variable, et la configuration paraîtrait vide.
  [IO.File]::WriteAllText($config, $contenu, (New-Object Text.UTF8Encoding($false)))
  Ok 'admin-local\.env écrit'
}

# ── 5. Vérification ───────────────────────────────────────────────────────────
Etape 'Vérification du poste'
& node admin-local\lanceur.mjs --verifier
if ($LASTEXITCODE -ne 0) { Echec 'La vérification a échoué : le message ci-dessus dit quoi corriger.' }

# ── 6. Construction ───────────────────────────────────────────────────────────
Etape 'Construction du site (cinq minutes environ)'
& node admin-local\lanceur.mjs --construire-seulement
if ($LASTEXITCODE -ne 0) { Echec 'La construction a échoué.' }

# ── 7. Raccourci ──────────────────────────────────────────────────────────────
Etape 'Raccourci sur le Bureau'
$bureau = [Environment]::GetFolderPath('Desktop')
$raccourci = (New-Object -ComObject WScript.Shell).CreateShortcut(
  (Join-Path $bureau 'Administration Mapoukam.lnk'))
$raccourci.TargetPath = Join-Path $PSScriptRoot 'Demarrer.cmd'
$raccourci.WorkingDirectory = $Racine
$raccourci.Description = 'Administration locale — dépôt des contes volumineux'
$raccourci.Save()
Ok 'Administration Mapoukam (sur le Bureau)'

Write-Host "`nInstallation terminée. Double-cliquez sur « Administration Mapoukam »." -ForegroundColor Green
Write-Host "Connectez-vous avec votre compte administrateur habituel.`n"
