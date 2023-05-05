/// <reference types="node" />
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, APIGatewayProxyEvent, APIGatewayProxyResult, CloudFrontRequestEvent, CloudFrontRequestResult } from "aws-lambda";
export type InternalEvent = {
    readonly type: "v1" | "v2" | "cf";
    readonly method: string;
    readonly rawPath: string;
    readonly url: string;
    readonly body: Buffer;
    readonly headers: Record<string, string>;
    readonly remoteAddress: string;
};
type InternalResult = {
    readonly type: "v1" | "v2" | "cf";
    statusCode: number;
    headers: Record<string, string | string[]>;
    body: string;
    isBase64Encoded: boolean;
};
export declare function isAPIGatewayProxyEventV2(event: any): event is APIGatewayProxyEventV2;
export declare function isAPIGatewayProxyEvent(event: any): event is APIGatewayProxyEvent;
export declare function isCloudFrontRequestEvent(event: any): event is CloudFrontRequestEvent;
export declare function convertFrom(event: APIGatewayProxyEventV2 | APIGatewayProxyEvent | CloudFrontRequestEvent): InternalEvent;
export declare function convertTo(result: InternalResult): APIGatewayProxyResultV2 | APIGatewayProxyResult | CloudFrontRequestResult;
export {};
