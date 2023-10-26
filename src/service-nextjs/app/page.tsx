import { Config } from "sst/node/config";

async function getData() {
  const envs: Record<string, string> = {};
  Object.entries(process.env)
    .filter(([key]) => key.startsWith("SST_") || key.startsWith("NEXT_"))
    .forEach(([key, value]) => (envs[key] = value!));
  return {
    envs,
    config: {
      STRIPE_KEY: Config.STRIPE_KEY,
    },
  };
}

export default async function Home() {
  const data = await getData();

  return (
    <main className="flex min-h-screen flex-col justify-between p-24">
      <h1>Next.js version 1</h1>
      <h3>Config</h3>
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <pre>{JSON.stringify(data.config, null, 2)}</pre>
      </div>
      <h3>Envs</h3>
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <pre>{JSON.stringify(data.envs, null, 2)}</pre>
      </div>
    </main>
  );
}
