import { Config } from "@serverless-stack/node/config";
import { Job } from "@serverless-stack/node/job";

export const main = async () => {
  console.log("all i'm doing is running the Job")
  await Job.run({
    jobName: Config.LONG_JOB_NAME,
    payload: {
      foo: "bar",
    },
  });
}