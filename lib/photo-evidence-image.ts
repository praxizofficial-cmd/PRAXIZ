import sharp from "sharp";

// Vinext's optional Sharp shim declares an unknown default export. This
// server-only boundary describes the small, tested decoder surface we use.
type Decoder = {
  metadata(): Promise<{ pages?: number; width?: number; height?: number; autoOrient?: { width: number; height: number } }>;
  rotate(): Decoder;
  webp(options: { quality: number }): Decoder;
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
};
const decodeImage = sharp as (input: Buffer, options: { failOn: string; limitInputPixels: number }) => Decoder;

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Fully decode and re-encode uploads so EXIF/GPS and trailing payloads are absent. */
export async function preparePhotoEvidence(bytes: Uint8Array, declaredMime: string) {
  if (!bytes.length || bytes.length > PHOTO_MAX_BYTES)
    throw new Error("Choose an image no larger than 5 MB.");
  const input = Buffer.from(bytes);
  const signature = input.subarray(0, 12);
  const mime = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
    ? "image/jpeg"
    : signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "image/png"
      : signature.subarray(0, 4).toString() === "RIFF" && signature.subarray(8, 12).toString() === "WEBP"
        ? "image/webp" : null;
  if (!mime || declaredMime !== mime)
    throw new Error("Choose a valid JPEG, PNG, or WebP image with a matching file type.");
  const decoder = decodeImage(input, { failOn: "warning", limitInputPixels: 40_000_000 });
  const metadata = await decoder.metadata();
  if ((metadata.pages ?? 1) !== 1)
    throw new Error("Animated or multi-page images are not supported.");
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  if (width < 320 || height < 240 || width > 12000 || height > 12000)
    throw new Error("Use an image at least 320 × 240 pixels and at most 12000 pixels on each side.");
  // A new immutable object is stored for each upload or replacement.
  const { data, info } = await decoder.rotate().webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
  if (data.length > PHOTO_MAX_BYTES)
    throw new Error("The processed image exceeds 5 MB. Choose a smaller image.");
  return { bytes: data, mimeType: "image/webp" as const, width: info.width, height: info.height };
}
