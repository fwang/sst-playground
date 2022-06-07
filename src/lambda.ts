import { APIGatewayProxyResult } from "aws-lambda";

export async function root(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  return {
    statusCode: 200,
    body: "root",
  };
}

export async function leaf(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  return {
    statusCode: 200,
    body: "leaf",
  };
}

export async function main(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  //console.log(event.requestContext.http.path);
  return {
    statusCode: 200,
    body: "$default",
  };
}
