import * as sst from "@serverless-stack/resources";
import ApiStack from "./api-stack";

export default function NextjsStack({ stack }: sst.StackContext) {
  const { api } = sst.use(ApiStack);
  const site = new sst.NextjsSite(stack, "NextJsApp", {
    customDomain: {
      domainName: "next.sst.sh",
      domainAlias: "www.next.sst.sh",
      hostedZone: "sst.sh",
    },
    path: "src/sites/nextjs",
    environment: {
      API_URL: api.url,
      NEXT_PUBLIC_API_URL: api.url,
    },
    waitForInvalidation: false,
  });

  stack.addOutputs({
    URL: site.url,
    BucketArn: site.bucketArn,
    BucketName: site.bucketName,
    DistributionId: site.distributionId,
    DistributionDomain: site.distributionDomain,
  });
}
