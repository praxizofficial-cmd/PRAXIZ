import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { preparePhotoEvidence, PHOTO_MAX_BYTES } from "../lib/photo-evidence-image.ts";

test("photo validation decodes supported formats and removes private metadata", async () => {
  for (const [format, mime] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]) {
    const source = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#245" } })
      .withMetadata().toFormat(format).toBuffer();
    const result = await preparePhotoEvidence(source, mime);
    const metadata = await sharp(result.bytes).metadata();
    assert.equal(result.width, 640);
    assert.equal(result.height, 480);
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
  }
});

test("photo validation rejects spoofed, corrupt, tiny, and oversized uploads", async () => {
  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(preparePhotoEvidence(png, "image/jpeg"), /matching file type/);
  await assert.rejects(preparePhotoEvidence(Buffer.from("<svg></svg>"), "image/png"));
  await assert.rejects(preparePhotoEvidence(png.subarray(0, 32), "image/png"));
  await assert.rejects(preparePhotoEvidence(Buffer.alloc(PHOTO_MAX_BYTES + 1), "image/png"), /5 MB/);
  const tiny = await sharp({ create: { width: 100, height: 100, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(preparePhotoEvidence(tiny, "image/png"), /320/);
});
