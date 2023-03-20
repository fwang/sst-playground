import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sst from "@serverless-stack/resources";

export default function ContainerFunction({ stack }: sst.StackContext) {
  new lambda.DockerImageFunction(stack, 'DockerFunction', {
    functionName: "listMovieFunction",
    code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, "../src/lambda-docker"), {
      cmd: [ "list.list" ],
      entrypoint: ["/lambda-entrypoint.sh"],
    }),
    environment: {
      DYNAMODB_TABLE: "hi",
    },
  });
}
