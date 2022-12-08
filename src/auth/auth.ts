import { randomBytes } from "crypto";
import { AuthHandler, GoogleAdapter, FacebookAdapter, CodeAdapter } from "@serverless-stack/node/auth";
import { Table } from "@serverless-stack/node/table";
import { useResponse } from "@serverless-stack/node/api";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { DynamoDBClient, QueryCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const siteUrl = "http://127.0.0.1:5173";

declare module "@serverless-stack/node/auth" {
  export interface SessionTypes {
    user: {
      userID: string;
    };
  }
}

export const handler = AuthHandler({
  providers: {
    google: GoogleAdapter({
      mode: "oidc",
      clientID: "1051197502784-vjtbj1rnckpagefmcoqnaon0cbglsdac.apps.googleusercontent.com",
      onSuccess: async (tokenset) => {
        const claims = tokenset.claims();
        useResponse().json(claims);
      },
    }),
    facebook: FacebookAdapter({
      clientID: "1494877691031480",
      clientSecret: "bea82b3bdbd5e192ce34c09a786e3ea0",
      scope: "email",
      onSuccess: async (tokenset) => {
        console.log({ tokenset });
        const claims = tokenset.claims();
        useResponse().json(claims);
      },
    }),
    email: CodeAdapter({
      onCode: async (code, claims) => {
        const ses = new SESClient({});
        await ses.send(new SendEmailCommand({
          Destination: {
            ToAddresses: [claims.email],
          },
          Message: {
            Body: {
              Text: {
                Data: `Your code is ${code}`,
              },
            },
            Subject: {
              Data: "Your SST Auth pin code",
            },
          },
          Source: "frank@sst.dev",
        }));
        useResponse()
          //.header("Content-Type", "text/html")
          //.body(`<html><body>
          //<a href="/auth/email/callback?code=${code}">Next</a>
          //</body></html>`)
          .redirect(`${siteUrl}/login/verify`);
      },
      //onFail: async (error) => {
      //  useResponse()
      //    .code(500)
      //    .body(error.type);
      //},
      onSuccess: async (claims) => {
        // Look up user
        const ddb = new DynamoDBClient({});
        const queryResult = await ddb.send(new QueryCommand({
          TableName: Table.users.tableName,
          IndexName: 'email',
          KeyConditionExpression: 'email = :email',
          ExpressionAttributeValues: marshall({
            ':email': claims.email,
          }),
        }));

        // Create user if not found
        const user = queryResult.Items?.[0];
        let userID: string;
        if (user) {
          userID = unmarshall(user).userID;
        }
        else {
          userID = randomBytes(16).toString("hex");
          await ddb.send(new PutItemCommand({
            TableName: Table.users.tableName,
            Item: marshall({
              userID,
              email: claims.email,
            }),
          }));
        }
        useResponse()
          .sessionCookie({
            type: "user",
            properties: { userID },
          }, {
            expires: new Date(Date.now() + 1000 * 60 * 30),
          })
          .redirect(siteUrl);
        //.header("Content-Type", "text/html")
        //.body(`
        //<html><body>
        //<a href="${siteUrl}">Next</a>
        //</body></html>`)
      },
    }),
  },
});