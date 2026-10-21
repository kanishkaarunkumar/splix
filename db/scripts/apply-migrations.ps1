param(
  [string]$Database = "splix",
  [string]$User = "splix_migrator"
)
$ErrorActionPreference = "Stop"
docker compose up -d db
foreach ($migration in @("db/migrations/001_financial_schema.sql", "db/migrations/002_product_extensions.sql")) {
  Get-Content -Raw $migration | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U $User -d $Database -f -
  if ($LASTEXITCODE -ne 0) { throw "Migration failed: $migration" }
}
Get-Content -Raw "db/seeds/001_demo.sql" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U $User -d $Database -f -
if ($LASTEXITCODE -ne 0) { throw "Demo seed failed" }
