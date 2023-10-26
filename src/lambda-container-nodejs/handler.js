import { Config } from "sst/node/config";
import { Function } from "sst/node/function";

export async function handler(event) {
  console.log("invoked!");
  return {
    statusCode: 200,
    body: JSON.stringify({
      foo: "bar24",
      STRIPE_KEY: Config.STRIPE_KEY,
      FUNCTION_NAME: Function.ConfigFunction.functionName,
    }),
  };
}

export async function handler2(event) {
  return {
    statusCode: 200,
    body: "Hi from handler2",
  };
}
