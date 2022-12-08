//import AWS from "aws-sdk";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Config } from "@serverless-stack/node/config";

export const main: APIGatewayProxyHandlerV2 = async (event, context) => {
  console.log(event)
  //console.log("Config", Config);
  //console.log("Config.APP (default)", Config.APP);
  //console.log("Config.STAGE (default)", Config.STAGE);
  //console.log("Config.STRIPE_KEY (secret)", Config.STRIPE_KEY);
  //console.log("Config.TWILIO_KEY (secret)", Config.TWILIO_KEY);
  //console.log("Config.USER_POOL_ID (parameter)", Config.USER_POOL_ID);

  //  console.log((await new AWS.RDSDataService().executeStatement({
  //    secretArn: RDS.Rds.secretArn,
  //    database: RDS.Rds.defaultDatabaseName,
  //    resourceArn: RDS.Rds.clusterArn,
  //    sql: "SELECT 1",
  //  }).promise()).$response.data);


  return {
    statusCode: 200,
    body: "hello",
  };
}