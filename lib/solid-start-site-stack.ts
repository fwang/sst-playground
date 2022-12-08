import { use, SolidStartSite, StackContext } from "sst/constructs";
import ApiStack from "./api-stack";

export default function SolidStartStack({ stack }: StackContext) {
  //const { api } = sst.use(ApiStack);

  const site = new SolidStartSite(stack, "regional", {
    path: "sites/solid-start",
    //environment: {
    //  API_URL: api.url,
    //},
    waitForInvalidation: false,
  });

  stack.addOutputs({
    SITE_URL: site.url,
  });
}
