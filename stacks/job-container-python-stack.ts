import { use, Job, Function, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function JobContainerPythonStack({ app, stack }: StackContext) {
  const { f, STRIPE_KEY } = use(SecretsStack);
  const job = new Job(stack, "myContainerPythonJob", {
    runtime: "container",
    handler: "src/job-container-python",
    container: {
      docker: {
        cmd: ["python", "/var/task/handler.py"],
      },
    },
    bind: [f, STRIPE_KEY],
    permissions: ["ssm"],
    memorySize: "7 GB",
    timeout: "2 hours",
    logRetention: "three_days",
  });
  const fn = new Function(stack, "myContainerPythonJobCaller", {
    handler: "src/job-container-python/caller.handler",
    timeout: "5 seconds",
    bind: [job],
    url: true,
  });

  stack.addOutputs({
    JobCallerUrl: fn.url,
  });
}
