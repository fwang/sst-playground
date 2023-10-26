import { use, Service, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";
import VpcStack from "./vpc-stack";

export default function ServiceLocalStack({ app, stack }: StackContext) {
  if (app.mode === "deploy")
    throw new Error("Do not `sst deploy` local sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);
  const { vpc } = use(VpcStack);

  const service = new Service(stack, "MyLocalService", {
    path: "src/service-node",
    cpu: "0.25 vCPU",
    memory: "1 GB",
    customDomain: {
      domainName: "next-service.sst.sh",
      hostedZone: "sst.sh",
    },
    dev: {
      url: "http://localhost:3000",
    },
    bind: [f, STRIPE_KEY],
    environment: {
      DYNAMODB_TABLE: "hi",
    },
    cdk: {
      vpc,
    },
  });

  stack.addOutputs({
    ServiceURL: service.url,
  });
}
