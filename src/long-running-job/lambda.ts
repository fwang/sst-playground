import { Job } from "sst/node/job";
import { Config } from "sst/node/config";

export const main = async () => {
  console.log("all i'm doing is running this Job")
  console.log("Config.APP (default)", Config.APP);
  console.log("Config.STAGE (default)", Config.STAGE);
  console.log("Config.STRIPE_KEY (secret)", Config.STRIPE_KEY);
  console.log("Config.TWILIO_KEY (secret)", Config.TWILIO_KEY);

  await Job.LongJob.run({
    payload: {
      foo: "bar",
    },
  });
}