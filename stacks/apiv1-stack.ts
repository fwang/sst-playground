import { RestApi } from "aws-cdk-lib/aws-apigateway";
import { StackContext, ApiGatewayV1Api, Function } from "sst/constructs";

export default function ApiV1Stack({ app, stack }: StackContext) {
  const api = new ApiGatewayV1Api(stack, "LegacyApi", {
    cors: true,
    accessLog: true,
    //customDomain: "v1.sst.sh",
    authorizers: {
      //MyAuthorizer: {
      //  type: "lambda_request",
      //  function: new Function(stack, "MyAuthorizerFunction", {
      //    handler: "src/authorizer.main",
      //  }),
      //  identitySources: [apig.IdentitySource.header("Authorization")],
      //},
      MyAuthorizer: {
        type: "lambda_token",
        function: new Function(stack, "MyAuthorizerFunction", {
          handler: "src/authorizer.main",
        }),
      },
    },
    defaults: {
      function: {
        environment: {
          TABLE_NAME: "dummy",
        },
      },
      authorizer: "MyAuthorizer",
    },
    routes: {
      "GET /": "src/lambda.main",
      //"GET /sub": "src/lambda.main",
      //"POST /sub": "src/lambda.main",
      //"ANY /{proxy+}": "src/lambda.main",
    },
  });

  const api2 = new ApiGatewayV1Api(stack, "ImportedLegacyApi", {
    cdk: {
      restApi: RestApi.fromRestApiAttributes(stack, "ImportedApi", {
        restApiId: "stg79dbxmb",
        rootResourceId: "0ci1ulhz30",
      }),
    },
  });

  new Function(stack, "MyFunction", {
    handler: "src/lambda.main",
    bind: [api, api2],
  });

  // Add header for BASIC auth
  //api.cdk.restApi.addGatewayResponse("UNAUTHORIZED", {
  //  type: apig.ResponseType.UNAUTHORIZED,
  //  responseHeaders: {
  //    "WWW-Authenticate": "'Basic realm=\"Secure Area\"'",
  //  },
  //});

  stack.addOutputs({
    ApiV1URL: api.url,
  });

  return { api };
}
