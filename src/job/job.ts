import { Config } from "sst/node/config";
import { JobHandler } from "sst/node/job";

declare module "sst/node/job" {
  export interface JobTypes {
    myJob: {
      foo: string;
    };
  }
}

export const handler = JobHandler("myJob", async (event) => {
  console.log("Running long running job");
  console.log("== event ==");
  console.log(event);
  console.log("== Config ==");
  console.log(Config);
  console.log("Config.APP (default)", Config.APP);
  console.log("Config.STAGE (default)", Config.STAGE);
  console.log("Config.STRIPE_KEY (secret)", Config.STRIPE_KEY);
  await new Promise((resolve) => setTimeout(resolve, 10000));
  return "done";
});
