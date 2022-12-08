import * as sst from "@serverless-stack/resources";

export default function AppSyncApiStack({ stack }: sst.StackContext) {
  const api = new sst.AppSyncApi(stack, "AppSyncApi", {
    schema: "src/appsync/schema.graphql",
    customDomain: "appsync.sst.sh",
    dataSources: {
      mainDS: "src/appsync/lambda.main",
    },
    resolvers: {
      "Query license": "mainDS",
    },
  });

  stack.addOutputs({
    ApiId: api.apiId,
    ApiKey: api.cdk.graphqlApi.apiKey!,
    CustomDomain: api.customDomainUrl!,
  });

  return { api };
}
