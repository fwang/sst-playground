import { Function, Config, NextjsSite, StackContext } from "sst/constructs";
import { Architecture } from "aws-cdk-lib/aws-lambda";

export default function Nextjs13VercelModeStack({ app, stack }: StackContext) {
  const f = new Function(stack, "NextjsVercelModeDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "NextjsVercelModeDummySecret");

  const site = new NextjsSite(stack, "vercel", {
    path: "sites/nextjs13",
    buildCommand: "OPEN_NEXT_DEBUG=true npx open-next@0.7.0 build",
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
            NEXTAUTH_URL: "https://da1rxfc3u6pmt.cloudfront.net",
            GITHUB_CLIENT_ID: "270ad0c55bdaf0fd790f",
            GITHUB_CLIENT_SECRET: "288c38fb8fe73e3d744590f33f84863075e3401d",
          }
        : {
            GITHUB_CLIENT_ID: "---",
            GITHUB_CLIENT_SECRET: "---",
          }),
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
