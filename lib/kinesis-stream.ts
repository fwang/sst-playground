import * as sst from "@serverless-stack/resources";

export class MainStack extends sst.Stack {
  constructor(scope: sst.App, id: string, props?: sst.StackProps) {
    super(scope, id, props);

    const stream = new sst.KinesisStream(this, "Stream", {
      defaultFunctionProps: {
        timeout: 3,
      },
      consumers: {
        consumerA: "src/lambda.main",
      },
    });

    this.addOutputs({
      StreamName: stream.kinesisStream.streamName,
    });
  }
}
