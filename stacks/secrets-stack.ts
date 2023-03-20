import { Config, StackContext } from "sst/constructs";

export default function SecretsStack({ stack }: StackContext) {
  return {
    STRIPE_KEY: new Config.Secret(stack, "STRIPE_KEY"),
    TWILIO_KEY: new Config.Secret(stack, "TWILIO_KEY"),
  };
}
