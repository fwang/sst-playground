import * as sst from "@serverless-stack/resources"
import ApiStack from "./api-stack"

export default function AuthStack({ stack }: sst.StackContext) {
  const { api } = sst.use(ApiStack)

  const auth = new sst.Auth(stack, "Auth")
  auth.attachPermissionsForAuthUsers([api])

  api.getFunction("GET /")?.addEnvironment("USER_POOL_ID", auth.userPoolId);

  return { auth }
}