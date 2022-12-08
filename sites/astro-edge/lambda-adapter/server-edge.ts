import type { SSRManifest } from "astro"
import type {
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
} from "aws-lambda"
import { NodeApp } from "astro/app/node"
import { polyfill } from "@astrojs/webapi"

polyfill(globalThis, {
  exclude: "window document",
})

export function createExports(manifest: SSRManifest) {
  const app = new NodeApp(manifest)

  return {
    async handler(event: CloudFrontRequestEvent): Promise<CloudFrontRequestResult> {
      // Convert CloudFront request to Node request
      const { uri, method, headers, querystring, body } = event.Records[0].cf.request;
      const requestHeaders = new Headers()
      for (const [key, values] of Object.entries(headers)) {
        for (const { value } of values) {
          if (value) {
            requestHeaders.append(key, value)
          }
        }
      }
      const host = headers["host"][0].value;
      const qs = querystring.length > 0 ? `?${querystring}` : "";
      const url = new URL(`${uri}${qs}`, `https://${host}`);
      const request = new Request(url.toString(), {
        method,
        headers: requestHeaders,
        body: body.data
          ? body.encoding === "base64"
            ? Buffer.from(body.data, "base64").toString()
            : body.data
          : undefined,
      });

      // Process request
      const rendered = await app.render(request);

      // Build cookies
      const responseHeaders = {}
      const rawHeaders = rendered.headers.entries();
      for (const [key, value] of rawHeaders) {
        for (const v of value) {
          responseHeaders[key] = [...(responseHeaders[key] || []), { key, value: v }];
        }
      }

      // Convert Node response to CloudFront response
      const responseIsBase64Encoded = isBinaryContentType(rendered);
      return {
        status: String(rendered.status),
        statusDescription: "OK",
        headers: responseHeaders,
        bodyEncoding: responseIsBase64Encoded ? "base64" : "text",
        body: await rendered.text(),
      }
    }
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