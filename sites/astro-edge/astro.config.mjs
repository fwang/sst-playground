import { defineConfig } from 'astro/config';
import aws from '@astrojs/aws/edge';

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: aws(),
});