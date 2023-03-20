import { useRouteData, Title } from "solid-start";
import { createServerData$ } from "solid-start/server";
import Counter from "~/components/Counter";
import { Config } from "sst/node/config";
import { Function } from "sst/node/function";

export function routeData() {
  return createServerData$(() => {
    // Environment variables
    const processEnv = {};
    Object.entries(process.env)
      .filter(([key, _]) => key.startsWith("SST_") || key === "FUNCTION_NAME")
      .forEach(([key, value]) => {
        processEnv[key] = value;
      });

    console.log({
      processEnv,
      functionName: Function.SolidEdgeDummyFunction.functionName,
      secretValue: Config.SolidEdgeDummySecret,
    });

    return {
      processEnv,
      functionName: Function.SolidEdgeDummyFunction.functionName,
      secretValue: Config.SolidEdgeDummySecret,
    };
  });
}

export default function Home() {
  const data = useRouteData<typeof routeData>();
  return (
    <main>
      <Title>Hello World</Title>
      <Counter />
      <p>
        Visit{" "}
        <a href="https://start.solidjs.com" target="_blank">
          start.solidjs.com
        </a>{" "}
        to learn how to build SolidStart apps.
      </p>
    </main>
  );
}
