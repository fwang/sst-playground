import * as apig from "@aws-cdk/aws-apigatewayv2-alpha";
import * as sst from "@serverless-stack/resources";

export default function ApiStack({ stack }: sst.StackContext) {
  // Create Api with custom domain
  const api = new sst.Api(stack, "Api", {
    customDomain: "api.sst.sh",
    defaults: {
      function: {
        timeout: 10,
      },
    },
    routes: {
      "GET /": "src/lambda.root",
      "GET /leaf": "src/lambda.leaf",
      $default: "src/lambda.main",
    },
  });

  stack.addOutputs({
    Endpoint: api.url || "no-url",
    CustomEndpoint: api.customDomainUrl || "no-custom-url",
  });

  // Create Api without custom domain
  new sst.Api(stack, "NoDomain", {
    routes: {
      "GET /": "src/lambda.main",
    },
  });

  // Create Api with custom stages
  const customStageApi = new sst.Api(stack, "CustomStage", {
    cdk: {
      httpApi: {
        createDefaultStage: false,
      },
    },
    routes: {
      "GET /": "src/lambda.main",
    },
  });
  new apig.HttpStage(stack, "Stage", {
    httpApi: customStageApi.cdk.httpApi,
    stageName: "my-stage",
    autoDeploy: true,
  });

  return { api };
}
