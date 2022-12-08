import { use, AstroSite, StackContext } from "sst/constructs";
import ApiStack from "./api-stack";

export default function AstroStack({ stack }: StackContext) {
  //const { api } = sst.use(ApiStack);

  const edge = new AstroSite(stack, "web", {
    path: "sites/astro-edge",
    edge: true,
    //  environment: {
    //    API_URL: api.url,
    //  },
    waitForInvalidation: false,
  });

  const regional = new AstroSite(stack, "regional", {
    path: "sites/astro",
    //environment: {
    //  API_URL: api.url,
    //},
    waitForInvalidation: false,
  });

  stack.addOutputs({
    EDGE_SITE_URL: edge.url,
    EDGE_SITE_BucketName: edge.bucketName,
    EDGE_SITE_DistributionId: edge.distributionId,
    EDGE_SITE_DistributionDomain: edge.distributionDomain,
    REGIONAL_SITE_URL: regional.url,
    REGIONAL_SITE_BucketName: regional.bucketName,
    REGIONAL_SITE_DistributionId: regional.distributionId,
    REGIONAL_SITE_DistributionDomain: regional.distributionDomain,
  });
}
