//import * as cdk from "aws-cdk-lib";
//import * as cf from "aws-cdk-lib/aws-cloudfront";
import { StackContext, StaticSite } from "sst/constructs";

export default function StaticSiteStack({ stack }: StackContext) {
  // React
  const site = new StaticSite(stack, "SPA", {
    //assets: {
    //  fileOptions: [
    //    {
    //      files: ".well-known/site-association-json",
    //      cacheControl: "max-age=0,no-cache,no-store,must-revalidate",
    //      contentType: "application/json",
    //    },
    //  ],
    //},
    replaceValues: [
      {
        files: "**/*.js",
        search: "{{ GREETING }}",
        replace: "Hi!",
      },
      {
        files: "**/*.html",
        search: "{{ GREETING }}",
        replace: "Hello World!",
      },
    ],
    /*
    customDomain: {
      domainName: "sst.sh",
      domainAlias: "www.sst.sh",
      hostedZone: "sst.sh",
    },
    */

    /* Plain HTML
    path: "sites/website",
    indexPage: "index.html",
    errorPage: "error.html",
     */

    /* Vite
     */
    path: "sites/vite",
    buildOutput: "dist",
    buildCommand: "npm run build",
    environment: {
      VITE_APP_API_URL: "https://api.sst.sh",
    },

    /* Jekyll
    path: "src/sites/jekyll-site",
    indexPage: "index.html",
    errorPage: "404.html",
    buildCommand: "bundle exec jekyll build",
    buildOutput: "_site",
    customDomain: "www.sst.sh",
    */
  });

  stack.addOutputs({
    URL: site.url,
    CustomDomainURL: site.customDomainUrl,
  });
}

/* Mike's example of configuring /auth* to and API

  // Public bucket for website
  this.websiteBucket = new Bucket(this, 'WebsiteBucket', {
    websiteIndexDocument: 'index.html',
    publicReadAccess: true
  });
const cachePolicy = new cloudfront.CachePolicy(this, "ShopifyAppPolicy", {
    defaultTtl: cdk.Duration.seconds(1),
    maxTtl: cdk.Duration.seconds(5),
    minTtl: cdk.Duration.seconds(0),
    headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Authorization"),
  })
  const originPolicy = new cloudfront.OriginRequestPolicy(this, "ShopifyAppOrigin", {
    queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all()
  })
  let staticCache
  if (scope.stage !== 'prod') {
    staticCache = cloudfront.CachePolicy.CACHING_DISABLED
  } else {
    staticCache = cloudfront.CachePolicy.CACHING_OPTIMIZED
  }
  // When not in prod direct traffic to ngrok
  let staticOrigin
  if (scope.stage !== 'prod') {
    staticOrigin = new origins.HttpOrigin(props.ngrok, {
      protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
    })
  } else {
    staticOrigin = new origins.S3Origin(this.websiteBucket)
  }
  this.distribution = new cloudfront.Distribution(this, 'Cloudfront', {
    priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    defaultRootObject: '/index.html',
    errorResponses: [{ httpStatus: 404, responsePagePath: '/index.html', responseHttpStatus: 200 }],
    defaultBehavior: {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: staticCache,
      origin: staticOrigin
    },
    additionalBehaviors: {
      "/auth*": {
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cachePolicy,
        originRequestPolicy: originPolicy,
        origin: new origins.HttpOrigin(`${this.api.httpApi.httpApiId}.execute-api.${scope.region}.amazonaws.com`, {
          protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
        })
      }
    }
  });
  ['GET /auth', 'GET /auth/callback'].forEach((routeKey) => {
    const fn = this.api.getFunction(routeKey)
    if (fn) { fn.addEnvironment("HOST", `${this.distribution.domainName}`) }
  })

*/
