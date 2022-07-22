import * as sst from "@serverless-stack/resources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as codebuild from "aws-cdk-lib/aws-codebuild";

export default function CodeBuildStack({ stack }: sst.StackContext) {
  ///////////////////
  // Bundle code
  ///////////////////

  // Create a dummy Lambda function just so that it builds the function code.
  // We won't be invoking this Lambda function.
  const fn = new sst.Function(stack, "DummyFunction", {
    handler: "src/lambda.root"
  });
  const cfnFn = fn.node.defaultChild! as lambda.CfnFunction;
  const code = cfnFn.code as lambda.CfnFunction.CodeProperty;

  /////////////////////////////
  // Create CodeBuild project
  /////////////////////////////

  // You can create 1 CodeBuild project for each long running script, or
  // you can just create a single CodeBuild project for all scripts by overriding
  // the build commands.
  const build = new codebuild.Project(stack, "LongRunningProject", {
    environment: {
      // CodeBuild offers different build images. The newer ones have much quicker
      // boot time. The latest build image is STANDARD_6_0, which support Node.js 16.
      // But while testing, I found STANDARD_6_0 took 100s to boot. So for the
      // purpose of this demo, I use STANDARD_5_0. It takes 30s to boot.
      buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      // CodeBuild offers a few differnt Memory/CPU options. SMALL comes with
      // 3GB memory and 2 vCPUs.
      computeType: codebuild.ComputeType.SMALL,
    },
    environmentVariables: {
      MY_VAR: {
        value: "hello world",
      }
    },
    buildSpec: codebuild.BuildSpec.fromObject({
      version: "0.2",
      phases: {
        build: {
          commands: [
            // Test MY_VAR is available at runtime
            `echo $MY_VAR`,
            // Download the Lambda's code from S3
            `aws s3 cp s3://${code.s3Bucket}/${code.s3Key} source.zip`,
            // Unzip the code
            `unzip source.zip -d source`,
            // See what's in the code
            `ls -lsa source`,
            // Run the code
            `node source/${cfnFn.handler?.replace(/\.[^.]+$/, ".js")}`,
          ],
        },
      },
    })
  });

  /////////////////////////////
  // Grant permissions
  /////////////////////////////

  // Because we are downloading the code from S3, we need to grant the CodeBuild
  // project access to S3.
  sst.attachPermissionsToRole(build.role as iam.Role, ["s3"]);

  // Display the CodeBuild project name so we can use it to start the build, ie.
  // aws codebuild start-build --project-name LongRunningProjectBDB68DE8-o98U9D5Haefc
  stack.addOutputs({
    ProjectName: build.projectName,
  });
}
