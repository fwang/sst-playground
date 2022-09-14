import { use, Config, Function, Job, StackContext } from "@serverless-stack/resources";
import SecretsStack from "./secrets-stack";

export default function JobStack({ app, stack }: StackContext) {
  const { STRIPE_KEY, TWILIO_KEY } = use(SecretsStack);

  const job = new Job(stack, "LongJob", {
    handler: "src/long-running-job.main",
    config: [STRIPE_KEY, TWILIO_KEY],
    permissions: ["ssm"],
  });

  const LONG_JOB_NAME = new Config.Parameter(stack, "LONG_JOB_NAME", {
    value: job.jobName,
  });

  new Function(stack, "fn", {
    handler: "src/job/lambda.main",
    permissions: [job],
    config: [LONG_JOB_NAME],
  });
}