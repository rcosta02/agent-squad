# Deploy to production

Ships [[projects/storefront]] and [[projects/billing]] together. Takes about twelve minutes end to end.

## Before you start
- [x] Green pipeline on `main`
- [x] Changelog entry written
- [ ] Announce in #releases

## Steps
1. Tag the release: `git tag v2.14.0 && git push --tags`
2. Watch the build at **Actions → Release**
3. Promote the canary once error rate stays under 0.1% for ten minutes

> If anything looks off, stop here and follow [[runbooks/rollback]]. Nobody will mind a paused deploy.

| Stage | Owner | Typical time |
|-------|-------|--------------|
| Build | CI | 4 min |
| Canary | On-call | 10 min |
| Full rollout | On-call | 2 min |

Related decision: [[decisions/2026-09-14-postgres-over-dynamo]].
