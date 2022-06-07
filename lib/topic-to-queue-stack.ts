import * as sst from "@serverless-stack/resources";

export default function TopicToQueueStack({ stack }: sst.StackContext) {
  const queue1 = new sst.Queue(stack, "MyQueue1", {
    consumer: "src/lambda.main",
  });
  const queue2 = new sst.Queue(stack, "MyQueue2", {
    consumer: "src/lambda.main",
  });

  const topic = new sst.Topic(stack, "MyTopic", {
    subscribers: [queue1, queue2],
  });

  stack.addOutputs({
    TopicName: topic.topicName,
  });
}
