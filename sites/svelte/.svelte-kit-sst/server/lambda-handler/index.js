import fs from "node:fs";
import path from "node:path";
import { installPolyfills } from "@sveltejs/kit/node/polyfills";
// @ts-ignore
import { Server } from "../index.js";
// @ts-ignore
import { manifest } from "../manifest.js";
// @ts-ignore
import prerenderedFiles from "./prerendered-file-list.js";
import { convertFrom, convertTo } from "./event-mapper.js";
import { debug } from "./logger.js";
import { isBinaryContentType } from "./binary.js";
installPolyfills();
const app = new Server(manifest);
await app.init({ env: process.env });
export async function handler(event) {
    debug("event", event);
    // Parse Lambda event
    const internalEvent = convertFrom(event);
    // Set correct host header
    if (internalEvent.headers["x-forwarded-host"]) {
        internalEvent.headers.host = internalEvent.headers["x-forwarded-host"];
    }
    // Check request is for prerendered file
    if (internalEvent.method === "GET") {
        const filePath = isPrerenderedFile(internalEvent.rawPath);
        if (filePath) {
            return internalEvent.type === "cf"
                ? formatCloudFrontPrerenderedResponse(event, filePath)
                : formatAPIGatewayPrerenderedResponse(internalEvent, filePath);
        }
    }
    // Process request
    const requestUrl = `https://${internalEvent.headers.host}${internalEvent.url}`;
    const requestProps = {
        method: internalEvent.method,
        headers: internalEvent.headers,
        body: ["GET", "HEAD"].includes(internalEvent.method)
            ? undefined
            : internalEvent.body,
    };
    debug("request", requestUrl, requestProps);
    const request = new Request(requestUrl, requestProps);
    const response = await app.respond(request, {
        getClientAddress: () => internalEvent.remoteAddress,
    });
    debug("response", response);
    //Parse the response into lambda proxy response
    if (response) {
        const headers = Object.fromEntries(response.headers.entries());
        const isBase64Encoded = isBinaryContentType(Array.isArray(headers["content-type"])
            ? headers["content-type"][0]
            : headers["content-type"]);
        const body = isBase64Encoded
            ? Buffer.from(await response.arrayBuffer()).toString("base64")
            : await response.text();
        return convertTo({
            type: internalEvent.type,
            statusCode: response.status,
            headers,
            isBase64Encoded,
            body,
        });
    }
    return {
        statusCode: 404,
        body: "Not found.",
    };
}
function isPrerenderedFile(uri) {
    // remove leading and trailing slashes
    uri = uri.replace(/^\/|\/$/g, "");
    if (uri === "") {
        return "index.html";
    }
    if (prerenderedFiles.includes(uri)) {
        return uri;
    }
    if (prerenderedFiles.includes(uri + "/index.html")) {
        return uri + "/index.html";
    }
    if (prerenderedFiles.includes(uri + ".html")) {
        return uri + ".html";
    }
}
function formatCloudFrontPrerenderedResponse(event, filePath) {
    const request = event.Records[0].cf.request;
    request.uri = `/${filePath}`;
    return request;
}
function formatAPIGatewayPrerenderedResponse(internalEvent, filePath) {
    return convertTo({
        type: internalEvent.type,
        statusCode: 200,
        headers: {
            "content-type": "text/html",
            "cache-control": "public, max-age=0, s-maxage=31536000, must-revalidate",
        },
        isBase64Encoded: false,
        body: fs.readFileSync(path.join("prerendered", filePath), "utf8"),
    });
}
