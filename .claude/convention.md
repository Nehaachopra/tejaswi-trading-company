# service
- all service must be enclosed within a class and exported! Keep business logic inside services. Do not implement business rules inside tRPC routers or UI components.

- Use Zod for input and output schemas.Define service input and output schemas in the corresponding model.ts. Infer TypeScript types from Zod schemas instead of duplicating type definitions.

Example structure
packages/services/
  user/
    model.ts
    index.ts
  party/
    model.ts
    index.ts
  sale/
    model.ts
    index.ts

# error handling
- Log every unexpected server-side error using the existing logger.

# database conventions
- Use camelCase for TypeScript property names and snake_case for PostgreSQL column names.
- use cli command - db:generate to generate migrations. I will be executing db:migrate to migrate after reviewing the generation!
- Use database transactions for operations that require multiple related writes to succeed or fail together.

# Assigned Id pattern 
 
Transaction type	Prefix	Example
Sale	SA	SA26100001
Purchase	PU	PU26100001
Sale Return	SR	SR26100001
Purchase Return	PR	PR26100001
Receipt	RE	RE26100001
Payment	PA	PA26100001
Deposit	DE	DE26100001
Withdrawal	WD	WD26100001
Transfer	TR	TR26100001
Drawings	DR	DR26100001
Other	OT	OT26100001
Salary	SL	SL26100001
Sale Order	SO	SO26100001
Purchase Order	PO	PO26100001
Opening Balance	OB	OB26100001

For SR26100001:
- SR — Sale Return
- 2610 — year and month of the invoice date (October 2026), not the save date
- 0001 — First sale return in that month (4 digits, up to 9,999 per prefix per month)

The assigned ID lives on `transactions.assigned_id`, unique per transaction type (orders carry their own). Numbers come from `assigned_id_counters` (one row per prefix, year, month), incremented inside the same database transaction that saves the transaction, so numbers are never skipped or duplicated.

# git commits
- Frequency - Do not wait too long to commit. After a logical change that can be grouped, commit. Again double edged sword! Do not create commits after every code change.  
- Every commit message must follow this format: <type>(<scope>): <description>. Examples:
    - feat(sale): add sale transaction creation
    - fix(inventory): prevent negative stock allocation
- Use only the following types:
    - feat — Add new functionality.
    - fix — Fix a bug. 
    - refactor — Restructure code without changing its external behaviour.
    - test — Add or update tests.
    - docs — Add or update documentation.
    - chore — Maintenance tasks that do not change application behaviour.
    - perf — Improve performance.
    - build — Change build configuration or build tooling.
    - ci — Change CI/CD configuration.
    - style — Changes that do not affect code behaviour, such as formatting.