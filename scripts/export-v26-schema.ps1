# Read-only schema export. Never exports table data or executes the CLI's shell script.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$dumpTool = Join-Path $repoRoot 'tmp/pg17/pgsql/bin/pg_dump.exe'
if (!(Test-Path -LiteralPath $dumpTool)) { throw 'Portable pg_dump is not available.' }
$schemaOutput = Join-Path $repoRoot 'tmp/v26-schema-only.sql'
$plan = & npx supabase db dump --project-ref aapwnawkgyoynxdhinhb --schema public,private --dry-run 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Unable to obtain read-only export connection.' }
$keys = @('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE')
$previous = @{}
try {
  foreach ($key in $keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    $entry = @($plan | Where-Object { $_ -match "^export $key=" })
    if ($entry.Count -ne 1) { throw "Missing export connection setting: $key" }
    $value = ($entry[0] -replace "^export $key=", '').Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
  }
  & $dumpTool --schema-only --schema=public --schema=private --role=postgres --no-owner --no-comments --file=$schemaOutput
  if ($LASTEXITCODE -ne 0) { throw 'Schema-only export failed.' }
  Write-Output 'Schema-only export complete. No records exported.'
} finally {
  foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
  $plan = $null
}
