import { Config, StackContext } from "@serverless-stack/resources";

export default function SecretsStack({ stack }: StackContext) {
  return {
    STRIPE_KEY: new Config.Secret(stack, "STRIPE_KEY"),
    TWILIO_KEY: new Config.Secret(stack, "TWILIO_KEY"),
    TEST_KEY: new Config.Secret(stack, "TEST_KEY"),
  };
}
