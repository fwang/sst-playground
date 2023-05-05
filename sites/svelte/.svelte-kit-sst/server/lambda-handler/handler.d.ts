import type { APIGatewayProxyEventV2, APIGatewayProxyEvent, CloudFrontRequestEvent } from "aws-lambda";
export declare function handler(event: APIGatewayProxyEventV2 | CloudFrontRequestEvent | APIGatewayProxyEvent): Promise<{
    statusCode: number;
} | import("aws-lambda").APIGatewayProxyResultV2<never> | import("aws-lambda").CloudFrontRequestResult>;
