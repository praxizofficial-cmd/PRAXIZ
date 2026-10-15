$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$files = @(
  '20261014000000_v26_required_hours.sql',
  '20261014010000_v26_photo_evidence.sql',
  '20261015000000_v26_placement_head_invitation.sql'
)
$sql = "BEGIN;`n"
foreach ($file in $files) { $sql += [IO.File]::ReadAllText((Join-Path $repoRoot "supabase/migrations/$file")) + "`n" }
$sql += "COMMIT;`n"
[IO.File]::WriteAllText((Join-Path $repoRoot 'tmp/v26-staging-migrations.sql'), $sql)
Write-Output 'Prepared transactional v26 staging migration artifact.'
