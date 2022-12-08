import { StackContext, WebSocketApi } from "@serverless-stack/resources";

export default function WebSocketApiStack({ app, stack }: StackContext) {
  const api = new WebSocketApi(stack, "my_websocket_api", {
    routes: {
      $connect: "src/lambda.main",
      $disconnect: "src/lambda.main",
      $default: "src/lambda.main",
      sendMessage: "src/lambda.main",
    },
  });

  stack.addOutputs({
    URL: api.url,
    CustomDomainURL: api.customDomainUrl || api.url,
  });

  return { api };
}
