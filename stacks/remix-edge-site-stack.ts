import { Config, Function, StackContext, RemixSite } from "sst/constructs";

export default function RemixEdgeStack({ stack }: StackContext) {
  const f = new Function(stack, "RemixEdgeDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "RemixEdgeDummySecret");

  const site = new RemixSite(stack, "edge", {
    path: "sites/remix-edge",
    edge: true,
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
