import * as sst from "@serverless-stack/resources";

export default function BucketStack({ stack }: sst.StackContext) {
  const bucket = new sst.Bucket(stack, "Bucket", {
    notifications: {
      myNotification: {
        events: ["object_created"],
        function: "src/lambda.main",
      },
    }
  });

  new sst.Function(stack, "Seed500Files", {
    handler: "src/seed-bucket.main",
    environment: {
      BUCKET_NAME: bucket.bucketName,
    },
    use: [bucket],
  });

  stack.addOutputs({
    BucketName: bucket.bucketName,
  });

  return { bucket };
}
