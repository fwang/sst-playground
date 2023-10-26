import { use, Service, StackContext } from "sst/constructs";
import { ContainerImage } from "aws-cdk-lib/aws-ecs";
import VpcStack from "./vpc-stack";

export default function ServiceImageStack({ app, stack }: StackContext) {
  if (app.mode === "dev") throw new Error("Do not `sst dev` live sites.");

  const { vpc } = use(VpcStack);

  const service = new Service(stack, "MyImageService", {
    architecture: "x86_64",
    cpu: "0.25 vCPU",
    memory: "1 GB",
    cdk: {
      vpc,
      cloudfrontDistribution: false,
      applicationLoadBalancer: false,
      container: {
        image: ContainerImage.fromRegistry(
          "public.ecr.aws/amazonlinux/amazonlinux:latest"
        ),
      },
    },
  });

  service.cdk?.taskDefinition.executionRole?.addManagedPolicy({
    managedPolicyArn:
      "arn:aws:iam::aws:policy/AmazonECSTaskExecutionRolePolicy",
  });

  stack.addOutputs({
    ServiceURL: service.url,
  });
}
