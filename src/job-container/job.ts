import { Config } from "sst/node/config";
import { JobHandler } from "sst/node/job";

declare module "sst/node/job" {
  export interface JobTypes {
    myContainerJob: {
      foo: string;
    };
  }
}

// @ts-ignore
export const handler = JobHandler("myContainerJob", async (event) => {
  console.log("Running long running job");
  console.log("== event ==");
  console.log(event);
  console.log("== Config ==");
  console.log(Config);
  // @ts-ignore
  console.log("Config.APP (default)", Config.APP);
  // @ts-ignore
  console.log("Config.STAGE (default)", Config.STAGE);
  // @ts-ignore
  console.log("Config.STRIPE_KEY (secret)", Config.STRIPE_KEY);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return "done";
});
