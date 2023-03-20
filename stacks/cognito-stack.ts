import { Cognito, Config, StackContext } from "sst/constructs";

export default function CognitoStack({ stack }: StackContext) {
  const auth = new Cognito(stack, "Auth")

  const USER_POOL_ID = new Config.Parameter(stack, "USER_POOL_ID", {
    value: auth.userPoolId,
  })

  return { auth, USER_POOL_ID }
}