import * as cdk from "aws-cdk-lib";
import ApiStack from "./api-stack";
//import AuthStack from "./auth-stack";
//import { MainStack as ApiExtraRoutesStack } from "./api-extra-routes-stack";
//import EventBusStack from "./eventbus-stack";
//import ApolloStack from "./apollo-api-stack";
//import { MainStack as CronStack } from "./cron-stack";
//import BucketStack from "./bucket-stack";
//import BucketCDNStack from "./bucket-cdn-stack";
//import { MainStack as TopicStack } from "./topic-stack";
//import { MainStack as AppsyncStack } from "./app-sync-api-stack";
//import { MainStack as WebsocketStack } from "./websocket-api-stack";
//import { MainStack as KinesisStack } from "./kinesis-stream";
//import { MainStack as ApiV1Stack } from "./apiv1-stack";
//import ReactSiteStack from "./react-static-site-stack";
//import { MainStack as NextjsStack } from "./nextjs-site-stack";
//import { MainStack as ScriptStack } from "./script-stack";
//import FunctionLayerStack from "./function-layer-stack";
//import FunctionLayerShareStack from "./function-layer-share-stack";

//import { MainStack as TableStack } from "./table-stack";
//import GlobalTableStack from "./global-table-stack";
//import { MainStack as RDSStack } from "./rds-stack";
//import { MainStack as KinesisFirehoseStack } from "./kinesis-firehose";
//import { MainStack as SiteStack } from "./static-site-stack";

//import { MainStack as AnotherStack } from "./table-to-kinesis-stack";
//import TopicToQueueStack from "./topic-to-queue-stack";
//import ContainerFunction from "./container-function-stack";
//import { MainStack as AnotherStack } from "./api-with-lambda-authorizer";
//import { MainStack as AnotherStack } from "./step-functions-stack";
//import RuntimeStack from "./runtime-stack";
//import { MainStack as EmptyStack } from "./empty-stack";
//import { MainStack as ErrorStack } from "./error-stack";
//import { MainStack as LambdaErrorCasesStack } from "./lambda-error-cases-stack";
//import { MainStack as CircularDependencyStack } from "./circular-dependency-stack";

import * as sst from "@serverless-stack/resources";

export default async function main(app: sst.App) {
  app.setDefaultFunctionProps({
    runtime: "nodejs16.x",
  });
  app.setDefaultRemovalPolicy("destroy");

  app
  .stack(ApiStack, { id: "api" })
  //.stack(AuthStack)
  //.stack(ApiExtraRoutesStack, { id: "api-extra-routes" })
  //.stack(ApiV1Stack, { id: "apiv1" });
  //.stack(ApolloStack, { id: "apollo" });
  //new AppsyncStack(app, "appsync");
  //new WebsocketStack(app, "websocket");

  //.stack(TableStack, { id: "table" });
  //.stack(GlobalTableStack, { id: "global-table" });
  //.stack(RDSStack, { id: "rds"})
  //new CronStack(app, "cron");
  //.stack(BucketStack, { id: "bucket" })
  //.stack(BucketCDNStack, { id: "bucket-cdn" })
  //new TopicStack(app, "topic");
  //.stack(EventBusStack, { id: "event-bus" })
  //new KinesisStack(app, "stream");
  //.stack(ReactSiteStack, { id: "site" })
  //new NextjsStack(app, "nextjs", { api: apiStack.api });
  //new ScriptStack(app, "script", { api: apiStack.api });
  //.stack(FunctionLayerStack)
  //.stack(FunctionLayerShareStack)

  // Unsupported SST constructs
  //new KinesisFirehoseStack(app, "firehose");

  //.stack(RuntimeStack, { id: "runtime"})
  //.stack(TopicToQueueStack)
  //.stack(ContainerFunctionStack)
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
