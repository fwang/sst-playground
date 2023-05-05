//import AWS from "aws-sdk";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Config } from "sst/node/config";
import { Bucket } from "sst/node/bucket";
import { Function } from "sst/node/function";

export const main: APIGatewayProxyHandlerV2 = async (event, context) => {
  console.log("node/Config", Config);
  console.log("node/Bucket", Bucket);
  console.log("node/Function", Function);
  console.log({ event });
  // console.log("Config.APP (default)", Config.APP);
  // console.log("Config.STAGE (default)", Config.STAGE);
  // console.log("Config.STRIPE_KEY (secret)", Config.STRIPE_KEY);
  // console.log("Config.TWILIO_KEY (secret)", Config.TWILIO_KEY);
  // console.log("Config.USER_POOL_ID (parameter)", Config.USER_POOL_ID);

  //  console.log((await new AWS.RDSDataService().executeStatement({
  //    secretArn: RDS.Rds.secretArn,
  //    database: RDS.Rds.defaultDatabaseName,
  //    resourceArn: RDS.Rds.clusterArn,
  //    sql: "SELECT 1",
  //  }).promise()).$response.data);

  return {
    statusCode: 200,
    //body: `Hello world. The time is ${new Date().toISOString()}`,
    body: `This is my API!`,
  };
};
