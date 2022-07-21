import * as sst from "@serverless-stack/resources";
import ApiStack from "./api-stack";

export default function RemixStack({ stack }: sst.StackContext) {
  const { api } = sst.use(ApiStack);

  const edge = new sst.RemixSite(stack, "web", {
    path: "src/sites/remix",
    edge: true,
    environment: {
      API_URL: api.url,
    },
    waitForInvalidation: false,
  });

  const regional = new sst.RemixSite(stack, "regional", {
    path: "src/sites/remix",
    environment: {
      API_URL: api.url,
    },
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
