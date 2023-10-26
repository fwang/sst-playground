import { StackContext, Bucket, Function } from "sst/constructs";

export default function BucketStack({ stack }: StackContext) {
  const bucket = new Bucket(stack, "Bucket", {
    notifications: {
      myNotification: {
        events: ["object_created"],
        function: "src/lambda.main",
      },
    },
  });

  stack.addOutputs({
    BucketName: bucket.bucketName,
  });

  return { bucket };
}
