import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { StackContext, Queue, EventBus } from "sst/constructs";

export default function EventBusStack({ stack }: StackContext) {
  const queue = new Queue(stack, "Queue", {
    consumer: "src/lambda.main",
  });

  // Imported by ARN
  const bus = new EventBus(stack, "ImportedByArn", {
    defaults: {
      function: {
        timeout: 10,
      },
    },
    rules: {
      rule1: {
        pattern: {
          source: ["my.custom.event"],
          detailType: ["a", "b"],
        },
        targets: {
          target1: "src/lambda.main",
          //target2: queue,
          //target3: {
          //  type: "function",
          //  cdk: {
          //    function: lambda.Function.fromFunctionName(stack, "ImportedFunction", "dev-playground-api-ApiLambdaGETB1714EF3-ajj2iCE6DjjZ")
          //  }
          //},
          target4: {
            type: "log_group",
            cdk: {
              logGroup: new LogGroup(stack, "LogGroup", {
                logGroupName: "/sst-playground/logs",
              }),
            },
          },
        },
      },
    },
    cdk: {
      eventBus: events.EventBus.fromEventBusArn(
        stack,
        "IBus",
        "arn:aws:events:us-east-1:112245769880:event-bus/default"
      ),
    },
  });

  //// Imported by name
  //new EventBus(stack, "ImportedBusByName", {
  //  cdk: {
  //    eventBus: events.EventBus.fromEventBusName(
  //      stack,
  //      "IBusByName",
  //      "default"
  //    ),
  //  },
  //  rules: {
  //    rule2: {
  //      pattern: { source: ["aws.codebuild"] },
  //      targets: {
  //        target1: "src/lambda.main",
  //        target2: queue,
  //      },
  //    },
  //  },
  //});

  //// Imported by CFN-imported ARN
  //new EventBus(stack, "ImportedBusByCfnImportedArn", {
  //  cdk: {
  //    eventBus: events.EventBus.fromEventBusArn(
  //      stack,
  //      "IBusByCfnImportedArn",
  //      cdk.Fn.importValue("PlaygroundEventBusARN").toString()
  //    ),
  //  },
  //  rules: {
  //    rule3: {
  //      pattern: { source: ["aws.codebuild"] },
  //      targets: {
  //        target1: "src/lambda.main",
  //        target2: queue,
  //      },
  //    },
  //  },
  //});

  stack.addOutputs({
    BusArn: {
      value: bus.eventBusArn,
      exportName: "PlaygroundEventBusARN",
    },
    BusName: bus.eventBusName,
  });

  return { bus };
}
