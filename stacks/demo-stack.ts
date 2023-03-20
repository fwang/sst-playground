import { StackContext, AstroSite, Function, Config } from "sst/constructs";
import { Role } from "aws-cdk-lib/aws-iam";

export default function DemoStack({ app, stack }: StackContext) {
  const f = new Function(stack, "myFunction", {
    handler: "src/demo/lambda.main",
    runtime: "nodejs18.x",
    bind: [new Config.Secret(stack, "mySTRIPE")],
    url: true,
  });
  const s = new Config.Secret(stack, "DemoSecret");

  new AstroSite(stack, "demo-site", {
    path: "sites/astro",
    bind: [f, s],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
  });

  stack.addOutputs({
    myFunction: f.functionName,
    MY_AUTH: "abcd",
  });

  return { f };
}
