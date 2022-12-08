import type { SSRManifest } from "astro"
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { NodeApp } from "astro/app/node"
import { polyfill } from "@astrojs/webapi"

polyfill(globalThis, {
  exclude: "window document",
})

export function createExports(manifest: SSRManifest) {
  const app = new NodeApp(manifest)

  return {
    async handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
      const {
        body,
        headers,
        rawPath,
        rawQueryString,
        requestContext,
        isBase64Encoded,
      } = event;

      // Convert API Gateway request to Node request
      const scheme = headers["x-forwarded-protocol"] || "https";
      const host = headers["x-forwarded-host"] || headers.host;
      const qs = rawQueryString.length > 0 ? `?${rawQueryString}` : "";
      const url = new URL(`${rawPath}${qs}`, `${scheme}://${host}`)
      const encoding = isBase64Encoded ? "base64" : "utf8";
      const request = new Request(url.toString(), {
        method: requestContext.http.method,
        headers: new Headers(headers),
        body: typeof body === "string"
          ? Buffer.from(body, encoding)
          : body,
      })

      // Process request
      const rendered = await app.render(request)

      // Build cookies
      // note: AWS API Gateway will send back set-cookies outside of response headers
      const responseCookies = Array.from(rendered.headers.entries())
        .filter(([key]) => key === "set-cookie")
        .map(([_, value]) => value);
      if (responseCookies.length) {
        rendered.headers.delete("set-cookie");
      }

      // Convert Node response to API Gateway response
      const responseIsBase64Encoded = isBinaryContentType(rendered);
      return {
        statusCode: rendered.status,
        headers: Object.fromEntries(rendered.headers.entries()),
        cookies: responseCookies,
        body: responseIsBase64Encoded
          ? Buffer.from(await rendered.arrayBuffer()).toString("base64")
          : await rendered.text(),
        isBase64Encoded: responseIsBase64Encoded,
      }
    },
  }
}

function isBinaryContentType(rendered) {
  const header = rendered.headers.get("content-type");
  if (!header) return false;

  const contentType = header?.split(';')[0] ?? '';
  const commonBinaryMimeTypes = new Set([
    "application/octet-stream",
    // Docs
    "application/epub+zip",
    "application/msword",
    "application/pdf",
    "application/rtf",
    "application/vnd.amazon.ebook",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // Fonts
    "font/otf",
    "font/woff",
    "font/woff2",
    // Images
    "image/bmp",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/vnd.microsoft.icon",
    "image/webp",
    // Audio
    "audio/3gpp",
    "audio/aac",
    "audio/basic",
    "audio/mpeg",
    "audio/ogg",
    "audio/wavaudio/webm",
    "audio/x-aiff",
    "audio/x-midi",
    "audio/x-wav",
    // Video
    "video/3gpp",
    "video/mp2t",
    "video/mpeg",
    "video/ogg",
    "video/quicktime",
    "video/webm",
    "video/x-msvideo",
    // Archives
    "application/java-archive",
    "application/vnd.apple.installer+xml",
    "application/x-7z-compressed",
    "application/x-apple-diskimage",
    "application/x-bzip",
    "application/x-bzip2",
    "application/x-gzip",
    "application/x-java-archive",
    "application/x-rar-compressed",
    "application/x-tar",
    "application/x-zip",
    "application/zip",
  ]);
  return commonBinaryMimeTypes.has(contentType);
}