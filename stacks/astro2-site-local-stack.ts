import { use, AstroSite, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function AstroLocalStack({ app, stack }: StackContext) {
  if (app.mode === "deploy")
    throw new Error("Do not `sst deploy` local sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);
  const site = new AstroSite(stack, "local", {
    path: "sites/astro2",
    bind: [f, STRIPE_KEY],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    SiteURL: site.url,
  });
}
