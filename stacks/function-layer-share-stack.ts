import * as sst from "@serverless-stack/resources"
import FunctionLayerStack from "./function-layer-stack"

export default function FunctionLayerShareStack({ stack }: sst.StackContext) {

  const { layer } = sst.use(FunctionLayerStack)

  stack.addDefaultFunctionLayers([layer])

  // Create Api with custom domain
  new sst.Function(stack, "Fn", {
    handler: "src/lambda.root",
    bundle: {
      externalModules: ["layer"]
    }
  });
}
