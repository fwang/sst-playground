import { use, NextjsSite, StackContext } from "sst/constructs";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import SecretsStack from "./secrets-stack";

export default function Nextjs13EdgeStack({ app, stack }: StackContext) {
  if (app.mode === "dev") throw new Error("Do not `sst dev` live sites.");

  const { f, STRIPE_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } =
    use(SecretsStack);
  const site = new NextjsSite(stack, "edge", {
    edge: true,
    path: "sites/nextjs13",
    logging: "per-route",
    //buildCommand: "OPEN_NEXT_DEBUG=true pnpm local:build",
    //buildCommand:
    //  "NODE_OPTIONS=--max-old-space-size=512 npx --yes open-next@2.2.3 build",
    bind: [f, STRIPE_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET],
    environment: {
      API_URL: "sst.dev",
      NEXT_PUBLIC_API_URL: "sst.dev",
      NEXT_PUBLIC_FNAME: f.functionName,
      NEXTAUTH_SECRET: "random",
      NEXTAUTH_URL: "https://d2ow0chu9rzoy7.cloudfront.net",
    },
  });

  stack.addOutputs({
    SiteURL: site.url,
  });

  return { site };
}
