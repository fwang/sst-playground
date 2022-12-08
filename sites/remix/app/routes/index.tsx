import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export const loader: LoaderFunction = async() => {
  return json({
    API_URL: process.env.API_URL,
  });
}

export default function Index() {
  const { API_URL } = useLoaderData();
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.4" }}>
      <h1>Welcome to Remix</h1>
      <p>API URL is {API_URL}</p>
    </div>
  );
}
