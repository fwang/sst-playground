import { RemovalPolicy } from "aws-cdk-lib";
import * as sst from "@serverless-stack/resources";

export default function TableStack({ stack }: sst.StackContext) {
  const table = new sst.Table(stack, "Table", {
    fields: {
      userId: "string",
      noteId: "string",
    },
    primaryIndex: { partitionKey: "userId" },
    globalIndexes: {
      niIndex: { partitionKey: "noteId" },
      niUiIndex: { partitionKey: "noteId", sortKey: "userId" },
    },
    cdk: {
      table: {
        removalPolicy: RemovalPolicy.DESTROY,
        timeToLiveAttribute: 'ttl',
      }
    },
    defaults: {
      function: {
        timeout: 3,
      }
    },
    stream: true,
    consumers: {
      consumerA: "src/lambda.main",
    },
  });

  stack.addOutputs({
    TableArn: table.tableArn,
  });
}
