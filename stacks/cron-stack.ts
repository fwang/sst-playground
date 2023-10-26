import { RuleTargetInput } from "aws-cdk-lib/aws-events";
import { Cron, StackContext } from "sst/constructs";

export default function CronStack({ app, stack }: StackContext) {
  new Cron(stack, "CronWithoutEvent", {
    schedule: "rate(1 minute)",
    job: "src/lambda.main",
  });

  new Cron(stack, "CronWithEvent", {
    schedule: "rate(1 minute)",
    job: {
      function: "src/lambda.main",
      cdk: {
        target: {
          event: RuleTargetInput.fromObject({
            name: "abc",
          }),
        },
      },
    },
  });
}
