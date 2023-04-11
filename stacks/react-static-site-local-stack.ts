import { StaticSite, StackContext } from "sst/constructs";

export default function ReactSiteLocalStack({ app, stack }: StackContext) {
  const site = new StaticSite(stack, "ReactLocal", {
    path: "sites/react-app",
    buildCommand: "yarn build",
    buildOutput: "build",
    environment: {
      REACT_APP_API_URL: "https://api.sst.sh",
    },
  });

  stack.addOutputs({
    SiteURL: site.url || "localhost",
  });

  return { site };
}
