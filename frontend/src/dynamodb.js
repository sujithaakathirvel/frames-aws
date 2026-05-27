import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const dynamodb = new DynamoDBClient({
  region: "eu-west-2",
  credentials: {
    accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY,
    secretAccessKey: process.env.REACT_APP_AWS_SECRET_KEY,
  },
});

export default dynamodb;