param([string]$Database = "splix", [string]$AdminUser = "splix_migrator")
$ErrorActionPreference = "Stop"
Get-Content -Raw "db/grants/provision_roles.sql" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U $AdminUser -d $Database -f -
if ($LASTEXITCODE -ne 0) { throw "Role provisioning failed" }
Get-Content -Raw "db/grants/runtime.sql" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U $AdminUser -d $Database -f -
if ($LASTEXITCODE -ne 0) { throw "Runtime grants failed" }
Write-Host "Set the splix_api login password interactively with: docker compose exec db psql -U $AdminUser -d $Database -c '\password splix_api'"
