import { use, SolidStartSite, StackContext } from "sst/constructs";
import ApiStack from "./api-stack";

export default function SolidStartEdgeStack({ stack }: StackContext) {
  //const { api } = sst.use(ApiStack);

  const site = new SolidStartSite(stack, "edge", {
    path: "sites/solid-start-edge",
    edge: true,
    //environment: {
    //  API_URL: api.url,
    //},
    waitForInvalidation: false,
  });

  stack.addOutputs({
    SITE_URL: site.url,
  });
}
