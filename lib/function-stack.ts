import { use, StackContext, Api, Table, Function } from "@serverless-stack/resources";

export default function FunctionStack({ app, stack }: StackContext) {
  const worker = new Function(stack, "worker", {
    handler: "src/test-warming/worker.main",
  });

  const warmer = new Function(stack, "warmer", {
    handler: "src/test-warming/warmer.main",
    bind: [worker],
  });

  stack.addOutputs({
    workerName: worker.functionName,
    warmerName: warmer.functionName,
  })
}