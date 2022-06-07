import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sst from "@serverless-stack/resources";

export default function GlobalTableStack({ app, stack }: sst.StackContext) {
  let table;
  const rootStage = "us-east-1";

  if (app.region === "us-east-1") {
    const replicationRegions = app.local ? [] : ["us-east-2"]
    table = new sst.Table(stack, "GlobalChartflowData", {
      fields: {
        pk: "string",
        sk: "string",
        gsi1pk: "string",
        gsi1sk: "string",
      },
      primaryIndex: { partitionKey: "pk", sortKey: "sk" },
      globalIndexes: {
        "GSI1": { partitionKey: "gsi1pk", sortKey: "gsi1sk" },
      },
      stream: true,
      consumers: {
        dynamodbstream: {
          function: {
            handler: "src/lambda.root",
            environment: {
              STAGE: rootStage,
            },
            permissions: [new iam.PolicyStatement({
              actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
              resources: ["*"],
            })]
          }
        }
      },
      cdk: {
        table:
        {
          replicationRegions: replicationRegions,
        }
      }

    })
  }
  else {
    const tableArn = `arn:aws:dynamodb:${app.region}:112245769880:table/${rootStage}-chartflow-GlobalChartflowData`
    const tableStreamArn = `${tableArn}stream/xxxx`
    table = new sst.Table(stack, "GlobalChartflowData", {
      cdk: {
        table: dynamodb.Table.fromTableAttributes(stack, "ImportedTable", {
          tableArn,
          tableStreamArn,
        }),
      }
    });
    table.addConsumers(stack, {
      dynamodbstream: {
        function: {
          handler: "src/lambda.root",
          environment: {
            STAGE: rootStage,
          },
          permissions: [new iam.PolicyStatement({
            actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
            resources: ["*"],
          })]
        }
      }
    })
  }

  stack.addOutputs({
    TableArn: table.tableArn,
  });
}