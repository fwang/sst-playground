import { Job } from "sst/node/job";

export const handler = async () => {
  console.log("all i'm doing is running this Job");
  const ret = await Job.myContainerPythonJob.run({
    payload: {
      num: 25,
    },
  });
  return {
    statusCode: 200,
    body: JSON.stringify(ret),
  };
};
