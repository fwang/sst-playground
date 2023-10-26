import { use, SvelteKitSite, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function SvelteKitStack({ app, stack }: StackContext) {
  if (app.mode === "dev") throw new Error("Do not `sst dev` live sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);

  const site = new SvelteKitSite(stack, "regional", {
    path: "sites/svelte",
    bind: [f, STRIPE_KEY],
    environment: {
      FUNCTION_NAME: f.functionName,
      PUBLIC_FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    SiteURL: site.url,
  });
}
