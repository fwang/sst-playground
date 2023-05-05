import { use, AstroSite, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function AstroEdgeStack({ app, stack }: StackContext) {
  if (app.mode === "dev") throw new Error("Do not `sst dev` live sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);
  const site = new AstroSite(stack, "web", {
    path: "sites/astro-edge",
    edge: true,
    bind: [f, STRIPE_KEY],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    SiteURL: site.url || "localhost",
  });
}
