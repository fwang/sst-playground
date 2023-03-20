import { Config, Function, SolidStartSite, StackContext } from "sst/constructs";

export default function SolidStartStack({ stack }: StackContext) {
  const f = new Function(stack, "SolidRegionalDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "SolidRegionalDummySecret");

  const site = new SolidStartSite(stack, "regional", {
    path: "sites/solid-start",
    bind: [f, s],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    SiteURL: site.url || "localhost",
  });
}
