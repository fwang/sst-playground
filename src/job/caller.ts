import { Job } from "sst/node/job";
import { Config } from "sst/node/config";

export const handler = async () => {
  console.log("all i'm doing is running this Job");
  const ret = await Job.myJob.run({
    payload: {
      foo: "bar",
    },
  });
  return {
    statusCode: 200,
    body: JSON.stringify(ret),
  };
};
