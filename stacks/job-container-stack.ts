import { use, Job, Function, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function JobContainerStack({ app, stack }: StackContext) {
  const { f, STRIPE_KEY } = use(SecretsStack);
  const job = new Job(stack, "myContainerJob", {
    architecture: "arm_64",
    runtime: "container",
    handler: "src/job-container",
    container: {
      cmd: [
        "/bin/sh",
        "-c",
        //"\"echo 'hello world' && pwd && echo $SST_PAYLOAD && node /tmp/dist/job-wrapper.mjs\"",
        "echo 'hello world' && sleep 10 && pwd && echo $SST_PAYLOAD",
      ],
      file: "Dockerfile",
      buildArgs: {
        BASE_IMAGE: "node:18-bullseye-slim",
      },
    },
    bind: [f, STRIPE_KEY],
    permissions: ["ssm"],
    memorySize: "3 GB",
    timeout: "2 hours",
    logRetention: "three_days",
  });
  const caller = new Function(stack, "myContainerJobCaller", {
    handler: "src/job-container/caller.handler",
    timeout: "5 seconds",
    bind: [job],
    url: true,
  });

  stack.addOutputs({
    JobCallerUrl: caller.url,
  });
}
