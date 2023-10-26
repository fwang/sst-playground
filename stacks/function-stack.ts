import { use, StackContext, Api, Table, Function } from "sst/constructs";

export default function FunctionStack({ app, stack }: StackContext) {
  const nodeFn = new Function(stack, "nodeFunction", {
    runtime: "nodejs18.x",
    handler: "src/lambda.main",
    //nodejs: {
    //  install: ["uuid"],
    //},
    url: true,
  });

  const pythonFn = new Function(stack, "pythonFunction", {
    runtime: "python3.9",
    handler: "src/lambda-python/handler.handler",
    url: true,
  });

  stack.addOutputs({
    nodeUrl: nodeFn.url,
    pythonUrl: pythonFn.url,
  });
}
