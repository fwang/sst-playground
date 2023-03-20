import { defineConfig } from 'astro/config';
import aws from 'astro-sst/edge';

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: aws(),
});