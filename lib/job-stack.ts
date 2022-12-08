import { use, Function, Job, StackContext } from "@serverless-stack/resources";
import SecretsStack from "./secrets-stack";
import ApiStack from "./api-stack";

export default function JobStack({ app, stack }: StackContext) {
  const { STRIPE_KEY, TWILIO_KEY } = use(SecretsStack);
  const { api } = use(ApiStack);

  const job = new Job(stack, "LongJob", {
    handler: "src/long-running-job/job.main",
    bind: [STRIPE_KEY, TWILIO_KEY, api],
    permissions: ["ssm"],
    memorySize: "7 GB",
    timeout: "2 hours",
  });

  new Function(stack, "fn", {
    handler: "src/long-running-job/lambda.main",
    bind: [STRIPE_KEY, TWILIO_KEY, job],
  });
}