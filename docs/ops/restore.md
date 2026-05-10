# Backup & restore

YuiPath stores all persistent state in a single DynamoDB table (per
[ADR-0002](../adr/0002-event-log-on-dynamodb.md)). DR strategy:

## Continuous backup (PITR)

Point-in-Time Recovery is enabled in `DataStack` for all environments. PITR
keeps a continuous backup of the table for 35 days and supports restoring to
any second within that window.

## Restoring to a new table

```bash
TABLE=yuipath-prod
RESTORE_TIME=2026-05-10T12:00:00Z
aws dynamodb restore-table-to-point-in-time \
  --source-table-name "$TABLE" \
  --target-table-name "${TABLE}-restored-$(date +%s)" \
  --restore-date-time "$RESTORE_TIME"
```

After the restore completes:

1. Repoint the Lambda's `YUIPATH_DYNAMODB_TABLE_NAME` env var at the new table
   (manual update via AWS console, or by changing CDK param + redeploy).
2. Verify a known project loads.
3. When confident, swap-out by renaming or deleting the original table and
   adjusting the env var back.

## Disaster: complete account loss

The whole stack is reproducible:

```bash
pnpm install
cd infra/cdk
pnpm synth
cdk deploy YuiPathStack-prod --context envName=prod
node scripts/setup-env.ts --env prod
```

Recovering data from the lost account requires PITR exports being copied
cross-account (set up via a separate backup vault — out of scope for v1).

## Verifying backups

The MonitoringStack (Phase 4 task) emits a CloudWatch alarm when PITR is
disabled. Check:

```bash
aws dynamodb describe-continuous-backups --table-name yuipath-prod
```

Expected: `PointInTimeRecoveryStatus: ENABLED`.
