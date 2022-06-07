import * as sst from "@serverless-stack/resources";

export default function BucketStack({ stack }: sst.StackContext) {
  const bucket = new sst.Bucket(stack, "Bucket");

  new sst.Function(stack, "Seed500Files", {
    handler: "src/seed-bucket.main",
    environment: {
      BUCKET_NAME: bucket.bucketName,
    },
    permissions: [bucket],
  });

  stack.addOutputs({
    BucketName: bucket.bucketName,
  });
}
