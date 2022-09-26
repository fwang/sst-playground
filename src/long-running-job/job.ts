import { Config } from "@serverless-stack/node/config";
import { JobHandler } from "@serverless-stack/node/job";

declare module "@serverless-stack/node/job" {
  export interface JobTypes {
    LongJob: {
      foo: string;
    };
  }
}

export const main = JobHandler("LongJob", async (event) => {
  console.log("Running long running job")
  console.log("== event ==")
  console.log(event);
  console.log("== Config ==")
  console.log(Config);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  return "done";
});