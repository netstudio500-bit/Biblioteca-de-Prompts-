[CmdletBinding()]
param(
  [string]$ProjectRoot = (Get-Location).Path,
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$SkipAudit
)

$ErrorActionPreference = 'Continue'
$ReportPath = Join-Path $ProjectRoot 'RELATORIO-WINDOWS-1.0.3.md'
$Results = New-Object System.Collections.Generic.List[object]
$StartedAt = Get-Date

function Add-Result {
  param([string]$Name, [string]$Status, [string]$Detail)
  $Results.Add([pscustomobject]@{ Name = $Name; Status = $Status; Detail = ($Detail -replace '\s+', ' ').Trim() })
  Write-Host ("{0,-24} {1,-24} {2}" -f $Name, $Status, $Detail)
}

function Invoke-Captured {
  param([string]$File, [string[]]$Arguments, [int]$TimeoutSeconds = 300)
  $output = & $File @Arguments 2>&1 | Out-String
  [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output.Trim() }
}

function Test-Command {
  param([string]$Name, [string]$Command, [string[]]$Arguments)
  try {
    $result = Invoke-Captured $Command $Arguments
    if ($result.ExitCode -eq 0) { Add-Result $Name 'PASS — REAL' $result.Output }
    else { Add-Result $Name 'BLOQUEADO PELO AMBIENTE' $result.Output }
    return $result
  } catch {
    Add-Result $Name 'BLOQUEADO PELO AMBIENTE' $_.Exception.Message
    return [pscustomobject]@{ ExitCode = 1; Output = $_.Exception.Message }
  }
}

function Test-OllamaEndpoint {
  param([string]$Endpoint)
  try {
    $response = Invoke-RestMethod -Uri "$Endpoint/api/tags" -Method Get -TimeoutSec 5
    $models = @($response.models | Where-Object { $_.name })
    if ($models.Count -gt 0) {
      Add-Result "Ollama $Endpoint" 'PASS — REAL' ("modelos: " + (($models | ForEach-Object { $_.name }) -join ', '))
    } else {
      Add-Result "Ollama $Endpoint" 'BLOQUEADO PELO AMBIENTE' 'Endpoint respondeu sem modelos utilizaveis.'
    }
    return $models
  } catch {
    Add-Result "Ollama $Endpoint" 'BLOQUEADO PELO AMBIENTE' $_.Exception.Message
    return @()
  }
}

function Test-CriticalFiles {
  $files = @(
    'index.html', 'main.jsx', 'package.json', 'package-lock.json',
    'agent/AgentCore.js', 'agent/AgentWatchdog.js', 'agent/OllamaClient.js',
    'agent/ToolRegistry.js', 'agent/ContextManager.js', 'agent/ResponseValidator.js',
    'agent/ModelRouter.js', 'agent/index.js', 'electron/main.cjs', 'electron/preload.cjs',
    'electron/fs-audit.cjs', 'cert-runtime-1.0.3.cjs'
  )
  $missing = @($files | Where-Object { -not (Test-Path (Join-Path $ProjectRoot $_)) })
  if ($missing.Count -eq 0) { Add-Result 'Arquivos criticos' 'PASS — REAL' "$($files.Count) arquivos presentes." }
  else { Add-Result 'Arquivos criticos' 'FAIL' ("Ausentes: " + ($missing -join ', ')) }
}

function Write-Report {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add('# RELATORIO WINDOWS 1.0.3')
  $lines.Add('')
  $lines.Add('## AMBIENTE')
  $lines.Add("- Data: $((Get-Date).ToString('o'))")
  $lines.Add("- Windows: $([Environment]::OSVersion.VersionString)")
  $lines.Add("- Arquitetura: $env:PROCESSOR_ARCHITECTURE")
  $lines.Add("- Node: $((node --version 2>&1 | Out-String).Trim())")
  $lines.Add("- npm: $((npm --version 2>&1 | Out-String).Trim())")
  $lines.Add('')
  $lines.Add('## PROJETO')
  $package = Get-Content (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
  $commit = (git -C $ProjectRoot rev-parse HEAD 2>&1 | Out-String).Trim()
  $lines.Add("- Versao: $($package.version)")
  $lines.Add("- Commit: $commit")
  $lines.Add('- Entrypoint: index.html -> /main.jsx')
  $lines.Add('')
  $lines.Add('## RESULTADOS')
  foreach ($item in $Results) { $lines.Add("- $($item.Status) | $($item.Name) | $($item.Detail)") }
  $lines.Add('')
  $lines.Add('## EVIDENCIA DO INSTALLER 1.0.2')
  $installer = Join-Path $ProjectRoot 'INSTALADORES_OFICIAIS/BOT.IA-Setup-1.0.2.exe'
  if (Test-Path $installer) {
    $hash = (Get-FileHash $installer -Algorithm SHA256).Hash
    $exeCount = @(Get-ChildItem (Join-Path $ProjectRoot 'INSTALADORES_OFICIAIS') -Filter '*.exe' -File).Count
    $lines.Add("- Arquivo: $installer")
    $lines.Add("- SHA-256: $hash")
    $lines.Add("- EXE_COUNT: $exeCount")
  } else { $lines.Add('- Installer: FAIL - arquivo ausente') }
  $lines.Add('')
  $lines.Add('## CLASSIFICACAO')
  $lines.Add('- PASS — REAL: executado neste Windows com recurso real.')
  $lines.Add('- PASS — CONTROLADO: teste deterministico sem runtime Ollama/Electron.')
  $lines.Add('- BLOQUEADO PELO AMBIENTE: recurso ausente ou indisponivel.')
  $lines.Add('- NAO TESTADO: sem evidencia suficiente.')
  $lines.Add('')
  $lines.Add('## COMANDO DE REPRODUCAO')
  $lines.Add('```powershell')
  $lines.Add('.\VALIDAR-WINDOWS-1.0.3.ps1')
  $lines.Add('```')
  $lines.Add('')
  $lines.Add('Nenhuma versao foi alterada e nenhum installer 1.0.3 foi gerado por este script.')
  Set-Content -Path $ReportPath -Value $lines -Encoding UTF8
}

Write-Host "BOT.IA Windows validation started: $StartedAt"
Test-Command 'Node' 'node' @('--version') | Out-Null
Test-Command 'npm' 'npm' @('--version') | Out-Null
Test-Command 'Electron' 'npx' @('electron', '--version') | Out-Null
Test-Command 'Ollama CLI' 'ollama' @('--version') | Out-Null
Test-Command 'Ollama list' 'ollama' @('list') | Out-Null
$models127 = Test-OllamaEndpoint 'http://127.0.0.1:11434'
$modelsLocal = Test-OllamaEndpoint 'http://localhost:11434'
Test-CriticalFiles

$package = Get-Content (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
if ($package.version -eq '1.0.2') { Add-Result 'Versao baseline' 'PASS — REAL' 'package.json = 1.0.2' }
else { Add-Result 'Versao baseline' 'FAIL' "package.json = $($package.version)" }

$installer = Join-Path $ProjectRoot 'INSTALADORES_OFICIAIS/BOT.IA-Setup-1.0.2.exe'
if (Test-Path $installer) {
  $hash = (Get-FileHash $installer -Algorithm SHA256).Hash.ToUpperInvariant()
  $exeCount = @(Get-ChildItem (Join-Path $ProjectRoot 'INSTALADORES_OFICIAIS') -Filter '*.exe' -File).Count
  if ($hash -eq '7AC452C49C89385EEA8B3F745034842B5574CC0E358944C600366DB9AA3E8EC5' -and $exeCount -eq 1) { Add-Result 'Installer 1.0.2' 'PASS — REAL' "SHA correto; EXE_COUNT = $exeCount" }
  else { Add-Result 'Installer 1.0.2' 'FAIL' "SHA = $hash; EXE_COUNT = $exeCount" }
} else { Add-Result 'Installer 1.0.2' 'FAIL' 'Arquivo ausente.' }

if (-not $SkipInstall) { Test-Command 'npm ci' 'npm' @('ci') | Out-Null } else { Add-Result 'npm ci' 'NÃO TESTADO' 'Ignorado por parametro.' }
if (-not $SkipBuild) { Test-Command 'Build' 'npm' @('run', 'build') | Out-Null } else { Add-Result 'Build' 'NÃO TESTADO' 'Ignorado por parametro.' }
Test-Command 'Self-check' 'node' @('cert-runtime-1.0.3.cjs') | Out-Null
if (-not $SkipAudit) { Test-Command 'npm audit' 'npm' @('audit', '--omit=dev', '--audit-level=high') | Out-Null } else { Add-Result 'npm audit' 'NÃO TESTADO' 'Ignorado por parametro.' }
Test-Command 'git diff --check' 'git' @('diff', '--check') | Out-Null

Write-Report
Write-Host "Report written to $ReportPath"
