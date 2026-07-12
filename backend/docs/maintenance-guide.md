# Maintenance guide

Apply dependency updates monthly in staging. Review slow queries and indexes from measured plans, not guesses. Archive expired refresh tokens, enforce retention policies for uploads/audits, validate backups, and test restore quarterly. Reconcile accounting and inventory weekly. Prisma migrations must be additive/backward compatible during rolling deploys. Monitor database storage, connection use, API latency, memory, disk, failed authentication, and outbox backlog. Record every operational change, approver, result, and rollback plan.
