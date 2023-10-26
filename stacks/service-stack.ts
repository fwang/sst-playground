import { use, Service, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";
import VpcStack from "./vpc-stack";

export default function ServiceStack({ app, stack }: StackContext) {
  if (app.mode === "dev") throw new Error("Do not `sst dev` live sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);
  const { vpc } = use(VpcStack);

  const service = new Service(stack, "MyService", {
    path: "src/service-image",
    build: {
      buildArgs: {
        BASE_IMAGE: "node:18-bullseye-slim",
      },
    },
    //path: "src/service-node",
    architecture: "arm64",
    cpu: "0.25 vCPU",
    memory: "1 GB",
    customDomain: {
      domainName: "service.sst.sh",
      hostedZone: "sst.sh",
    },
    bind: [f, STRIPE_KEY],
    environment: {
      DYNAMODB_TABLE: "hi",
    },
    logRetention: "one_month",
    cdk: {
      vpc,
      applicationLoadBalancer: false,
      cloudfrontDistribution: false,
      //container: {
      //  healthCheck: {
      //    command: ["CMD-SHELL", "curl -f http://localhost/ || exit 1"],
      //  },
      //},
    },
  });

  stack.addOutputs({
    ServiceURL: service.url,
  });
}
