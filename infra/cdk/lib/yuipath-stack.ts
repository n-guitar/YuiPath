// SPDX-License-Identifier: Apache-2.0
import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";

export interface YuiPathStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * Phase 0: empty placeholder stack.
 * Phase 3 will add Cognito / DynamoDB / Lambda / API Gateway / AgentCore Gateway / CloudFront.
 */
export class YuiPathStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: YuiPathStackProps) {
    super(scope, id, props);

    new cdk.CfnOutput(this, "EnvName", { value: props.envName });
  }
}
