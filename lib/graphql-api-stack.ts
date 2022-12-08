import { use, StackContext, Api, Table, Function } from "@serverless-stack/resources";
import CognitoStack from "./cognito-stack";
import SecretsStack from "./secrets-stack";

export default function ApiStack({ app, stack }: StackContext) {
  const { auth, USER_POOL_ID } = use(CognitoStack);
  const { STRIPE_KEY, TWILIO_KEY } = use(SecretsStack);

  // Create Api with custom domain
  const api = new Api(stack, "Api", {
    customDomain: app.stage === "dev" ? "api.sst.sh" : undefined,
    defaults: {
      function: {
        use: [
          STRIPE_KEY,
          TWILIO_KEY,
          USER_POOL_ID,
        ],
      },
    },
    routes: {
      "GET /": "src/lambda.main",
      "GET /route0": "src/lambda.main",
    },
  });

  auth.attachPermissionsForAuthUsers(stack, [api]);

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