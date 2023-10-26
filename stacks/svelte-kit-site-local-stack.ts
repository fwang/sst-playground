import { use, Api, SvelteKitSite, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";
import { HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Fn } from "aws-cdk-lib";

export default function SvelteKitLocalStack({ app, stack }: StackContext) {
  if (app.mode === "deploy")
    throw new Error("Do not `sst deploy` local sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);

  const api = new Api(stack, "MyApi");

  const site = new SvelteKitSite(stack, "local", {
    edge: true,
    path: "sites/svelte",
    bind: [f, STRIPE_KEY],
    environment: {
      FUNCTION_NAME: f.functionName,
      PUBLIC_FUNCTION_NAME: f.functionName,
    },
    cdk: {
      distribution: {
        defaultBehavior: {
          origin: new HttpOrigin(Fn.parseDomainName(api.url)),
        },
      },
    },
  });

  api.addRoutes(stack, {
    "ANY /{proxy+}": {
      type: "function",
      cdk: {
        function: site.cdk.function,
      },
    },
  });

  stack.addOutputs({
    SiteURL: site.url,
  });
}
