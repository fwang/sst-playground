import { StackContext, KinesisStream } from "@serverless-stack/resources";

export default function KinesisStreamStack({ app, stack }: StackContext) {
  const stream = new KinesisStream(stack, "Stream", {
    defaults: {
      function: {
        timeout: 3,
      }
    },
    consumers: {
      consumerA: "src/lambda.main",
    },
  });

  stack.addOutputs({
    StreamName: stream.streamName,
  });

  return { stream };
}
