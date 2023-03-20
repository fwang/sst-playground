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
      consumerA: {
        function: "src/lambda.main",
        filters: [{
          awsRegion: ["us-east-1"],
"dynamodb": {
  "StreamViewType": ["NEW_AND_OLD_IMAGES"],
}
        }]
      },
    },
  });

  stack.addOutputs({
    TableArn: table.tableArn,
  });
}
