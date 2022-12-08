import { defineConfig } from 'astro/config';
import aws from '@astrojs/aws/lambda';

export default defineConfig({
  output: "server",
  adapter: aws(),
});