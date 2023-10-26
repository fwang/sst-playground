import { use, Config, AstroSite, StackContext } from "sst/constructs";
import SecretsStack from "./secrets-stack";

export default function Astro3Stack({ app, stack }: StackContext) {
  if (app.mode === "dev") throw new Error("Do not `sst dev` live sites.");

  const { f, STRIPE_KEY } = use(SecretsStack);
  const site = new AstroSite(stack, "regionalV3", {
    path: "sites/astro3",
    bind: [f, STRIPE_KEY],
    environment: {
      FUNCTION_NAME: f.functionName,
    },
    //fileOptions: [
    //  {
    //    exclude: "*",
    //    include: "_astro/*.css",
    //    cacheControl: "public,max-age=0,s-maxage=11111111,must-revalidate",
    //    contentType: "text/css; charset=UTF-8",
    //  },
    //  {
    //    exclude: "*",
    //    include: "images/*",
    //    cacheControl: "public,max-age=0,s-maxage=31536000,must-revalidate",
    //  },
    //  {
    //    exclude: "*",
    //    include: "favicon.svg",
    //    cacheControl: "public,max-age=0,s-maxage=31536000,must-revalidate",
    //  },
    //],
  });

  stack.addOutputs({
    SiteURL: site.url,
  });
}
