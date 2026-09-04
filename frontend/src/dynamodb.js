import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { fetchAuthSession } from "aws-amplify/auth";

const dynamodb = new DynamoDBClient({
  region: "eu-west-2",
  credentials: async () => {
    const { credentials } = await fetchAuthSession();

    if (!credentials) {
      throw new Error("No Cognito credentials available");
    }

    return credentials;
  },
});

export default dynamodb;
