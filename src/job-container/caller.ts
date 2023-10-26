import { Job } from "sst/node/job";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

export const handler = async (event: APIGatewayProxyEventV2) => {
  const { cancelJobId } = event.queryStringParameters || {};

  // Cancel Job
  if (cancelJobId) {
    await Job.myContainerJob.cancel(cancelJobId);
    return;
  }

  // Run Job
  console.log("all i'm doing is running this Job");
  const ret = await Job.myContainerJob.run({
    payload: {
      foo: "bar",
    },
  });
  return {
    statusCode: 200,
    body: JSON.stringify({
      ...ret,
      cancelUrl:
        "https://" +
        event.headers["host"] +
        event.rawPath +
        "?cancelJobId=" +
        ret.jobId,
    }),
  };
};
