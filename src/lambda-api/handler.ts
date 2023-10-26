import { Api, ApiHandler } from "sst/node/api";

export const handler = ApiHandler(async (evt) => {
  console.log(evt);
  return {
    statusCode: 200,
    body: Api.Api.url,
  };
});
