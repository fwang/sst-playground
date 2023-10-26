import { Fn } from "aws-cdk-lib";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { use, Api, StackContext, RemixSite } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function RemixStack({ app, stack }: StackContext) {
  if (app.mode === "dev") throw new Error("Do not `sst dev` live sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);

  //const api = new Api(stack, "Api");

  const site = new RemixSite(stack, "regional", {
    path: "sites/remix1",
    bind: [f, STRIPE_KEY],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
    //cdk: {
    //  distribution: {
    //    defaultBehavior: {
    //      origin: new origins.HttpOrigin(Fn.parseDomainName(api.url)),
    //    },
    //  },
    //},
  });

  //api.addRoutes(stack, {
  //  "ANY /{proxy+}": {
  //    type: "function",
  //    cdk: {
  //      function: site.cdk?.function,
  //    },
  //  },
  //});

  stack.addOutputs({
    site: site.url,
  });

  return { site };
}
