# Phase 9 — staged Firestore branch isolation

Changed `firestore.rules` for `company_contacts` and `internal_notes` only.

- Documents carrying `branchId` require an authenticated ADMIN with a matching `admins/{uid}.branchId` (or `users/{uid}.branchId` if no admin document exists).
- Tagged documents cannot have their branch changed through updates.
- Newly created tagged documents must match the admin's branch.
- Untagged legacy documents intentionally retain the prior ADMIN access policy. **This means branch isolation is NOT complete.**
- Existing client code does not automatically tag new documents. Branch assignment and backfill must be done in a separate validated migration.
- Other collections (payroll, companies, workers, files, etc.) are not branch-isolated by this change.
- Static checks: `node scripts/test-phase9.cjs`, `node scripts/test-phase8.cjs`, `node scripts/test-phase7.cjs` passed locally.
- Firebase Emulator authorization tests, TypeScript build, and live Firebase deployment were NOT run.

Do not deploy this partial policy to production without full integration testing and a branch-data migration plan.
