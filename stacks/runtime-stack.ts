import * as sst from "@serverless-stack/resources";

export default function MainStack({ stack }: sst.StackContext) {
  const api = new sst.Api(stack, "Api", {
    routes: {
      //"GET /csharp3": {
      //  function: {
      //    runtime: "dotnetcore3.1",
      //    srcPath: "src/csharp31",
      //    handler: "CsharpFunction::CsharpFunction.Handlers::Handler",
      //  }
      //},
      //"GET /csharp6": {
      //  function: {
      //    runtime: "dotnet6",
      //    srcPath: "src/csharp6",
      //    handler: "CsharpFunction::CsharpFunction.Handlers::Handler",
      //  }
      //},
      "GET /java8": {
        function: {
          runtime: "java8",
          srcPath: "src/java8",
          handler: "example.Handler::handleRequest",
        }
      },
      "GET /java11": {
        function: {
          runtime: "java11",
          srcPath: "src/java11",
          handler: "example.Handler::handleRequest",
        }
      },
      "GET /java11-gradlew": {
        function: {
          runtime: "java11",
          srcPath: "src/java11-gradlew",
          handler: "example.Handler::handleRequest",
        }
      },
      //"GET /java11-custom": {
      //  function: {
      //    runtime: "java11",
      //    srcPath: "src/java11-custom",
      //    handler: "minimal.java.native.FunctionRequestHandler::execute",
      //    bundle: {
      //      buildTask: "buildNativeLambda",
      //      buildOutputDir: "libs",
      //      experimentalUseProvidedRuntime: "provided.al2",
      //    }
      //  }
      //},
      //"GET /csharp6": {
      //  function: {
      //    runtime: "dotnet6",
      //    srcPath: "src/csharp6",
      //    handler: "CsharpFunction::CsharpFunction.Handlers::Handler",
      //  }
      //},
      //"GET /go": {
      //  function: {
      //    runtime: "go1.x",
      //    srcPath: "src/go",
      //    handler: "src",
      //  }
      //},
      //"GET /python": {
      //  function: {
      //    runtime: "python3.8",
      //    srcPath: "src/python",
      //    handler: "handler.main",
      //  }
      //},
    },
  });

  stack.addOutputs({
    Endpoint: api.url!,
  });
}
