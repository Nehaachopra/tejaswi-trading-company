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
Sale	SA	SA26000001
Purchase	PU	PU26000001
Sale Return	SR	SR26000001
Purchase Return	PR	PR26000001
Receipt	RE	RE26000001
Payment	PA	PA26000001
Deposit	DE	DE26000001
Withdrawal	WD	WD26000001
Drawings	DR	DR26000001
Other	OT	OT26000001

For SR26000001:
- SR — Sale Return
- 26 — Financial year 2026–27
- 000001 — First sale return of that type in that financial year

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