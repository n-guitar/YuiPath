# Security

## Reporting a vulnerability

If you find a security issue, please **do not** open a public issue.
Instead email security disclosures to the maintainer via the email listed on
their GitHub profile, or open a [private security advisory](https://github.com/n-guitar/yuipath/security/advisories/new).

We aim to respond within 7 days.

## Security model

YuiPath is a small OSS project; security trade-offs are biased toward
"don't roll your own crypto / auth" — we delegate to AWS-managed services:

| Concern | Where it's handled |
|---|---|
| Authentication (who) | AWS Cognito User Pool + API Gateway JWT Authorizer |
| Authorization (what) | FastAPI handler layer, see [ADR-0011](./adr/0011-roles-and-permissions.md) |
| Transport | CloudFront → S3 (HTTPS only), API Gateway (HTTPS only) |
| Storage | DynamoDB (encrypted at rest) + S3 (SSE-S3) |
| Secrets | None in repo. Env-driven config; `.githooks/pre-commit` blocks AWS resource IDs |
| WAF | AWS managed CommonRuleSet + IP rate limit (2000/5min/IP) |

## What we *don't* do (yet)

- Field-level encryption for sensitive task content.
- Customer-managed KMS keys.
- Audit log streaming to an external SIEM (CloudWatch Logs only).
- Session fingerprinting / anomaly detection.

If your use case needs these, raise an issue describing the threat model
and we can discuss an ADR.

## Local development security

The dev mode (`AUTH_MODE=dev`) trusts a fixed user. **Do not** run dev mode
exposed to the public internet — it has no authentication. The provided
docker-compose only listens on `localhost:*` for this reason.

## Pre-commit hook

`/.githooks/pre-commit` scans staged diffs for AWS resource ID shapes
(account IDs, Cognito User Pool IDs, API Gateway endpoints, AKIA/ASIA
access keys). Enable with:

```bash
git config core.hooksPath .githooks
```

For OSS contributors this is mandatory; CI enforces a similar check via
`gitleaks`.
