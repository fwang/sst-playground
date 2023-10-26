import type { IConstruct } from "constructs";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { SSTConfig } from "sst";
import {
  Aspects,
  IAspect,
  Stack as CdkStack,
  DefaultStackSynthesizer,
} from "aws-cdk-lib";
import { CfnRole, Role } from "aws-cdk-lib/aws-iam";
import DemoStack from "./stacks/demo-stack";
import AuthStack from "./stacks/auth-stack";
import ApiStack from "./stacks/api-stack";
import CognitoStack from "./stacks/cognito-stack";
import VpcStack from "./stacks/vpc-stack";
import SecretsStack from "./stacks/secrets-stack";
import ApiExtraRoutesStack from "./stacks/api-extra-routes-stack";
import EventBusStack from "./stacks/eventbus-stack";
//import ApolloStack from "./stacks/apollo-api-stack";
import CronStack from "./stacks/cron-stack";
import BucketStack from "./stacks/bucket-stack";
//import BucketCDNStack from "./stacks/bucket-cdn-stack";
//import TopicStack from "./stacks/topic-stack";
//import QueueStack from "./stacks/queue-stack";
import AppSyncApiStack from "./stacks/app-sync-api-stack";
import WebsocketStack from "./stacks/websocket-api-stack";
//import KinesisStack from "./stacks/kinesis-stream-stack";
import ApiV1Stack from "./stacks/apiv1-stack";
import ScriptStack from "./stacks/script-stack";
import FunctionStack from "./stacks/function-stack";
import FunctionJavaStack from "./stacks/function-java-stack";
import FunctionRustStack from "./stacks/function-rust-stack";
//import FunctionLayerStack from "./stacks/function-layer-stack";
//import FunctionLayerShareStack from "./stacks/function-layer-share-stack";
import FunctionContainerNodeStack from "./stacks/function-container-node-stack";
import FunctionContainerPythonStack from "./stacks/function-container-python-stack";
import FunctionContainerImageStack from "./stacks/function-container-image-stack";
//import CodeBuildStack from "./stacks/code-build-stack";
import StaticSiteStack from "./stacks/static-site-stack";
import ReactSiteStack from "./stacks/react-static-site-stack";
import ReactSiteLocalStack from "./stacks/react-static-site-local-stack";
import Nextjs11Stack from "./stacks/nextjs11-site-stack";
import Nextjs13Stack from "./stacks/nextjs13-site-stack";
import Nextjs13EdgeStack from "./stacks/nextjs13-site-edge-stack";
import Nextjs13VercelModeStack from "./stacks/nextjs13-site-vercel-mode-stack";
import Nextjs13LocalStack from "./stacks/nextjs13-site-local-stack";
import Remix2Stack from "./stacks/remix2-site-stack";
import RemixStack from "./stacks/remix-site-stack";
import RemixEdgeStack from "./stacks/remix-edge-site-stack";
import Astro3Stack from "./stacks/astro3-site-stack";
import Astro2Stack from "./stacks/astro2-site-stack";
import Astro2EdgeStack from "./stacks/astro2-site-edge-stack";
import Astro2LocalStack from "./stacks/astro2-site-local-stack";
import SolidStartStack from "./stacks/solid-start-site-stack";
import SolidStartEdgeStack from "./stacks/solid-start-site-edge-stack";
import SolidStartLocalStack from "./stacks/solid-start-site-local-stack";
import SvelteKitStack from "./stacks/svelte-kit-site-stack";
import SvelteKitEdgeStack from "./stacks/svelte-kit-site-edge-stack";
import SvelteKitLocalStack from "./stacks/svelte-kit-site-local-stack";
import ServiceStack from "./stacks/service-stack";
import ServiceImageStack from "./stacks/service-image-stack";
import ServiceLocalStack from "./stacks/service-local-stack";
import JobStack from "./stacks/job-stack";
import JobContainerStack from "./stacks/job-container-stack";
import JobContainerPythonStack from "./stacks/job-container-python-stack";
//import TableStack from "./stacks/table-stack";
import GlobalTableStack from "./stacks/global-table-stack";
//import RDSStack from "./stacks/rds-stack";
//import { MainStack as KinesisFirehoseStack } from "./stacks/kinesis-firehose";

//import { MainStack as AnotherStack } from "./stacks/table-to-kinesis-stack";
//import TopicToQueueStack from "./stacks/topic-to-queue-stack";
//import { MainStack as AnotherStack } from "./stacks/api-with-lambda-authorizer";
//import StepFunctionStack from "./stacks/step-functions-stack";
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
      _advanced: {
        _disableParameterizedStackNameCheck: true,
        _disableAppModeCheck: true,
      },
      _bootstrap: {
        stackName: "my-bootstrap",
        tags: {
          foo: "bar",
        },
      },
      cdk: {
        //qualifier: "aaa",
        //toolkitStackName: "my-cdk-toolkit",
        //pathMetadata: true,
        //customPermissionsBoundary: "sst-test-admin",
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
      //.stack(VpcStack)
      .stack(SecretsStack)

      //.stack(ServiceStack);
      //.stack(ServiceImageStack);
      //.stack(ServiceLocalStack);

      //.stack(Nextjs13Stack);
      //.stack(Nextjs13EdgeStack);
      //.stack(Nextjs13VercelModeStack)
      //.stack(Nextjs13LocalStack);
      //.stack(Nextjs11Stack);
      //.stack(SvelteKitStack)
      //.stack(SvelteKitEdgeStack)
      //.stack(SvelteKitLocalStack);
      //.stack(Remix2Stack)
      //.stack(RemixStack);
      //.stack(RemixEdgeStack)
      .stack(Astro3Stack);
    //.stack(Astro2LocalStack)
    //.stack(Astro2Stack)
    //.stack(Astro2EdgeStack);
    //.stack(SolidStartStack);
    //.stack(SolidStartEdgeStack);
    //.stack(SolidStartLocalStack);
    //.stack(StaticSiteStack);
    //.stack(ReactSiteStack, { id: "site" });
    //.stack(ReactSiteLocalStack);

    //.stack(ApiStack, { id: "api" });
    //.stack(ApiExtraRoutesStack, { id: "api-extra-routes" });
    //.stack(ApiV1Stack, { id: "apiv1" });
    //.stack(ApolloStack, { id: "apollo" })
    //.stack(AppSyncApiStack, { id: "appsync" })
    //.stack(WebsocketStack, { id: "websocket" });

    //.stack(CognitoStack, { id: "AuthStack" })
    //.stack(TableStack, { id: "table" })
    //.stack(GlobalTableStack, { id: "global-table" });
    //.stack(RDSStack, { id: "rds" })
    //.stack(CronStack, { id: "cron" });
    //.stack(BucketStack, { id: "bucket" });
    //.stack(BucketCDNStack, { id: "bucket-cdn" })
    //.stack(TopicStack, { id: "topic" })
    //.stack(QueueStack)
    //.stack(EventBusStack, { id: "event-bus" });
    //.stack(KinesisStack, { id: "stream" })
    //.stack(ScriptStack, { id: "script" });
    //.stack(StepFunctionStack)
    //.stack(JobStack);
    //.stack(JobContainerStack)
    //.stack(JobContainerPythonStack);
    //.stack(CodeBuildStack)

    // Unsupported SST constructs
    //new KinesisFirehoseStack(app, "firehose");

    //.stack(RuntimeStack, { id: "runtime" })
    //.stack(TopicToQueueStack)
    //.stack(FunctionContainerNodeStack)
    //.stack(FunctionContainerPythonStack);
    //.stack(FunctionContainerImageStack);
    //.stack(FunctionStack);
    //.stack(FunctionJavaStack);
    //.stack(FunctionRustStack);
    //.stack(FunctionLayerStack)
    //.stack(FunctionLayerShareStack)

    //new EmptyStack(app, "empty");
    //new ErrorStack(app, "error");
    //new LambdaErrorCasesStack(app, "lambda-error-cases");
    //new CircularDependencyStack(app, "circular-dependency");

    /*
    const LabRoleArn = "arn:";
    replaceIamRoles(app);

    function replaceIamRoles(parent: IConstruct) {
      for (const child of parent.node.children) {
        // Remove all IAM roles
        if (child.roleArn) {
          parent.node.tryRemoveChild(child.node.id);
          continue;
        }

        if (child.cfnResourceType === "AWS::Lambda::Function") {
          child.addPropertyOverride("Role", LabRoleArn);
          continue;
        }

        replaceIamRoles(child);
      }
    }
    */
  },
} satisfies SSTConfig;
