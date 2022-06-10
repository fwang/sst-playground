import {PolicyDocument, PolicyStatement,ServicePrincipal,Effect} from "aws-cdk-lib/aws-iam";
import {CfnQueuePolicy} from "aws-cdk-lib/aws-sqs";
import * as sst from "@serverless-stack/resources";

export default class MainStack extends sst.Stack {
  constructor(scope: sst.App, id: string) {
    super(scope, id);

    const sqs = new sst.Queue(this, "Queue");

    const customPolicyDocument = new PolicyDocument({
      statements: [
        new PolicyStatement({
          actions: ['sqs:ReceiveMessage'],
          effect: Effect.ALLOW,
          principals: [
            new ServicePrincipal('sns.amazonaws.com')
          ],
          resources: [sqs.queueArn]
        })
      ]
    });

    const cfnQueuePolicy = new CfnQueuePolicy(this, 'MyCustomQueuePolicyDocument', {
      queues: [sqs.queueUrl],
      policyDocument: customPolicyDocument.toJSON()
    });
  }
}
