import { installPolyfills } from "@sveltejs/kit/node/polyfills";
// @ts-ignore
import { Server } from "../index.js";
// @ts-ignore
import { manifest } from "../manifest.js";
// @ts-ignore
import staticFiles from "./static-file-list.js";
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
    // Check request is for static file
    if (internalEvent.method === "GET" && isStaticFile(internalEvent.rawPath)) {
        return internalEvent.type === "cf"
            ? formatCloudFrontFailoverResponse(event)
            : formatAPIGatewayFailoverResponse();
    }
    // Process request
    const host = internalEvent.headers["x-forwarded-host"] || internalEvent.headers["host"];
    const rendered = await app.respond(new Request(`https://${host}${internalEvent.url}`, {
        method: internalEvent.method,
        headers: internalEvent.headers,
        body: internalEvent.body,
    }));
    //Parse the response into lambda proxy response
    if (rendered) {
        const isBase64Encoded = isBinaryContentType(Array.isArray(rendered.headers["content-type"])
            ? rendered.headers["content-type"][0]
            : rendered.headers["content-type"]);
        const encoding = isBase64Encoded ? "base64" : "utf8";
        const body = rendered.body.toString(encoding);
        return convertTo({
            type: internalEvent.type,
            statusCode: rendered.status,
            headers: rendered.headers,
            isBase64Encoded,
            body,
        });
    }
    return {
        statusCode: 404,
        body: "Not found.",
    };
}
function isStaticFile(uri) {
    // If our path matches a static file, perfrom an origin re-write to S3;
    if (staticFiles.includes(uri)) {
        return true;
    }
    //Remove the leading slash (if any) to normalise the path
    if (uri.slice(-1) === "/") {
        uri = uri.substring(0, uri.length - 1);
    }
    //Pre-rendered pages could be named `/index.html` or `route/name.html` lets try looking for those as well
    if (staticFiles.includes(uri + "/index.html")) {
        return true;
    }
    if (staticFiles.includes(uri + ".html")) {
        return true;
    }
    return false;
}
function formatAPIGatewayFailoverResponse() {
    return { statusCode: 503 };
}
function formatCloudFrontFailoverResponse(event) {
    return event.Records[0].cf.request;
}
