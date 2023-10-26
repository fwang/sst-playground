import { use, StackContext, RemixSite } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function RemixEdgeStack({ app, stack }: StackContext) {
  if (app.mode === "dev") throw new Error("Do not `sst dev` live sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);
  const site = new RemixSite(stack, "edge", {
    path: "sites/remix1",
    edge: true,
    bind: [f, STRIPE_KEY],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    site: site.url,
  });

  return { site };
}
