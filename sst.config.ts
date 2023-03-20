import { SSTConfig } from "sst";
import { Stack as CdkStack } from "aws-cdk-lib";
import DemoStack from "./stacks/demo-stack";
import AuthStack from "./stacks/auth-stack";
import ApiStack from "./stacks/api-stack";
import CognitoStack from "./stacks/cognito-stack";
import SecretsStack from "./stacks/secrets-stack";
import ApiExtraRoutesStack from "./stacks/api-extra-routes-stack";
import EventBusStack from "./stacks/eventbus-stack";
//import ApolloStack from "./stacks/apollo-api-stack";
////import { MainStack as CronStack } from "./stacks/cron-stack";
//import BucketStack from "./stacks/bucket-stack";
////import BucketCDNStack from "./stacks/bucket-cdn-stack";
//import TopicStack from "./stacks/topic-stack";
//import QueueStack from "./stacks/queue-stack";
import AppSyncApiStack from "./stacks/app-sync-api-stack";
import WebsocketStack from "./stacks/websocket-api-stack";
//import KinesisStack from "./stacks/kinesis-stream-stack";
import ApiV1Stack from "./stacks/apiv1-stack";
import ScriptStack from "./stacks/script-stack";
import FunctionStack from "./stacks/function-stack";
////import FunctionLayerStack from "./stacks/function-layer-stack";
////import FunctionLayerShareStack from "./stacks/function-layer-share-stack";
////import CodeBuildStack from "./stacks/code-build-stack";
//
import StaticSiteStack from "./stacks/static-site-stack";
import ReactSiteStack from "./stacks/react-static-site-stack";
import Nextjs11Stack from "./stacks/nextjs11-site-stack";
import Nextjs13Stack from "./stacks/nextjs13-site-stack";
import RemixStack from "./stacks/remix-site-stack";
import RemixEdgeStack from "./stacks/remix-edge-site-stack";
import AstroStack from "./stacks/astro-site-stack";
import AstroEdgeStack from "./stacks/astro-site-edge-stack";
import SolidStartStack from "./stacks/solid-start-site-stack";
import SolidStartEdgeStack from "./stacks/solid-start-site-edge-stack";
//
import JobStack from "./stacks/job-stack";
//import TableStack from "./stacks/table-stack";
////import GlobalTableStack from "./stacks/global-table-stack";
//import RDSStack from "./stacks/rds-stack";
////import { MainStack as KinesisFirehoseStack } from "./stacks/kinesis-firehose";
//
////import { MainStack as AnotherStack } from "./stacks/table-to-kinesis-stack";
////import TopicToQueueStack from "./stacks/topic-to-queue-stack";
////import ContainerFunction from "./stacks/container-function-stack";
////import { MainStack as AnotherStack } from "./stacks/api-with-lambda-authorizer";
////import StepFunctionStack from "./stacks/step-functions-stack";
//import RuntimeStack from "./stacks/runtime-stack";
//import { MainStack as EmptyStack } from "./stacks/empty-stack";
//import { MainStack as ErrorStack } from "./stacks/error-stack";
//import { MainStack as LambdaErrorCasesStack } from "./stacks/lambda-error-cases-stack";
//import { MainStack as CircularDependencyStack } from "./stacks/circular-dependency-stack";

import ClassicStack from "./stacks/classic-stack";

export default {
  config(input) {
    return {
      name: "playground",
      region: "us-east-1",
      _ssmPrefix: "/myOrg/myTeam",
      _bootstrap: {
        stackName: "my-bootstrap",
        tags: {
          foo: "bar",
        },
      },
      _cdk: {
        qualifier: "aaa",
        toolkitStackName: "my-cdk-toolkit",
      },
    };
  },
  async stacks(app) {
    app.setDefaultFunctionProps({
      runtime: "nodejs16.x",
      nodejs: {
        format: "esm",
      },
    });
    app.setDefaultRemovalPolicy("destroy");

    //new ClassicStack(app, "classic");
    //.stack((context) => Stack1(context, "1"), { id: "stack1" })

    app
      //
      //.stack(DemoStack, { id: "demo" });
      //.stack(AuthStack, { id: "auth" })
      //.stack(SecretsStack)
      //.stack(CognitoStack, { id: "AuthStack" })
      //.stack(ApiStack, { id: "api" })
      //.stack(ApiExtraRoutesStack, { id: "api-extra-routes" });
      //.stack(JobStack, { id: "long-running" });

      //.stack(ApiV1Stack, { id: "apiv1" })
      //.stack(ApolloStack, { id: "apollo" })
      //.stack(AppSyncApiStack, { id: "appsync" });
      //.stack(WebsocketStack, { id: "websocket" });

      //.stack(TableStack, { id: "table" })
      //.stack(GlobalTableStack, { id: "global-table" });
      //.stack(RDSStack, { id: "rds" })
      //new CronStack(app, "cron");
      //.stack(BucketStack, { id: "bucket" })
      //.stack(BucketCDNStack, { id: "bucket-cdn" })
      //.stack(TopicStack, { id: "topic" })
      //.stack(QueueStack)
      //.stack(EventBusStack, { id: "event-bus" });
      //.stack(KinesisStack, { id: "stream" })
      //.stack(StaticSiteStack);
      //.stack(ReactSiteStack, { id: "site" })
      //.stack(Nextjs11Stack);
      .stack(Nextjs13Stack);
    //.stack(RemixStack);
    //.stack(RemixEdgeStack);
    //.stack(AstroStack);
    //.stack(AstroEdgeStack)
    //.stack(SolidStartStack)
    //.stack(SolidStartEdgeStack);
    //.stack(ScriptStack, { id: "script" });
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
  },
} satisfies SSTConfig;
