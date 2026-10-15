# Only authorization definitions, never users, assignments, or attendance.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$query = "select jsonb_build_object('roles',(select jsonb_agg(to_jsonb(r)) from public.roles r),'permissions',(select jsonb_agg(to_jsonb(p)) from public.permissions p),'role_permissions',(select jsonb_agg(to_jsonb(rp)) from public.role_permissions rp)) as definitions"
$result = & npx supabase db query --linked --project-ref aapwnawkgyoynxdhinhb --output json $query
if ($LASTEXITCODE -ne 0) { throw 'Unable to read role definitions.' }
$data = ($result | ConvertFrom-Json).rows[0].definitions
$sql = "BEGIN;`n"
foreach ($table in @('roles','permissions','role_permissions')) {
  $json = ConvertTo-Json -InputObject @($data.$table) -Depth 20 -Compress
  $json = $json.Replace("'", "''")
  $sql += "INSERT INTO public.$table SELECT * FROM jsonb_populate_recordset(NULL::public.$table, '$json'::jsonb) ON CONFLICT DO NOTHING;`n"
}
$sql += @'
CREATE OR REPLACE TRIGGER on_auth_user_created_or_email_changed
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.handle_auth_user();
COMMIT;
'@
[IO.File]::WriteAllText((Join-Path $repoRoot 'tmp/v26-staging-reference.sql'), $sql)
Write-Output 'Prepared only role/permission definitions and profile-sync trigger.'
