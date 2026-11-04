param(
    [string]$ContainerName = 'proofpay-ai-probe-agent-1'
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (!(Test-Path -LiteralPath (Join-Path $taskRoot 'package.json'))) {
    throw 'Run this script from the ProofPay scripts directory.'
}
if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$') { throw 'Invalid container name.' }
$taskDocker = Get-Command docker.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (!$taskDocker) {
    $taskDocker = @(
        (Join-Path $env:USERPROFILE 'AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (!$taskDocker) { throw 'Docker CLI was not found. Start Docker Desktop first.' }

# Capture the credential in memory. Never print it or place it in command arguments.
$taskReader = @'
const url = process.env.ASTRO_GATEWAY_URL;
const key = process.env.ASTRO_GATEWAY_API_KEY;
if (!url || !key) throw new Error('Gateway configuration missing');
console.log(JSON.stringify({url, key}));
'@
$taskRaw = $taskReader | & $taskDocker exec -i $ContainerName bun run -
if ($LASTEXITCODE -ne 0) { throw 'Could not read the local gateway configuration. Start the Astropods probe first.' }
$taskCredentials = ($taskRaw -join "`n") | ConvertFrom-Json
if (!$taskCredentials.url -or !$taskCredentials.key) { throw 'Incomplete gateway configuration.' }
if (([Uri]$taskCredentials.url).Scheme -ne 'https') { throw 'The gateway URL must use HTTPS.' }
if ($taskCredentials.url -match '[\r\n]' -or $taskCredentials.key -match '[\r\n]') { throw 'Invalid credential format.' }

$taskIgnore = Get-Content -LiteralPath (Join-Path $taskRoot '.gitignore')
if ($taskIgnore -notcontains '.env.local') { throw '.env.local must be excluded from Git before connecting.' }
$taskEnvPath = Join-Path $taskRoot '.env.local'
$taskExisting = if (Test-Path -LiteralPath $taskEnvPath) {
    [IO.File]::ReadAllLines($taskEnvPath)
} else { @() }
$taskNames = 'AI_PROVIDER|ASTRO_MODEL|ASTRO_GATEWAY_URL|ASTRO_GATEWAY_API_KEY'
$taskKept = @($taskExisting | Where-Object { $_ -notmatch ('^\s*(?:' + $taskNames + ')\s*=') })
$taskNew = @(
    'AI_PROVIDER=astropods',
    'ASTRO_MODEL=qwen3-vl',
    ('ASTRO_GATEWAY_URL=' + (ConvertTo-Json -InputObject ([string]$taskCredentials.url) -Compress)),
    ('ASTRO_GATEWAY_API_KEY=' + (ConvertTo-Json -InputObject ([string]$taskCredentials.key) -Compress))
)
[IO.File]::WriteAllText($taskEnvPath, (($taskKept + $taskNew) -join "`r`n") + "`r`n", [Text.UTF8Encoding]::new($false))
$taskCredentials = $null
$taskRaw = $null
Write-Output 'Astropods development access saved in ignored .env.local. No keys displayed.'
Write-Output 'Restart the ProofPay development server. Re-run this helper after the gateway key is renewed.'
