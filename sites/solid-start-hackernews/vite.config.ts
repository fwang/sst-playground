import solid from "solid-start/vite";
import aws from "solid-start-aws";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid({ adapter: aws() })],
});