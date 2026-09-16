param(
  [string]$DatabaseName = "artisys-mercadolivre",
  [string]$VercelProject = "agente-ml-1",
  [string]$VercelScope = "nutricionistaalmeidavh-5036s-projects",
  [string]$OldVercelOrigin = "https://eng-planilhas-callback-ml.vercel.app"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando obrigatório não encontrado: $Name"
  }
}

function Invoke-Npx {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & npx -y @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falhou: npx -y $($Arguments -join ' ')"
  }
}

function Get-D1Databases {
  $raw = (& npx -y wrangler@4 d1 list --json 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível listar os bancos D1." }
  $start = $raw.IndexOf("[")
  if ($start -lt 0) { throw "Resposta inesperada do Wrangler ao listar D1." }
  return ($raw.Substring($start) | ConvertFrom-Json)
}

function Update-D1Id([string]$DatabaseId) {
  $configPath = Join-Path $PWD "cloudflare/wrangler.jsonc"
  $content = Get-Content $configPath -Raw
  $updated = [regex]::Replace(
    $content,
    '"database_id"\s*:\s*"[^"]*"',
    '"database_id": "' + $DatabaseId + '"',
    1
  )
  if ($updated -eq $content -and $content -notmatch [regex]::Escape($DatabaseId)) {
    throw "Não foi possível inserir o Database ID em cloudflare/wrangler.jsonc."
  }
  [System.IO.File]::WriteAllText($configPath, $updated, [System.Text.UTF8Encoding]::new($false))
}

Assert-Command git
Assert-Command node
Assert-Command npm
Assert-Command npx

if (-not (Test-Path "cloudflare/wrangler.jsonc")) {
  throw "Execute este script na raiz do repositório MercadoLivre."
}

Write-Host "`n[1/9] Autenticando Cloudflare..." -ForegroundColor Cyan
& npx -y wrangler@4 whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Invoke-Npx wrangler@4 login --use-keyring
}

Write-Host "`n[2/9] Preparando D1..." -ForegroundColor Cyan
$dbs = @(Get-D1Databases)
$db = $dbs | Where-Object { $_.name -eq $DatabaseName } | Select-Object -First 1
if (-not $db) {
  Invoke-Npx wrangler@4 d1 create $DatabaseName
  $dbs = @(Get-D1Databases)
  $db = $dbs | Where-Object { $_.name -eq $DatabaseName } | Select-Object -First 1
}
if (-not $db -or -not $db.uuid) { throw "D1 $DatabaseName não foi encontrado após criação." }
Update-D1Id ([string]$db.uuid)
Write-Host "D1 configurado: $DatabaseName" -ForegroundColor Green

Write-Host "`n[3/9] Aplicando migrations D1..." -ForegroundColor Cyan
"y" | & npx -y wrangler@4 d1 migrations apply $DatabaseName --remote --config cloudflare/wrangler.jsonc
if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar migrations D1." }

Write-Host "`n[4/9] Primeiro deploy do Worker..." -ForegroundColor Cyan
$deployLines = @(& npx -y wrangler@4 deploy --config cloudflare/wrangler.jsonc 2>&1)
$deployLines | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { throw "Falha no deploy inicial do Worker." }
$deployText = $deployLines -join "`n"
$match = [regex]::Match($deployText, 'https://[A-Za-z0-9._-]+\.workers\.dev')
$workerUrl = if ($match.Success) { $match.Value.TrimEnd('/') } else { "" }
if (-not $workerUrl) {
  $workerUrl = (Read-Host "Não consegui detectar a URL. Cole a URL HTTPS do Worker").TrimEnd('/')
}
if ($workerUrl -notmatch '^https://') { throw "URL do Worker inválida: $workerUrl" }
Write-Host "Worker: $workerUrl" -ForegroundColor Green

Write-Host "`n[5/9] Autenticando e vinculando Vercel antiga..." -ForegroundColor Cyan
& npx -y vercel@latest whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Invoke-Npx vercel@latest login
}
Invoke-Npx vercel@latest link --yes --project $VercelProject --scope $VercelScope

Write-Host "`n[6/9] Copiando secrets necessários Vercel -> Cloudflare sem gravá-los em arquivo..." -ForegroundColor Cyan
& npx -y vercel@latest env run -e production -- node scripts/configure-cloudflare-secrets.mjs $workerUrl
if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível preparar os secrets. Confirme ML_CLIENT_SECRET e ADMIN_PASSWORD no ambiente Production da Vercel."
}

Write-Host "`n[7/9] Deploy final do Worker e bridge temporário na Vercel..." -ForegroundColor Cyan
Invoke-Npx wrangler@4 deploy --config cloudflare/wrangler.jsonc
Invoke-Npx vercel@latest deploy --prod --yes --scope $VercelScope

$health = Invoke-RestMethod -Uri "$workerUrl/api/health" -Method Get
if (-not $health.ok) { throw "Health check do Worker falhou." }
Write-Host "Cloudflare health OK: Workers + D1 + dry-run." -ForegroundColor Green

Write-Host "`n[8/9] Transferindo a conexão Mercado Livre existente..." -ForegroundColor Cyan
$migrationUrl = "$($OldVercelOrigin.TrimEnd('/'))/migration.html"
Write-Host "Vou abrir o endereço antigo da Vercel. Entre no painel antigo se necessário e clique em 'Migrar conexão'." -ForegroundColor Yellow
Start-Process $migrationUrl
Read-Host "Depois que a página informar sucesso, pressione ENTER aqui"

$auditRaw = (& npx -y wrangler@4 d1 execute $DatabaseName --remote --config cloudflare/wrangler.jsonc --command "SELECT seller_id, source, status, created_at FROM migration_audit ORDER BY id DESC LIMIT 1" --json 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw "Não foi possível consultar a auditoria da migração no D1." }
if ($auditRaw -notmatch 'SUCCESS') {
  Write-Host $auditRaw
  throw "A migração do token ainda não aparece como SUCCESS. Não desligue a Vercel nem reconecte o Mercado Livre ainda."
}
Write-Host "Token Mercado Livre migrado e validado no Cloudflare." -ForegroundColor Green

Write-Host "`n[9/9] Encerrando o segredo temporário de migração..." -ForegroundColor Cyan
'{"ML_MIGRATION_SECRET":null}' | & npx -y wrangler@4 secret bulk --config cloudflare/wrangler.jsonc
if ($LASTEXITCODE -ne 0) { throw "Falha ao remover ML_MIGRATION_SECRET do Cloudflare." }
& npx -y vercel@latest env rm ML_MIGRATION_SECRET production --yes *> $null
& npx -y vercel@latest env rm ML_MIGRATION_TARGET_URL production --yes *> $null

$callback = "$workerUrl/mercadolivre/callback"
$webhook = "$workerUrl/api/webhook"
$summary = @"
CLOUDFLARE PRONTO

Redirect URI Mercado Livre:
$callback

URL de notificações Mercado Livre:
$webhook

Tópico:
orders_v2

Mantenha ML_AUTOMATION_MODE=dry-run até uma venda controlada passar.
Depois de atualizar essas URLs no Mercado Livre DevCenter e validar uma venda, a Vercel antiga pode ser desligada.
"@

Write-Host "`n$summary" -ForegroundColor Green
try { Set-Clipboard -Value $summary } catch {}
Write-Host "Resumo copiado para a área de transferência quando disponível." -ForegroundColor DarkGray
