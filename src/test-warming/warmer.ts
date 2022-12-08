import AWS from "aws-sdk";
import { Function } from "@serverless-stack/node/function";
const lambda = new AWS.Lambda();

export const main = async (event, context) => {
  const promises = [];
  for (let i = 0; i < event.count || 10; i++) {
    const p = lambda.invokeAsync({
      FunctionName: Function.worker.functionName,
      InvokeArgs: JSON.stringify({}),
    }).promise();
    promises.push(p);
  }

  await Promise.all(promises);

  return "done";
}