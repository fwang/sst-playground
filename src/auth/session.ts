import { Table } from "@serverless-stack/node/table";
import { useResponse, ApiHandler } from "@serverless-stack/node/api";
import { useSession } from "@serverless-stack/node/auth";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

export const handler = ApiHandler(async () => {
  const session = useSession();

  console.log({ session });
  // Check user is authenticated
  if (session.type !== "user") {
    throw new Error("Not authenticated");
  }

  const ddb = new DynamoDBClient({});
  const data = await ddb.send(
    new GetItemCommand({
      TableName: Table.users.tableName,
      Key: marshall({
        userID: session.properties.userID,
      }),
    })
  );

  useResponse().json(unmarshall(data.Item!));
});