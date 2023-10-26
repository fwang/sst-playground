import { Config } from "sst/node/config";
import express from "express";
const app = express();
const port = 3000;

app.get("/", (req, res) => {
  const envs = {};
  Object.entries(process.env)
    .filter(([key]) => key.startsWith("SST_") || key.startsWith("NEXT_"))
    .forEach(([key, value]) => (envs[key] = value));
  res.send(
    "<h1>Express app v4</h1>" +
      "<pre>" +
      JSON.stringify(
        {
          envs,
          config: { STRIPE_KEY: Config.STRIPE_KEY },
        },
        null,
        2
      ) +
      "</pre>"
  );
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
