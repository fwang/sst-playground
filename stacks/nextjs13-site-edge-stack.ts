import { use, NextjsSite, StackContext } from "sst/constructs";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import SecretsStack from "./secrets-stack";

export default function Nextjs13EdgeStack({ app, stack }: StackContext) {
  if (app.mode === "dev") throw new Error("Do not `sst dev` live sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);
  const site = new NextjsSite(stack, "edge", {
    edge: true,
    path: "sites/nextjs13",
    buildCommand: "OPEN_NEXT_DEBUG=true pnpm open-next-local:build",
    bind: [f, STRIPE_KEY],
    environment: {
      API_URL: "sst.dev",
      NEXT_PUBLIC_API_URL: "sst.dev",
      NEXT_PUBLIC_FNAME: f.functionName,
      NEXTAUTH_SECRET: "random",
      NEXTAUTH_URL: "https://d2ow0chu9rzoy7.cloudfront.net",
      GITHUB_CLIENT_ID: "04349be62fa3b4ba1b94",
      GITHUB_CLIENT_SECRET: "cc13897ffb99d82adaa440b0f5227439f39b4977",
    },
    cdk: {
      server: {
        architecture: Architecture.ARM_64,
      },
    },
  });

  stack.addOutputs({
    SiteURL: site.url,
  });

  return { site };
}
