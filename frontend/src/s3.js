import { S3Client } from "@aws-sdk/client-s3";
import { fetchAuthSession } from "aws-amplify/auth";

const s3 = new S3Client({
  region: "eu-west-2",
  credentials: async () => {
    const { credentials } = await fetchAuthSession();

    if (!credentials) {
      throw new Error("No Cognito credentials available");
    }

    return credentials;
  },
});

export default s3;