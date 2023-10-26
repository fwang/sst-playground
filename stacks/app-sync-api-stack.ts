import { AppSyncApi, StackContext } from "sst/constructs";

export default function AppSyncApiStack({ stack }: StackContext) {
  const api = new AppSyncApi(stack, "AppSyncApi", {
    schema: "src/appsync/schema.graphql",
    customDomain: {
      domainName: "appsync.sst.sh",
      recordType: "A_AAAA",
    },
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
    ApiUrl: api.url,
    CustomDomain: api.customDomainUrl!,
  });

  return { api };
}
