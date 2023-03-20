import { Stack, App } from "aws-cdk-lib";
import {
  PolicyDocument,
  PolicyStatement,
  ServicePrincipal,
  Effect,
} from "aws-cdk-lib/aws-iam";
import { CfnQueuePolicy } from "aws-cdk-lib/aws-sqs";
import * as sst from "sst/constructs";

export default class MainStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id, {
      stackName: "classic-dev",
      env: { region: "us-west-1" },
    });

    const sqs = new sst.Queue(this, "Queue");

    const customPolicyDocument = new PolicyDocument({
      statements: [
        new PolicyStatement({
          actions: ["sqs:ReceiveMessage"],
          effect: Effect.ALLOW,
          principals: [new ServicePrincipal("sns.amazonaws.com")],
          resources: [sqs.queueArn],
        }),
      ],
    });

    const cfnQueuePolicy = new CfnQueuePolicy(
      this,
      "MyCustomQueuePolicyDocument",
      {
        queues: [sqs.queueUrl],
        policyDocument: customPolicyDocument.toJSON(),
      }
    );
  }
}
