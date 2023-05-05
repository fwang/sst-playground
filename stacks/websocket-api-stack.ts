import { StackContext, Function, WebSocketApi } from "sst/constructs";

//arn:aws:iam::112245769880:role/apigateway-cloudwatch-logs-role
export default function WebSocketApiStack({ stack }: StackContext) {
  const api = new WebSocketApi(stack, "my_websocket_api", {
    authorizer: {
      type: "lambda",
      identitySource: ["route.request.querystring.jwt"],
      function: new Function(stack, "WebSocketApiAuthorizer", {
        handler: "src/websocket/authorizer.main",
      }),
    },
    routes: {
      $connect: "src/websocket/lambda.main",
      $disconnect: "src/websocket/lambda.main",
      $default: "src/websocket/lambda.main",
      sendMessage: "src/websocket/lambda.main",
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
