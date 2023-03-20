import { Function, StackContext } from "sst/constructs";
import { NextjsSite } from "sst/constructs/deprecated";
//import ApiStack from "./api-stack";

export default function Nextjs11Stack({ stack }: StackContext) {
  // const { api } = sst.use(ApiStack);

  const f = new Function(stack, "myf11", {
    handler: "src/lambda.main",
  });

  const site = new NextjsSite(stack, "nextjs11", {
    path: "sites/nextjs11",
    environment: {
      //    API_URL: api.url,
      //   NEXT_PUBLIC_API_URL: api.url,
      API_URL: "sst.dev",
      NEXT_PUBLIC_API_URL: "sst.dev",
      NEXT_PUBLIC_FNAME: f.functionName,
    },
    waitForInvalidation: false,
  });

  stack.addOutputs({
    BucketName: site.bucketName,
    DistributionUrl: site.url,
  });

  return { site };
}
