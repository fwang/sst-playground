import { use, NextjsSite, StackContext } from "sst/constructs";

export default function NextjsStack({ stack }: StackContext) {
  const site = new NextjsSite(stack, "regional", {
    path: "sites/nextjs13",
    environment: {
      API_URL: "sst.dev",
      NEXT_PUBLIC_API_URL: "sst.dev",
      //API_URL: api.url,
      //NEXT_PUBLIC_API_URL: api.url,
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

  return { site };
}
