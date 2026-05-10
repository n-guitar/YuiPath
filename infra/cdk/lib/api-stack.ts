// SPDX-License-Identifier: Apache-2.0
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2_integ from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigwv2_auth from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Construct } from "constructs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ApiStackProps extends cdk.NestedStackProps {
  envName: string;
  table: dynamodb.Table;
  userPool: cognito.UserPool;
  webClient: cognito.UserPoolClient;
  corsAllowOrigins: string[];
}

export class ApiStack extends cdk.NestedStack {
  readonly httpApi: apigwv2.HttpApi;
  readonly fn: lambda.DockerImageFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    this.fn = new lambda.DockerImageFunction(this, "ApiFn", {
      functionName: `yuipath-${props.envName}-api`,
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, "../../../apps/api"), {
        file: "Dockerfile.lambda",
      }),
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.ONE_MONTH,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        YUIPATH_AUTH_MODE: "cognito",
        YUIPATH_DYNAMODB_TABLE_NAME: props.table.tableName,
        YUIPATH_AWS_REGION: this.region,
      },
    });

    props.table.grantReadWriteData(this.fn);

    const authorizer = new apigwv2_auth.HttpJwtAuthorizer(
      "JwtAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
      {
        jwtAudience: [props.webClient.userPoolClientId],
      },
    );

    this.httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `yuipath-${props.envName}`,
      defaultAuthorizer: authorizer,
      corsPreflight: {
        allowOrigins: props.corsAllowOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ["authorization", "content-type"],
        allowCredentials: true,
      },
    });

    const integration = new apigwv2_integ.HttpLambdaIntegration("ApiInteg", this.fn);

    this.httpApi.addRoutes({
      path: "/api/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration,
    });

    this.httpApi.addRoutes({
      path: "/healthz",
      methods: [apigwv2.HttpMethod.GET],
      integration,
      authorizer: new apigwv2.HttpNoneAuthorizer(),
    });
    this.httpApi.addRoutes({
      path: "/readyz",
      methods: [apigwv2.HttpMethod.GET],
      integration,
      authorizer: new apigwv2.HttpNoneAuthorizer(),
    });

    new cdk.CfnOutput(this, "ApiEndpoint", { value: this.httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "FunctionName", { value: this.fn.functionName });
  }
}
