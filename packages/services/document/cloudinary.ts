import { v2 as cloudinary } from "cloudinary";

// how long a link to a stored file works
const LINK_SECONDS = 15 * 60;

// the account, from CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET; null until they're set
function configured() {
  const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = process.env;
  if (!cloud_name || !api_key || !api_secret) return null;
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return cloudinary;
}

// keeps a file privately (it opens only through a signed link) and never replaces one already there: an attempt run
// twice finds the first file
export function storeFile(key: string, file: Buffer) {
  const account = configured();
  if (!account) throw new Error("Cloudinary isn't set up: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are needed.");
  return new Promise<void>((resolve, reject) => {
    account.uploader
      .upload_stream({ resource_type: "raw", type: "authenticated", public_id: key, overwrite: false }, (error, result) => {
        if (error || !result) reject(new Error(error?.message ?? "Cloudinary returned nothing."));
        else resolve();
      })
      .end(file);
  });
}

// a short-lived link to a stored file; made here without calling Cloudinary
export function fileLink(key: string) {
  const account = configured();
  if (!account) return null;
  return account.utils.private_download_url(key, "", {
    resource_type: "raw",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + LINK_SECONDS,
  });
}
