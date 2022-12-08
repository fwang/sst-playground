import { Config } from "@serverless-stack/node/config";

export const main = async () => {
  console.log(Config);
  console.log(Config.STRIPE);
}
