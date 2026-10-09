# Postgres over DynamoDB

**Context.** [[projects/billing]] needs transactions across invoices and payments.
**Decision.** Postgres on RDS, one schema per tenant.
**Consequences.** Simpler code in billing; [[runbooks/deploy]] runs migrations before promoting the canary.
