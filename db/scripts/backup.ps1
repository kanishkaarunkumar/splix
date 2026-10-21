param([string]$Database = "splix", [string]$User = "splix_migrator", [string]$Output = "splitwise.dump")
$ErrorActionPreference = "Stop"
docker compose exec -T db pg_dump --format=custom --no-owner -U $User -d $Database | Set-Content -Encoding Byte -Path $Output
if ($LASTEXITCODE -ne 0) { throw "Database backup failed" }
Write-Host "Wrote $Output"
