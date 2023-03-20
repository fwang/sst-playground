import { StackContext, Api, Auth, StaticSite, Table } from "sst/constructs";

export default function AuthStack({ app, stack }: StackContext) {
  const table = new Table(stack, "users", {
    fields: {
      userID: "string",
      email: "string",
    },
    primaryIndex: { partitionKey: "userID" },
    globalIndexes: {
      email: { partitionKey: "email" },
    },
  });

  const api = new Api(stack, "myAuthApi", {
    defaults: {
      function: {
        bind: [table],
      },
    },
    routes: {
      "GET /": "src/lambda.main",
      "GET /session": "src/auth/session.handler",
    },
  });

  const site = new StaticSite(stack, "site", {
    path: "sites/vite",
    environment: {
      VITE_APP_API_URL: api.url,
    },
  });

  const auth = new Auth(stack, "auth", {
    authenticator: {
      handler: "src/auth/auth.handler",
      permissions: ["ses:SendEmail"],
      bind: [site],
    },
  });
  auth.attach(stack, {
    api,
    prefix: "/auth",
  });

  stack.addOutputs({
    ApiEndpoint: api.url,
    SiteURL: site.url || "localhost",
  });

  return { api };
}
