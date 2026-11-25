## Summary

<!-- Describe what this PR changes and why. -->

## Related Checklist / Issues

<!-- Reference sections or item IDs from plan/checklist.md if applicable. -->

## Verification

- [ ] `npx tsc --noEmit` passes (`frontend/`)
- [ ] `npm run lint` passes (`frontend/`)
- [ ] `npm test` passes (`frontend/`)
- [ ] `npm run build` passes (`frontend/`)
- [ ] If `src/db/schema.ts` changed: SQL migration + `_journal.json` generated, `migrations.test.ts` and `db:drift` pass

## Risk & Rollback Notes

<!-- Note any environment variables, database migrations, or manual deployment steps required. -->
