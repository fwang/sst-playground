import { StackContext, Nextjs11Site } from "sst/constructs";
//import ApiStack from "./api-stack";

export default function NextjsStack({ stack }: StackContext) {
  // const { api } = sst.use(ApiStack);
  const site = new Nextjs11Site(stack, "NextJsApp", {
    customDomain: {
      domainName: "next.sst.sh",
      domainAlias: "www.next.sst.sh",
      hostedZone: "sst.sh",
    },
    path: "src/sites/nextjs",
    environment: {
      //    API_URL: api.url,
      //   NEXT_PUBLIC_API_URL: api.url,
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
