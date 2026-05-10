// SPDX-License-Identifier: Apache-2.0
import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import type { Construct } from "constructs";

export interface AuthStackProps extends cdk.NestedStackProps {
  envName: string;
  callbackUrls: string[];
  logoutUrls: string[];
}

export class AuthStack extends cdk.NestedStack {
  readonly userPool: cognito.UserPool;
  readonly webClient: cognito.UserPoolClient;
  readonly mcpClient: cognito.UserPoolClient;
  readonly hostedUiDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `yuipath-${props.envName}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        is_system_admin: new cognito.BooleanAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy:
        props.envName === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.hostedUiDomain = this.userPool.addDomain("HostedUiDomain", {
      cognitoDomain: { domainPrefix: `yuipath-${props.envName}` },
    });

    this.webClient = this.userPool.addClient("WebClient", {
      userPoolClientName: `yuipath-${props.envName}-web`,
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
      },
      preventUserExistenceErrors: true,
    });

    this.mcpClient = this.userPool.addClient("McpClient", {
      userPoolClientName: `yuipath-${props.envName}-mcp`,
      generateSecret: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: props.callbackUrls,
      },
    });

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "WebClientId", { value: this.webClient.userPoolClientId });
    new cdk.CfnOutput(this, "HostedUiUrl", {
      value: `https://${this.hostedUiDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });
  }
}
