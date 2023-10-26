import {
  use,
  Config,
  Function,
  NextjsSite,
  StackContext,
} from "sst/constructs";
import { Architecture, LayerVersion } from "aws-cdk-lib/aws-lambda";
import {
  Function as CfFunction,
  FunctionCode as CfFunctionCode,
  FunctionEventType as CfFunctionEventType,
  HttpVersion,
} from "aws-cdk-lib/aws-cloudfront";
import SecretsStack from "./secrets-stack";

export default function Nextjs13Stack({ app, stack }: StackContext) {
  if (app.mode === "dev") throw new Error("Do not `sst dev` live sites.");

  const { f, STRIPE_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } =
    use(SecretsStack);
  const site = new NextjsSite(stack, "regional", {
    path: "sites/nextjs13",
    logging: "per-route",
    //warm: 2,
    //buildCommand: "echo hi",
    //buildCommand: "pnpm local:build",
    //buildCommand: "npx open-next@1.3.8 build",
    //experimental: {
    //  streaming: true,
    //},
    invalidation: {
      wait: true,
    },
    customDomain: {
      domainName: "next.sst.sh",
      domainAlias: "www.next.sst.sh",
      hostedZone: "sst.sh",
    },
    bind: [
      f,
      STRIPE_KEY,
      GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET,
      new Config.Secret(stack, "NEXTAUTH_SECRET"),
    ],
    environment: {
      API_URL: "sst.dev",
      NEXT_PUBLIC_API_URL: "sst.dev",
      NEXT_PUBLIC_FNAME: f.functionName,
      NEXTAUTH_SECRET: "random",
      NEXTAUTH_URL: "https://d3vpr15yt72y4k.cloudfront.net",
    },
    cdk: {
      distribution: {
        httpVersion: HttpVersion.HTTP3,
      },
      //server: {
      //  architecture: Architecture.X86_64,
      //},
      //      distribution: {
      //        defaultBehavior: {
      //          functionAssociations: [
      //            {
      //              function: new CfFunction(stack, "BasicAuth", {
      //                code: CfFunctionCode.fromInline(`
      //function handler(event) {
      //  var request = event.request;
      //  var auth = request.headers.authorization;
      //  if (auth) {
      //    console.log(decodeBase64(auth.value.split(" ")[1]));
      //    var parts = decodeBase64(auth.value.split(" ")[1]).split(":");
      //    if (parts[0] === "admin" && parts[1] === "welcome") {
      //      return request;
      //    }
      //  }
      //
      //  return {
      //    statusCode: 401,
      //    statusDescription: "Unauthorized",
      //    headers: {
      //      "www-authenticate": { value: 'Basic realm="Secure Area"' },
      //    },
      //  };
      //}
      //
      //function decodeBase64(base64) {
      //  var alphabet =
      //    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      //  var str = "";
      //  var bytes = [];
      //
      //  for (var i = 0; i < base64.length; i += 4) {
      //    var enc1 = alphabet.indexOf(base64[i]);
      //    var enc2 = alphabet.indexOf(base64[i + 1]);
      //    var enc3 = alphabet.indexOf(base64[i + 2]);
      //    var enc4 = alphabet.indexOf(base64[i + 3]);
      //
      //    var chr1 = (enc1 << 2) | (enc2 >> 4);
      //    var chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      //    var chr3 = ((enc3 & 3) << 6) | enc4;
      //
      //    bytes.push(chr1);
      //    if (enc3 !== 64) bytes.push(chr2);
      //    if (enc4 !== 64) bytes.push(chr3);
      //  }
      //
      //  for (var i = 0; i < bytes.length; i++) {
      //    str += String.fromCharCode(bytes[i]);
      //  }
      //
      //  return str;
      //}
      //
      //          `),
      //              }),
      //              eventType: CfFunctionEventType.VIEWER_REQUEST,
      //            },
      //          ],
      //        },
      //      },
    },
  });

  stack.addOutputs({
    SiteURL: site.url || "localhost",
  });

  return { site };
}
