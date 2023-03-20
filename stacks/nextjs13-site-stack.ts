import { Function, Config, NextjsSite, StackContext } from "sst/constructs";
import { Architecture } from "aws-cdk-lib/aws-lambda";

export default function Nextjs13Stack({ app, stack }: StackContext) {
  const f = new Function(stack, "NextjsRegionalDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "NextjsRegionalDummySecret");

  const site = new NextjsSite(stack, "regional", {
    path: "sites/nextjs13",
    customDomain: {
      domainName: "next.sst.sh",
      domainAlias: "www.next.sst.sh",
      hostedZone: "sst.sh",
    },
    //buildCommand: "echo hi",
    //buildCommand: "pnpm open-next build",
    //buildCommand: "npx open-next@0.0.0-20230201225157 build",
    bind: [f, s],
    environment: {
      //API_URL: api.url,
      //NEXT_PUBLIC_API_URL: api.url,
      API_URL: "sst.dev",
      NEXT_PUBLIC_API_URL: "sst.dev",
      NEXT_PUBLIC_FNAME: f.functionName,
      NEXTAUTH_SECRET: "random",
      ...(app.mode === "deploy"
        ? {
            NEXTAUTH_URL: "https://d3vpr15yt72y4k.cloudfront.net",
            GITHUB_CLIENT_ID: "d4224260e10b92e138d4",
            GITHUB_CLIENT_SECRET: "f7ef63207fadc1dfb727f7b3d0c92b9951556208",
          }
        : {
            GITHUB_CLIENT_ID: "fb7dc379daabe8b31e88",
            GITHUB_CLIENT_SECRET: "aa604e43958aff6c586841cf5d0b60bb2bf57cbd",
          }),
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
