import { Duration } from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import {
  Cluster,
  FargateTaskDefinition,
  AwsLogDriver,
  ContainerImage,
} from "aws-cdk-lib/aws-ecs";
import { LogGroup, LogRetention, RetentionDays } from "aws-cdk-lib/aws-logs";
import { DockerImageFunction, DockerImageCode } from "aws-cdk-lib/aws-lambda";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { use, StackContext } from "sst/constructs";

export default function FunctionContainerNode({ stack }: StackContext) {
  const fn = new DockerImageFunction(stack, "ContainerImageFunction", {
    memorySize: 8192,
    timeout: Duration.minutes(15),
    code: DockerImageCode.fromEcr(
      Repository.fromRepositoryName(stack, "ContainerImageRepository", "build"),
      {
        tagOrDigest: "aws-codebuild-standard-6.0-22.10.27",
        cmd: ["echo", "hello"],
      }
    ),
  });

  createFargateTask();

  stack.addOutputs({
    FunctionName: fn.functionName,
  });

  function createFargateTask() {
    const vpc = Vpc.fromLookup(stack, "Vpc", {
      // seed-staging
      vpcId: "vpc-0efd416647a9a4b41",
    });

    const logGroup = new LogRetention(stack, "LogRetention", {
      logGroupName: `/sst/service/seed-fargate-test`,
      retention: RetentionDays.INFINITE,
      logRetentionRetryOptions: {
        maxRetries: 100,
      },
    });

    const cluster = new Cluster(stack, "Cluster", {
      clusterName: "seed-fargate-test",
      vpc,
    });

    const taskDefinition = new FargateTaskDefinition(stack, `TaskDefinition`, {
      memoryLimitMiB: 8192,
      cpu: 4096,
    });

    const container = taskDefinition.addContainer("Container", {
      logging: new AwsLogDriver({
        logGroup: LogGroup.fromLogGroupArn(
          stack,
          "LogGroup",
          logGroup.logGroupArn
        ),
        streamPrefix: "service",
      }),
      image: ContainerImage.fromEcrRepository(
        Repository.fromRepositoryName(stack, "Repository", "build"),
        "aws-codebuild-standard-6.0-22.10.27"
      ),
    });

    return { cluster, taskDefinition, container };
  }
}
