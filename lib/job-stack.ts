import { use, Function, Job, StackContext } from "@serverless-stack/resources";
import SecretsStack from "./secrets-stack";

export default function JobStack({ app, stack }: StackContext) {
  const { STRIPE_KEY, TWILIO_KEY } = use(SecretsStack);

  const job = new Job(stack, "LongJob", {
    handler: "src/long-running-job/job.main",
    config: [STRIPE_KEY, TWILIO_KEY],
    permissions: ["ssm"],
    memorySize: "7 GB",
    timeout: "2 hours",
  });

  new Function(stack, "fn", {
    handler: "src/long-running-job/lambda.main",
    permissions: [job],
  });
}