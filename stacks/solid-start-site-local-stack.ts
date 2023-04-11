import { Config, Function, SolidStartSite, StackContext } from "sst/constructs";

export default function SolidStartLocalStack({ stack }: StackContext) {
  const f = new Function(stack, "SolidLocalDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "SolidLocalDummySecret");

  const site = new SolidStartSite(stack, "local", {
    path: "sites/solid-start",
    bind: [f, s],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    SiteURL: site.url,
  });
}
