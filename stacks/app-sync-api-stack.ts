import { AppSyncApi, StackContext } from "sst/constructs";
import { GraphqlApi } from "aws-cdk-lib/aws-appsync";

export default function AppSyncApiStack({ stack }: StackContext) {
  const api = new AppSyncApi(stack, "AppSyncApi", {
    schema: "src/appsync/schema.graphql",
    customDomain: "appsync.sst.sh",
    dataSources: {
      mainDS: "src/appsync/lambda.main",
    },
    resolvers: {
      "Query license": "mainDS",
    },
  });

  new AppSyncApi(stack, "AppSyncApi2", {
    cdk: {
      graphqlApi: GraphqlApi.fromGraphqlApiAttributes(stack, "IApi", {
        graphqlApiId: api.apiId,
      }),
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
