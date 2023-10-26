import { StackContext, Function } from "sst/constructs";

export default function FunctionJavaStack({ app, stack }: StackContext) {
  const fn = new Function(stack, "java8Function", {
    runtime: "java8",
    handler: "example.Handler::handleRequest",
    url: true,
  });

  stack.addOutputs({
    fnUrl: fn.url,
  });
}
