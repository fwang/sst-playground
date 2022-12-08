import * as sst from "@serverless-stack/resources";

export default function ApolloStack({ stack }: sst.StackContext) {
  const api = new sst.GraphQLApi(stack, "Api", {
    server: "src/apollo/graphql.handler",
  });

  stack.addOutputs({
    Endpoint: api.url || "no-url",
    CustomEndpoint: api.customDomainUrl || "no-custom-url",
  });

  return { api };
}
