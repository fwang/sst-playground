import * as sst from "@serverless-stack/resources"

export default function AuthStack({ stack }: sst.StackContext) {
  const auth = new sst.Auth(stack, "Auth")

  return { auth }
}