import { StackContext, Function, Config } from "sst/constructs";

export default function DemoStack({ app, stack }: StackContext) {

  new Function(stack, "demo", {
    handler: "src/demo/lambda.main",
    bind: [new Config.Secret(stack, "STRIPE")],
  });
}