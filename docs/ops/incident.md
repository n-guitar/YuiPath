# Incident playbook

## Triage

1. Check `/healthz` directly against the API endpoint (bypass CloudFront):
   ```bash
   curl https://<api-endpoint>/healthz
   ```
2. If 5xx: check Lambda errors first, DynamoDB second.

## Common scenarios

### "API returns 500 on all requests"

Likely Lambda exception. Pull recent logs:

```bash
aws logs tail /aws/lambda/yuipath-prod-api --follow --since 10m
```

Common roots:
- DynamoDB IAM permission missing (recent CDK change)
- pydantic ValidationError on `User.from_claims` — Cognito custom claim not
  populated. Check the actual claims with `aws cognito-idp admin-get-user`.

### "API Gateway 401 on every request"

JWT authorizer rejecting tokens. Check:
- Cognito User Pool ID matches Authorizer issuer URL
- Token expired? Hosted UI exchange may have stale state.
- App client audience matches authorizer config.

### "Tasks fail to save with 409"

Optimistic-lock conflict. Two clients editing the same task at once. UX
should expose a "reload and retry" affordance. If you're seeing many of
these from one user, check if they have multiple tabs open.

### "WAF blocking legitimate traffic"

Rate limit (2000 req / 5 min / IP) might be too tight for your workload.
Adjust in `WebStack.WebAcl.rules[0].statement.rateBasedStatement.limit`.

### "DynamoDB ThrottledRequests > 0"

On-demand should auto-scale, but bursts > 4000 RCU/WCU per partition can
throttle. Check for hot partition (see `monitoring.md`). Short-term:
exponential backoff is built into boto3, so this should self-heal.

## Rollback

CloudFormation rollback (manual):

```bash
cdk deploy --rollback YuiPathStack-prod
```

Lambda image rollback only:

```bash
aws lambda update-function-code \
  --function-name yuipath-prod-api \
  --image-uri <previous-tag>
```

The web bundle in S3 is just static files — re-upload an older build to
revert the SPA without touching CDK.

## Dataloss recovery

See [restore.md](./restore.md). PITR can rewind to any second in the past
35 days.
