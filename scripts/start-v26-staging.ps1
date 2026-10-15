# Staging-only server. Keys remain in this process; .env.local is never changed.
param([ValidateSet('Server','Bootstrap','Invite')][string]$Mode = 'Server')
$ErrorActionPreference = 'Stop'
$stagingRef = 'plvovuhtjjahiqelnvxv'
$result = & npx supabase projects api-keys --project-ref $stagingRef --output json
if ($LASTEXITCODE -ne 0) { throw 'Could not obtain staging API keys.' }
$keys = $result | ConvertFrom-Json
$publicKey = @($keys | Where-Object name -eq 'anon')[0].api_key
$serverKey = @($keys | Where-Object name -eq 'service_role')[0].api_key
if (!$publicKey -or !$serverKey) { throw 'Expected staging keys are unavailable.' }
$env:NEXT_PUBLIC_SUPABASE_URL = "https://$stagingRef.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $publicKey
$env:SUPABASE_SERVICE_ROLE_KEY = $serverKey
$env:NEXT_PUBLIC_SITE_URL = 'http://localhost:3001'
$env:SITE_URL = 'http://localhost:3001'
$result = $null
$keys = $null
if ($Mode -ne 'Server') {
  & node scripts/v26-staging-auth.mjs $Mode.ToLowerInvariant()
  exit $LASTEXITCODE
}
Write-Output 'Starting isolated staging application at http://localhost:3001 (staging database only).'
# Use the Node/Vercel runner, not the Cloudflare runner that imports .env.local
# as worker secrets independently of the parent process environment.
& npx vite --config vite.staging.config.ts --host 127.0.0.1 --port 3001 --strictPort
