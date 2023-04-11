import { AstroSite, Config, Function, StackContext } from "sst/constructs";

export default function AstroLocalStack({ stack }: StackContext) {
  const f = new Function(stack, "AstroLocalDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "AstroLocalDummySecret");

  const site = new AstroSite(stack, "local", {
    path: "sites/astro",
    bind: [f, s],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    SiteURL: site.url,
    Site2: "abc",
  });
}
