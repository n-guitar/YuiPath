// SPDX-License-Identifier: Apache-2.0
import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { ApiStack } from "./api-stack.js";
import { AuthStack } from "./auth-stack.js";
import { DataStack } from "./data-stack.js";
import { WebStack } from "./web-stack.js";

export interface YuiPathStackProps extends cdk.StackProps {
  envName: string;
  callbackUrls?: string[];
  logoutUrls?: string[];
}

export class YuiPathStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: YuiPathStackProps) {
    super(scope, id, props);

    const callbackUrls = props.callbackUrls ?? ["http://localhost:5173/auth/callback"];
    const logoutUrls = props.logoutUrls ?? ["http://localhost:5173/"];

    const auth = new AuthStack(this, "AuthStack", {
      envName: props.envName,
      callbackUrls,
      logoutUrls,
    });

    const data = new DataStack(this, "DataStack", { envName: props.envName });

    const api = new ApiStack(this, "ApiStack", {
      envName: props.envName,
      table: data.table,
      userPool: auth.userPool,
      webClient: auth.webClient,
      corsAllowOrigins: callbackUrls.map((u) => new URL(u).origin),
    });

    new WebStack(this, "WebStack", {
      envName: props.envName,
      apiEndpoint: api.httpApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, "EnvName", { value: props.envName });
  }
}
