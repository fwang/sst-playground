import * as sst from "@serverless-stack/resources";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";

export default function BucketCDNStack({ stack }: sst.StackContext) {
  const bucket = new sst.Bucket(stack, "Bucket");

  const distribution = new cloudfront.Distribution(stack, 'cdn', {
    defaultBehavior: {
      origin: new cloudfrontOrigins.S3Origin(bucket.cdk.bucket),
    },
  });

  stack.addOutputs({
    URL: distribution.domainName
  })
}