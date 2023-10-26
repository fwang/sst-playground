import { StackContext, Function } from "sst/constructs";

export default function FunctionRustStack({ app, stack }: StackContext) {
  const fn = new Function(stack, "rustFunction", {
    runtime: "rust",
    handler: "src/lambda-rust/src/main.rs",
    url: true,
  });

  stack.addOutputs({
    fnUrl: fn.url,
  });
}
