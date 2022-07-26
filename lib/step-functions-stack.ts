import * as cdk from "aws-cdk-lib";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as sst from "@serverless-stack/resources";

export default function StepFunctionStack({ stack }: sst.StackContext) {
  // Define each state
  const sWait = new sfn.Wait(stack, "Wait", {
    time: sfn.WaitTime.duration(cdk.Duration.seconds(300)),
  });
  //const sHello = new tasks.LambdaInvoke(stack, "HelloTask", {
  //  lambdaFunction: new sst.Function(stack, "Hello", {
  //    handler: "src/lambda.main",
  //  }),
  //});
  //const sFailed = new sfn.Fail(stack, "Failed");
  const sSuccess = new sfn.Succeed(stack, "Success");
  const machine = new sfn.StateMachine(stack, "MyMachine", {
    definition: sWait
      //.next(sHello)
      //.next(
      //  new sfn.Choice(stack, "Job Approved?")
      //    .when(sfn.Condition.stringEquals("$.status", "Approved"), sSuccess)
      //    .otherwise(sFailed)
      //),
      .next(sSuccess),
  });

  stack.addOutputs({
    stateMachineName: machine.stateMachineName,
  })
}