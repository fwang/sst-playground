import * as cdk from "aws-cdk-lib";
import DemoStack from "./demo-stack";
//import AuthStack from "./auth-stack";
//import ApiStack from "./api-stack";
//import CognitoStack from "./cognito-stack";
//import SecretsStack from "./secrets-stack";
//import { MainStack as ApiExtraRoutesStack } from "./api-extra-routes-stack";
//import EventBusStack from "./eventbus-stack";
//import ApolloStack from "./apollo-api-stack";
////import { MainStack as CronStack } from "./cron-stack";
//import BucketStack from "./bucket-stack";
////import BucketCDNStack from "./bucket-cdn-stack";
//import TopicStack from "./topic-stack";
//import QueueStack from "./queue-stack";
//import AppSyncApiStack from "./app-sync-api-stack";
//import WebsocketStack from "./websocket-api-stack";
//import KinesisStack from "./kinesis-stream-stack";
//import ApiV1Stack from "./apiv1-stack";
////import { MainStack as ScriptStack } from "./script-stack";
//import FunctionStack from "./function-stack";
////import FunctionLayerStack from "./function-layer-stack";
////import FunctionLayerShareStack from "./function-layer-share-stack";
////import CodeBuildStack from "./code-build-stack";
//
////import { MainStack as SiteStack } from "./static-site-stack";
//import ReactSiteStack from "./react-static-site-stack";
import Nextjs11Stack from "./nextjs11-site-stack";
import NextjsStack from "./nextjs-site-stack";
//import RemixStack from "./remix-site-stack";
import AstroStack from "./astro-site-stack";
import SolidStartStack from "./solid-start-site-stack";
import SolidStartEdgeStack from "./solid-start-site-edge-stack";
//
//import JobStack from "./job-stack";
//import TableStack from "./table-stack";
////import GlobalTableStack from "./global-table-stack";
//import RDSStack from "./rds-stack";
////import { MainStack as KinesisFirehoseStack } from "./kinesis-firehose";
//
////import { MainStack as AnotherStack } from "./table-to-kinesis-stack";
////import TopicToQueueStack from "./topic-to-queue-stack";
////import ContainerFunction from "./container-function-stack";
////import { MainStack as AnotherStack } from "./api-with-lambda-authorizer";
////import StepFunctionStack from "./step-functions-stack";
//import RuntimeStack from "./runtime-stack";
//import { MainStack as EmptyStack } from "./empty-stack";
//import { MainStack as ErrorStack } from "./error-stack";
//import { MainStack as LambdaErrorCasesStack } from "./lambda-error-cases-stack";
//import { MainStack as CircularDependencyStack } from "./circular-dependency-stack";

//import ClassicStack from "./classic-stack";

import * as sst from "sst/constructs";

export default async function main(app: sst.App) {
  app.setDefaultFunctionProps({
    runtime: "nodejs16.x",
    nodejs: {
      format: "esm",
    }
  });
  app.setDefaultRemovalPolicy("destroy");

  //new ClassicStack(app, "classic");

  app
    //.stack(DemoStack, { id: "demo" })
    //.stack(AuthStack, { id: "auth" })
    //.stack(SecretsStack)
    //.stack(CognitoStack, { id: "AuthStack" })
    //.stack(ApiStack, { id: "api" })
    //.stack(JobStack, { id: "long-running" })

    //.stack(ApiExtraRoutesStack, { id: "api-extra-routes" })
    //.stack(ApiV1Stack, { id: "apiv1" })
    //.stack(ApolloStack, { id: "apollo" })
    //.stack(AppSyncApiStack, { id: "appsync" })
    //.stack(WebsocketStack, { id: "websocket" })

    //.stack(TableStack, { id: "table" })
    //.stack(GlobalTableStack, { id: "global-table" });
    //.stack(RDSStack, { id: "rds" })
    //new CronStack(app, "cron");
    //.stack(BucketStack, { id: "bucket" })
    //.stack(BucketCDNStack, { id: "bucket-cdn" })
    //.stack(TopicStack, { id: "topic" })
    //.stack(QueueStack)
    //.stack(EventBusStack, { id: "event-bus" })
    //.stack(KinesisStack, { id: "stream" })
    //.stack(ReactSiteStack, { id: "site" })
    //.stack(Nextjs11Stack)
    .stack(NextjsStack)
  //.stack(RemixStack)
  //.stack(AstroStack)
  //.stack(SolidStartStack)
  //.stack(SolidStartEdgeStack)
  //new ScriptStack(app, "script", { api: apiStack.api });
  //.stack(FunctionLayerStack)
  //.stack(FunctionLayerShareStack)
  //.stack(StepFunctionStack)
  //.stack(CodeBuildStack)

  // Unsupported SST constructs
  //new KinesisFirehoseStack(app, "firehose");

  //.stack(RuntimeStack, { id: "runtime" })
  //.stack(TopicToQueueStack)
  //.stack(ContainerFunctionStack)
  //.stack(FunctionStack);

  //new EmptyStack(app, "empty");
  //new ErrorStack(app, "error");
  //new LambdaErrorCasesStack(app, "lambda-error-cases");
  //new CircularDependencyStack(app, "circular-dependency");
}

//export function debugStack(
//  app: cdk.App,
//  stack: cdk.Stack,
//  props: sst.DebugStackProps
//): void {
//  cdk.Tags.of(app).add("stage-region", `${props.stage}-${stack.region}`);
//}

export function debugApp(app: sst.DebugApp) {
  new sst.DebugStack(app, "debug-stack", {
    stackName: app.logicalPrefixedName("live-debug"),
  });
  cdk.Tags.of(app).add("test", `${app.stage}-${app.region}`);
}
