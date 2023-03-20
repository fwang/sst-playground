import {
  ParameterMapping,
  MappingValue,
  HttpIntegrationSubtype,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { StackContext, Api, Bucket, Config } from "sst/constructs";

export default function ApiStack({ app, stack }: StackContext) {
  const secret = new Config.Secret(stack, "my-secret");
  const bucket = new Bucket(stack, "my-files");

  // Create Api with custom domain
  const api = new Api(stack, "Api", {
    //customDomain: app.stage === "dev" ? "api.sst.sh" : undefined,
    defaults: {
      function: {
        bind: [secret, bucket],
        enableLiveDev: false,
      },
    },
    routes: {
      "GET /": "src/lambda.main",
      "GET /route0": "src/lambda.main",
      "POST /EventBridge-PutEvents": {
        type: "aws",
        cdk: {
          integration: {
            subtype: HttpIntegrationSubtype.EVENTBRIDGE_PUT_EVENTS,
            parameterMapping: ParameterMapping.fromObject({
              Source: MappingValue.custom("$request.body.source"),
              DetailType: MappingValue.custom("$request.body.detailType"),
              Detail: MappingValue.custom("$request.body.detail"),
            }),
          },
        },
      },
    },
  });

  app.addDefaultFunctionBinding([api]);

  stack.addOutputs({
    Endpoint: api.url || "no-url",
    CustomEndpoint: api.customDomainUrl || "no-custom-url",
  });

  return { api };
}

/*
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
*/
