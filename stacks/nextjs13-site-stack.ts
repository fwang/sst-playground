import { use, NextjsSite, StackContext } from "sst/constructs";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import SecretsStack from "./secrets-stack";

export default function Nextjs13Stack({ app, stack }: StackContext) {
  if (app.mode === "dev") throw new Error("Do not `sst dev` live sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);
  const site = new NextjsSite(stack, "regional", {
    path: "sites/nextjs13",
    //buildCommand: "echo hi",
    //buildCommand: "pnpm open-next build",
    //buildCommand: "npx open-next@0.0.0-20230201225157 build",
    //buildCommand: "OPEN_NEXT_DEBUG=true pnpm open-next-local:build",
    customDomain: {
      domainName: "next.sst.sh",
      domainAlias: "www.next.sst.sh",
      hostedZone: "sst.sh",
    },
    bind: [f, STRIPE_KEY],
    environment: {
      API_URL: "sst.dev",
      NEXT_PUBLIC_API_URL: "sst.dev",
      NEXT_PUBLIC_FNAME: f.functionName,
      NEXTAUTH_SECRET: "random",
      NEXTAUTH_URL: "https://d3vpr15yt72y4k.cloudfront.net",
      GITHUB_CLIENT_ID: "d4224260e10b92e138d4",
      GITHUB_CLIENT_SECRET: "f7ef63207fadc1dfb727f7b3d0c92b9951556208",
    },
    cdk: {
      server: {
        architecture: Architecture.ARM_64,
      },
    },
  });

  stack.addOutputs({
    SiteURL: site.url || "localhost",
  });

  return { site };
}
