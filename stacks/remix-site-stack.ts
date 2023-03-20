import { Config, Function, StackContext, RemixSite } from "sst/constructs";

export default function RemixStack({ stack }: StackContext) {
  const f = new Function(stack, "RemixRegionalDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "RemixRegionalDummySecret");

  const site = new RemixSite(stack, "regional", {
    path: "sites/remix",
    bind: [f, s],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    site: site.url || "localhost",
  });

  return { site };
}
