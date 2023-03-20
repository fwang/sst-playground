import { Config, Function, SolidStartSite, StackContext } from "sst/constructs";

export default function SolidStartEdgeStack({ stack }: StackContext) {
  const f = new Function(stack, "SolidEdgeDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "SolidEdgeDummySecret");

  const site = new SolidStartSite(stack, "edge", {
    path: "sites/solid-start-edge",
    edge: true,
    bind: [f, s],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    SiteURL: site.url || "localhost",
  });
}
