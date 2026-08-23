# DB conventions (Sprint 0)

Andrew owns migrations under `apps/api/migrations/` (create when implementing).

- Table naming: `snake_case`, plural (`payment_orders`, `org_accounts`)
- Enum values must match `@cryptogate/domain` exactly
- Watcher may read/write order status columns only; new columns need Bruce review on Andrew’s migration PR
- Default connection: `DATABASE_URL` from `.env.example` / `docker-compose.yml`
