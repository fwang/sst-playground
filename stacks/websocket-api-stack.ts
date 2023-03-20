import { StackContext, Function, WebSocketApi } from "sst/constructs";

//arn:aws:iam::112245769880:role/apigateway-cloudwatch-logs-role
export default function WebSocketApiStack({ stack }: StackContext) {
  const api = new WebSocketApi(stack, "my_websocket_api", {
    routes: {
      $connect: "src/lambda.main",
      $disconnect: "src/lambda.main",
      $default: "src/lambda.main",
      sendMessage: "src/lambda.main",
    },
  });

  const f = new Function(stack, "myWebsocketDummyFunction", {
    handler: "src/lambda.main",
    bind: [api],
  });

  stack.addOutputs({
    URL: api.url,
    CustomDomainURL: api.customDomainUrl || api.url,
  });

  return { api };
}
