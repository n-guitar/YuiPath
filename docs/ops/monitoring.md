# Monitoring & alarms

Phase 4 task — alarm wiring goes in a `MonitoringStack` (not yet created in
the CDK at the time of this writing). This doc records the *intent* so the
stack can be added by replacing the placeholder section in
`infra/cdk/lib/yuipath-stack.ts`.

## Recommended alarms

| Alarm | Threshold | Action |
|---|---|---|
| DynamoDB `ThrottledRequests` | sum > 0 over 5 min | SNS → email |
| Lambda `Errors` | rate > 1% over 5 min | SNS → email |
| API Gateway `4xx` | rate > 5% over 5 min | SNS → email (informational) |
| API Gateway `5xx` | rate > 0.5% over 5 min | SNS → email (page-worthy) |
| CloudFront `5xxErrorRate` | > 1% over 5 min | SNS → email |
| Cognito `SignInThrottles` | sum > 10 over 5 min | SNS → email (potential abuse) |

All alarms have a dashboard line in the CloudWatch dashboard
`yuipath-{env}-overview`.

## Logs

- **Lambda logs**: `/aws/lambda/yuipath-{env}-api`. Retention 30 days
  (configured in `ApiStack`).
- **API Gateway access logs**: not enabled by default — add to `ApiStack` if
  you need request-level forensics.
- **CloudFront logs**: not enabled by default. Enable to S3 if WAF blocks need
  investigation.

## X-Ray

`tracing: ACTIVE` is set on the Lambda function. Traces include DynamoDB
spans automatically via `aws-xray-sdk-python` (add to dependencies if you
need custom segments — boto3 is auto-instrumented).

## Hot partition detection (ADR-0002)

The Event Log uses `PROJ#<id>` as the partition key. A single very-active
project can become a hot partition. Symptoms:

- Increased `ThrottledRequests` despite low overall RCU/WCU
- One specific `PROJ#<id>` shows up disproportionately in CloudWatch
  Contributor Insights for the table.

Mitigation (deferred to a future ADR):

- Date-shard the SK: `EVT#YYYY-MM-DD#<ts>#<id>` and write to N pseudo-keys
  per project.
- Or move events into Kinesis Data Streams before they land in DynamoDB.

## On-call

Currently single-maintainer. Alerts go to n-guitar's email. Migrate to
PagerDuty / on-call rotation only if the team grows past 3.
