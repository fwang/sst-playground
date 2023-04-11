import { use, AstroSite, Config, Function, StackContext } from "sst/constructs";

export default function AstroStack({ stack }: StackContext) {
  const f = new Function(stack, "AstroRegionalDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "AstroRegionalDummySecret");

  const site = new AstroSite(stack, "regional", {
    path: "sites/astro",
    dev: {
      deploy: true,
    },
    bind: [f, s],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    SiteURL: site.url || "localhost",
  });
}
