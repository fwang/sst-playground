import { use, StackContext } from "sst/constructs";
import ApiStack from "./api-stack";

export default function ApiExtraRoutesStack({ stack }: StackContext) {
  const { api } = use(ApiStack);

  api.addRoutes(stack, {
    "GET /extraRoute1": "src/lambda.main",
    "POST /extraRoute2": "src/lambda.main",
  });
}
