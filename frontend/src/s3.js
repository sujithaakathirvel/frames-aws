import { S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "eu-west-2",
  credentials: {
    accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY,
    secretAccessKey: process.env.REACT_APP_AWS_SECRET_KEY,
  },
  forcePathStyle: true,
});

export default s3;