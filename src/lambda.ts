import { APIGatewayProxyHandlerV2 } from "aws-lambda";

export const root: APIGatewayProxyHandlerV2 = async (event, context) => {
  return {
    statusCode: 200,
    body: "root",
  };
}

export const leaf: APIGatewayProxyHandlerV2 = async (event, context) => {
  return {
    statusCode: 200,
    body: "leaf",
  };
}

export const main: APIGatewayProxyHandlerV2 = async (event, context) => {
  //console.log(event.requestContext.http.path);
  return {
    statusCode: 200,
    body: "$default",
  };
}
