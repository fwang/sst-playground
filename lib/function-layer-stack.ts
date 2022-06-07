import * as path from "path"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as sst from "@serverless-stack/resources"

export default function FunctionLayerStack({ stack }: sst.StackContext) {

  const layer = new lambda.LayerVersion(stack, 'InternalLayer', {
    code: lambda.Code.fromAsset(path.resolve("src/layer")),
  });

  stack.addDefaultFunctionLayers([layer])

  // Create Api with custom domain
  new sst.Function(stack, "Fn", {
    handler: "src/lambda.root",
    bundle: {
      externalModules: ["layer"]
    }
  });

  return { layer };
}
