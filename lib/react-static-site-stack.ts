import * as cdk from "aws-cdk-lib";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as cfOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as sst from "@serverless-stack/resources";
import ApiStack from "./api-stack";

export default function ReactSiteStack({ stack }: sst.StackContext) {
  const { api } = sst.use(ApiStack);

  const apiDomain = cdk.Fn.select(1, cdk.Fn.split("://", api.url));

  // React
  const site = new sst.ReactStaticSite(stack, "Frontend", {
    path: "src/sites/react-app",
    customDomain: "react.sst.sh",
    environment: {
      REACT_APP_API_URL: api.url,
    },
    waitForInvalidation: false,
    cdk: {
      distribution: {
        additionalBehaviors: {
          "api/*": {
            origin: new cfOrigins.HttpOrigin(apiDomain),
            allowedMethods: cf.AllowedMethods.ALLOW_ALL,
            cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          }
        }
      }
    }
  });

  stack.addOutputs({
    URL: site.url,
    BucketArn: site.bucketArn,
    BucketName: site.bucketName,
    DistributionId: site.distributionId,
    DistributionDomain: site.distributionDomain,
  });
}
