import { use, Function, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function FunctionContainerNode({ stack }: StackContext) {
  const { f, STRIPE_KEY } = use(SecretsStack);

  const fn = new Function(stack, "ContainerNodeFunction", {
    runtime: "container",
    handler: "src/lambda-container-nodejs",
    bind: [f, STRIPE_KEY],
    environment: {
      DYNAMODB_TABLE: "hi",
    },
    url: true,
    container: {
      file: "Dockerfiles/Dockerfile.lambda",
      buildArgs: {
        NODE_VERSION: "18",
      },
    },
  });

  stack.addOutputs({
    nodeUrl: fn.url,
  });
}
