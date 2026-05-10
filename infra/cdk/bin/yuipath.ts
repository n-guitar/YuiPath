// SPDX-License-Identifier: Apache-2.0
import * as cdk from "aws-cdk-lib";
import { YuiPathStack } from "../lib/yuipath-stack.js";

const app = new cdk.App();
const envName = (app.node.tryGetContext("envName") as string | undefined) ?? "dev";
const region = (app.node.tryGetContext("region") as string | undefined) ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1";

new YuiPathStack(app, `YuiPathStack-${envName}`, {
  envName,
  env: { region, account: process.env.CDK_DEFAULT_ACCOUNT },
});
