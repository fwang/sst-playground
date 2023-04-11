import { use, AstroSite, Config, Function, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function AstroEdgeStack({ stack }: StackContext) {
  const { STRIPE_KEY } = use(SecretsStack);
  const f = new Function(stack, "AstroEdgeDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "AstroEdgeDummySecret");

  const site = new AstroSite(stack, "web", {
    path: "sites/astro-edge",
    edge: true,
    bind: [f, s, STRIPE_KEY],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    SiteURL: site.url || "localhost",
  });
}
