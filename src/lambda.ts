import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Config } from "@serverless-stack/node/config";

export const main: APIGatewayProxyHandlerV2 = async (event, context) => {
  console.log(Config);
  console.log(Config.STRIPE_KEY);


  return {
    statusCode: 200,
    body: "hello",
  };
}