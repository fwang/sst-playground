import { StackContext, Queue } from "@serverless-stack/resources";

export default function QueueStack({ stack }: StackContext) {
  const queue = new Queue(stack, "myLittleQueue", {
    consumer: "src/lambda.main",
  });

  return { queue };
}
