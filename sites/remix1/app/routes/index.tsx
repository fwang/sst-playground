import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
//import { Config } from "sst/node/config";
//import { Function } from "sst/node/function";
//import sharp from "sharp";

export const loader: LoaderFunction = async ({ request }) => {
  console.log(process.env);
  const processEnv: Record<string, string> = {};
  Object.entries(process.env)
    .filter(([key, _]) => key.startsWith("SST_") || key === "FUNCTION_NAME")
    .forEach(([key, value]) => {
      processEnv[key] = value!;
    });

  //const semiTransparentRedPng = await sharp({
  //  create: {
  //    width: 48,
  //    height: 48,
  //    channels: 4,
  //    background: { r: 255, g: 0, b: 0, alpha: 0.5 },
  //  },
  //})
  //.png()
  //.toBuffer();

  return json({
    headers: {
      host: request.headers.get("Host"),
      xForwardedHost: request.headers.get("x-forwarded-host"),
      country: request.headers.get("cloudfront-viewer-country-name"),
    },
    processEnv,
    functionName: "placeholder",
    secretValue: "placeholder",
    //functionName: Function.ConfigFunction.functionName,
    //secretValue: Config.STRIPE_KEY,
    //image: semiTransparentRedPng.toString("base64"),
  });
};

export default function Index() {
  const { headers, processEnv, functionName, secretValue, image } =
    useLoaderData();
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.4" }}>
      <h1>Welcome to Remix (v2023-07-06-d)</h1>

      <h1>Test headers in SSR</h1>
      <pre>{JSON.stringify(headers, null, 4)}</pre>

      <h1>Test process.env in SSR</h1>
      <pre>{JSON.stringify(processEnv, null, 4)}</pre>

      <h1>Test sst/node in SSR</h1>
      <pre>function.name: {functionName}</pre>
      <pre>secret.value: {secretValue}</pre>
    </div>
  );
  //      <h1>Test sharp in SSR</h1>
  //      <img src={`data:image/png;base64,${image}`} />
}
