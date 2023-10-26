import { use, Function, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function FunctionContainerPython({ stack }: StackContext) {
  const { f, STRIPE_KEY } = use(SecretsStack);

  const fn = new Function(stack, "ContainerPythonFunction", {
    runtime: "container",
    handler: "src/lambda-container-python",
    bind: [f, STRIPE_KEY],
    environment: {
      DYNAMODB_TABLE: "hi",
    },
    url: true,
  });

  stack.addOutputs({
    nodeUrl: fn.url,
  });
}
