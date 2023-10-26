import { Vpc } from "aws-cdk-lib/aws-ec2";
import { StackContext } from "sst/constructs";

export default function VpcStack({ stack }: StackContext) {
  const vpc = new Vpc(stack, "VPC", {
    natGateways: 1,
  });
  return { vpc };
}
