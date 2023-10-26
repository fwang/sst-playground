import { use, Job, Function, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function JobStack({ app, stack }: StackContext) {
  const { f, STRIPE_KEY } = use(SecretsStack);
  const job = new Job(stack, "myJob", {
    architecture: "arm_64",
    handler: "src/job/job.handler",
    bind: [f, STRIPE_KEY],
    permissions: ["ssm"],
    memorySize: "3 GB",
    timeout: "2 hours",
    logRetention: "three_days",
  });
  const fn = new Function(stack, "myJobCaller", {
    handler: "src/job/caller.handler",
    timeout: "10 seconds",
    bind: [job],
    url: true,
  });

  stack.addOutputs({
    JobCallerUrl: fn.url,
  });
}
