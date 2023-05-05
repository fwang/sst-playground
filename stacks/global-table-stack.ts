import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Table, StackContext } from "sst/constructs";

export default function GlobalTableStack({ app, stack }: StackContext) {
  const rootStage = "us-east-1";
  const replicationRegions = app.local ? [] : ["us-east-2"];

  const table = new Table(stack, "GlobalChartflowData", {
    fields: {
      pk: "string",
      sk: "string",
      gsi1pk: "string",
      gsi1sk: "string",
    },
    primaryIndex: { partitionKey: "pk", sortKey: "sk" },
    globalIndexes: {
      GSI1: { partitionKey: "gsi1pk", sortKey: "gsi1sk" },
    },
    stream: true,
    consumers: {
      dynamodbstream: {
        function: {
          handler: "src/lambda.root",
          environment: {
            STAGE: rootStage,
          },
          permissions: [
            new PolicyStatement({
              actions: [
                "ssm:GetParameter",
                "ssm:GetParameters",
                "ssm:GetParametersByPath",
              ],
              resources: ["*"],
            }),
          ],
        },
      },
    },
    cdk: {
      table: {
        tableName: `${stack.stage}-table`,
        replicationRegions: replicationRegions,
      },
    },
  });

  stack.addOutputs({
    TableArn: table.tableArn,
  });
}
