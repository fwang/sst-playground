import { StackContext, Function, Config } from "sst/constructs";

export default function DemoStack({ app, stack }: StackContext) {
  const f = new Function(stack, "demoFunction", {
    handler: "src/demo/lambda.main",
    runtime: "nodejs18.x",
    bind: [new Config.Secret(stack, "demoSTRIPE")],
    url: true,
  });

  new Function(stack, "demoFunction2", {
    handler: "src/demo/lambda.main",
    bind: [f, new Config.Secret(stack, "demoSTRIPE2")],
  });

  stack.addOutputs({
    myFunction: f.functionName,
  });

  return { f };
}
