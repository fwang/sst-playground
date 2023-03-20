import { Config, Function, Job, StackContext } from "sst/constructs";

export default function JobStack({ app, stack }: StackContext) {
  const f = new Function(stack, "JobDummyFunction", {
    handler: "src/lambda.main",
  });
  const s = new Config.Secret(stack, "JobDummySecret");

  const job = new Job(stack, "LongJob", {
    handler: "src/long-running-job/job.main",
    bind: [f, s],
    permissions: ["ssm"],
    memorySize: "7 GB",
    timeout: "2 hours",
    logRetention: "three_days",
  });
}
