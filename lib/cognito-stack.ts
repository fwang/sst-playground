import { Cognito, Config, StackContext } from "@serverless-stack/resources";

export default function CognitoStack({ stack }: StackContext) {
  const auth = new Cognito(stack, "Auth")

  const USER_POOL_ID = new Config.Parameter(stack, "USER_POOL_ID", {
    value: auth.userPoolId,
  })

  return { auth, USER_POOL_ID }
}