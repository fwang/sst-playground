import { use, NextjsSite, StackContext } from "sst/constructs";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import SecretsStack from "./secrets-stack";

export default function Nextjs13LocalStack({ app, stack }: StackContext) {
  if (app.mode === "deploy")
    throw new Error("Do not `sst deploy` local sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);
  const site = new NextjsSite(stack, "local", {
    path: "sites/nextjs13",
    bind: [f, STRIPE_KEY],
    environment: {
      API_URL: "sst.dev",
      NEXT_PUBLIC_API_URL: "sst.dev",
      NEXT_PUBLIC_FNAME: f.functionName,
      NEXTAUTH_SECRET: "random",
      GITHUB_CLIENT_ID: "fb7dc379daabe8b31e88",
      GITHUB_CLIENT_SECRET: "aa604e43958aff6c586841cf5d0b60bb2bf57cbd",
    },
    cdk: {
      server: {
        architecture: Architecture.ARM_64,
      },
    },
  });

  stack.addOutputs({
    site: site.url,
  });

  return { site };
}
