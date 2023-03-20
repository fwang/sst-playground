import * as cdk from "aws-cdk-lib";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as cfOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import { use, StaticSite, StackContext } from "sst/constructs";
import AuthStack from "./auth-stack";

export default function ReactSiteStack({ app, stack }: StackContext) {
  //const { api } = use(AuthStack);

  //const apiDomain = cdk.Fn.select(1, cdk.Fn.split("://", api.url));

  // React
  const site = new StaticSite(stack, "Frontend", {
    path: "sites/react-app",
    buildCommand: "yarn build",
    buildOutput: "build",
    dev: {
      deploy: true,
    },
    customDomain: {
      domainName: "react.sst.sh",
      hostedZone: "sst.sh",
    },
    environment: {
      REACT_APP_API_URL: "https://api.sst.sh",
    },
    //cdk: {
    //  distribution: {
    //    additionalBehaviors: {
    //      "api/*": {
    //        origin: new cfOrigins.HttpOrigin(apiDomain),
    //        allowedMethods: cf.AllowedMethods.ALLOW_ALL,
    //        cachePolicy: cf.CachePolicy.CACHING_DISABLED,
    //      }
    //    }
    //  }
    //}
  });

  stack.addOutputs({
    SiteURL: site.url || "http://localhost",
  });

  return { site };
}
