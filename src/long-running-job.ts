import { Config } from "@serverless-stack/node/config";

export const main = async (event) => {
  console.log("Running long running job")
  console.log("== event ==")
  console.log(typeof event);
  console.log(event);
  console.log("== Config ==")
  console.log(Config);
  return "done";
}