import { debug } from "./logger.js";
export function isAPIGatewayProxyEventV2(event) {
    return event.version === "2.0";
}
export function isAPIGatewayProxyEvent(event) {
    return event.version === undefined && !isCloudFrontRequestEvent(event);
}
export function isCloudFrontRequestEvent(event) {
    return event.Records !== undefined;
}
export function convertFrom(event) {
    if (isCloudFrontRequestEvent(event)) {
        return convertFromCloudFrontRequestEvent(event);
    }
    else if (isAPIGatewayProxyEventV2(event)) {
        return convertFromAPIGatewayProxyEventV2(event);
    }
    else if (isAPIGatewayProxyEvent(event)) {
        return convertFromAPIGatewayProxyEvent(event);
    }
    throw new Error("Unsupported event type");
}
export function convertTo(result) {
    if (result.type === "v2") {
        return convertToApiGatewayProxyResultV2(result);
    }
    else if (result.type === "v1") {
        return convertToApiGatewayProxyResult(result);
    }
    else if (result.type === "cf") {
        return convertToCloudFrontRequestResult(result);
    }
    throw new Error("Unsupported event type");
}
function convertFromAPIGatewayProxyEvent(event) {
    const { path, body, httpMethod, requestContext, isBase64Encoded } = event;
    return {
        type: "v1",
        method: httpMethod,
        rawPath: path,
        url: path + normalizeAPIGatewayProxyEventQueryParams(event),
        body: Buffer.from(body ?? "", isBase64Encoded ? "base64" : "utf8"),
        headers: normalizeAPIGatewayProxyEventHeaders(event),
        remoteAddress: requestContext.identity.sourceIp,
    };
}
function convertFromAPIGatewayProxyEventV2(event) {
    const { rawPath, rawQueryString, requestContext } = event;
    return {
        type: "v2",
        method: requestContext.http.method,
        rawPath,
        url: rawPath + (rawQueryString ? `?${rawQueryString}` : ""),
        body: normalizeAPIGatewayProxyEventV2Body(event),
        headers: normalizeAPIGatewayProxyEventV2Headers(event),
        remoteAddress: requestContext.http.sourceIp,
    };
}
function convertFromCloudFrontRequestEvent(event) {
    const { method, uri, querystring, body, headers, clientIp } = event.Records[0].cf.request;
    return {
        type: "cf",
        method,
        rawPath: uri,
        url: uri + (querystring ? `?${querystring}` : ""),
        body: Buffer.from(body?.data ?? "", body?.encoding === "base64" ? "base64" : "utf8"),
        headers: normalizeCloudFrontRequestEventHeaders(headers),
        remoteAddress: clientIp,
    };
}
function convertToApiGatewayProxyResult(result) {
    const headers = {};
    const multiValueHeaders = {};
    Object.entries(result.headers).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            multiValueHeaders[key] = value;
        }
        else {
            if (value === null) {
                headers[key] = "";
                return;
            }
            headers[key] = value;
        }
    });
    const response = {
        statusCode: result.statusCode,
        headers,
        body: result.body,
        isBase64Encoded: result.isBase64Encoded,
        multiValueHeaders,
    };
    debug(response);
    return response;
}
function convertToApiGatewayProxyResultV2(result) {
    const headers = {};
    Object.entries(result.headers)
        .filter(([key]) => key.toLowerCase() !== "set-cookie")
        .forEach(([key, value]) => {
        if (value === null) {
            headers[key] = "";
            return;
        }
        headers[key] = Array.isArray(value) ? value.join(", ") : value.toString();
    });
    const response = {
        statusCode: result.statusCode,
        headers,
        cookies: result.headers["set-cookie"],
        body: result.body,
        isBase64Encoded: result.isBase64Encoded,
    };
    debug(response);
    return response;
}
function convertToCloudFrontRequestResult(result) {
    const headers = {};
    Object.entries(result.headers)
        .filter(([key]) => key.toLowerCase() !== "content-length")
        .forEach(([key, value]) => {
        headers[key] = [
            ...(headers[key] || []),
            ...(Array.isArray(value)
                ? value.map((v) => ({ key, value: v }))
                : [{ key, value: value.toString() }]),
        ];
    });
    const response = {
        status: result.statusCode.toString(),
        statusDescription: "OK",
        headers,
        bodyEncoding: result.isBase64Encoded ? "base64" : "text",
        body: result.body,
    };
    debug(response);
    return response;
}
function normalizeAPIGatewayProxyEventV2Headers(event) {
    const { headers: rawHeaders, cookies } = event;
    const headers = {};
    if (Array.isArray(cookies)) {
        headers["cookie"] = cookies.join("; ");
    }
    for (const [key, value] of Object.entries(rawHeaders || {})) {
        headers[key.toLowerCase()] = value;
    }
    return headers;
}
function normalizeAPIGatewayProxyEventV2Body(event) {
    const { body, isBase64Encoded } = event;
    if (Buffer.isBuffer(body)) {
        return body;
    }
    else if (typeof body === "string") {
        return Buffer.from(body, isBase64Encoded ? "base64" : "utf8");
    }
    else if (typeof body === "object") {
        return Buffer.from(JSON.stringify(body));
    }
    return Buffer.from("", "utf8");
}
function normalizeAPIGatewayProxyEventQueryParams(event) {
    const params = new URLSearchParams();
    if (event.multiValueQueryStringParameters) {
        for (const [key, value] of Object.entries(event.multiValueQueryStringParameters)) {
            if (value !== undefined) {
                for (const v of value) {
                    params.append(key, v);
                }
            }
        }
    }
    if (event.queryStringParameters) {
        for (const [key, value] of Object.entries(event.queryStringParameters)) {
            if (value !== undefined) {
                params.append(key, value);
            }
        }
    }
    const value = params.toString();
    return value ? `?${value}` : "";
}
function normalizeAPIGatewayProxyEventHeaders(event) {
    event.multiValueHeaders;
    const headers = {};
    for (const [key, values] of Object.entries(event.multiValueHeaders)) {
        if (values) {
            headers[key.toLowerCase()] = values.join(",");
        }
    }
    for (const [key, value] of Object.entries(event.headers)) {
        if (value) {
            headers[key.toLowerCase()] = value;
        }
    }
    return headers;
}
function normalizeCloudFrontRequestEventHeaders(rawHeaders) {
    const headers = {};
    for (const [key, values] of Object.entries(rawHeaders)) {
        for (const { value } of values) {
            if (value) {
                headers[key.toLowerCase()] = value;
            }
        }
    }
    return headers;
}
