import * as sst from "@serverless-stack/resources";

export default function TopicStack({ stack }: sst.StackContext) {
  const topic = new sst.Topic(stack, "Topic", {
    defaults: {
      function: {
        timeout: 3,
      },
    },
    subscribers: {
      main: "src/lambda.main"
    },
  });

  stack.addOutputs({
    TopicName: topic.topicName,
  });
}
