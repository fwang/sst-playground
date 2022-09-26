import { Job } from "@serverless-stack/node/job";

export const main = async () => {
  console.log("all i'm doing is running this Job")
  await Job.run("LongJob");

}