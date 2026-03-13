import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Per DO documentation: region must be "us-east-1" for the SDK;
// the actual datacenter is determined by the endpoint value.
const s3Client = new S3Client({
  forcePathStyle: false,
  endpoint: process.env["SPACES_ENDPOINT"] as string,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env["SPACES_KEY"] as string,
    secretAccessKey: process.env["SPACES_SECRET"] as string,
  },
});

export async function uploadToSpaces(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env["SPACES_BUCKET"] as string,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read",
    }),
  );
  return `${process.env["SPACES_CDN_BASE_URL"]}/${key}`;
}
