import { AstroSite, Config, Function, StackContext } from "sst/constructs";

export default function AstroEdgeStack({ stack }: StackContext) {
  const f = new Function(stack, "AstroEdgeDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "AstroEdgeDummySecret");

  const site = new AstroSite(stack, "web", {
    path: "sites/astro-edge",
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
