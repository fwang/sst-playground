import { Config, Function, StackContext } from "sst/constructs";

export default function SecretsStack({ stack }: StackContext) {
  const f = new Function(stack, "ConfigFunction", {
    handler: "src/lambda.main",
  });
  return {
    STRIPE_KEY: new Config.Secret(stack, "STRIPE_KEY"),
    TWILIO_KEY: new Config.Secret(stack, "TWILIO_KEY"),
    f,
  };
}
