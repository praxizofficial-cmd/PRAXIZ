# Generates an import artifact only; never connects to a database.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$source = [IO.File]::ReadAllText((Join-Path $repoRoot 'tmp/v26-schema-only.sql'))
if ($source -match '(?m)^(COPY |INSERT INTO )') { throw 'Expected a schema-only export.' }
if ($source -notmatch 'CREATE TABLE public.profiles') { throw 'Incomplete schema export.' }
# psql meta-commands cannot be sent through the Management API. Keep existing
# table/function ACLs and RLS, but do not copy platform-owned default grants.
$source = [regex]::Replace($source, '(?m)^\\(?:un)?restrict[^\r\n]*', '')
$source = [regex]::Replace($source, '(?m)^ALTER DEFAULT PRIVILEGES[^\r\n]*', '')
$source = $source.Replace('CREATE SCHEMA public;', 'CREATE SCHEMA IF NOT EXISTS public;')
$source = $source.Replace('SET row_security = off;', 'SET row_security = on;')
$prefix = @'
BEGIN;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
'@
[IO.File]::WriteAllText((Join-Path $repoRoot 'tmp/v26-staging-schema.sql'), $prefix + "`n" + $source + "`nCOMMIT;`n")
Write-Output 'Prepared transactional staging schema artifact. No data or platform default grants included.'
