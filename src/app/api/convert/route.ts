import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_BYTES = Math.floor(4.45 * 1024 * 1024);
const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 12_000;
const formats = ["jpeg", "png", "webp", "avif"] as const;
type OutputFormat = (typeof formats)[number];

const contentTypes: Record<OutputFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

const extensions: Record<OutputFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
};

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      analytics: false,
      prefix: "webimgick:convert",
    })
  : null;

const localRateLimit = new Map<string, { count: number; reset: number }>();

function jsonError(message: string, status: number, code: string, headers?: HeadersInit) {
  return Response.json(
    { error: message, code },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

function getClientIp(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

async function checkRateLimit(request: Request) {
  const ip = getClientIp(request);

  if (ratelimit) return ratelimit.limit(ip);

  const now = Date.now();
  const current = localRateLimit.get(ip);
  if (!current || current.reset <= now) {
    localRateLimit.set(ip, { count: 1, reset: now + 60_000 });
    return { success: true, reset: now + 60_000, remaining: 9, limit: 10 };
  }

  current.count += 1;
  return {
    success: current.count <= 10,
    reset: current.reset,
    remaining: Math.max(0, 10 - current.count),
    limit: 10,
  };
}

function parseDimension(value: FormDataEntryValue | null) {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_SIDE
    ? parsed
    : null;
}

function safeBaseName(name: string) {
  const withoutExtension = name.replace(/\.[^/.]+$/, "");
  const sanitized = withoutExtension.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.slice(0, 80) || "image";
}

export async function POST(request: Request) {
  const rate = await checkRateLimit(request);
  if (!rate.success) {
    const retryAfter = Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000));
    return jsonError(
      `Too many conversions. Try again in ${retryAfter} seconds.`,
      429,
      "RATE_LIMITED",
      { "Retry-After": String(retryAfter) },
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_BYTES + 64 * 1024) {
    return jsonError("The image exceeds the 4 MB upload limit.", 413, "FILE_TOO_LARGE");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("The upload could not be read.", 400, "INVALID_FORM_DATA");
  }

  const file = formData.get("file");
  const formatValue = formData.get("format");
  const format = typeof formatValue === "string" ? formatValue : "";
  const quality = Number(formData.get("quality"));
  const width = parseDimension(formData.get("width"));
  const height = parseDimension(formData.get("height"));
  const background = String(formData.get("background") || "#ffffff");

  if (!(file instanceof File)) {
    return jsonError("Choose an image to convert.", 400, "FILE_REQUIRED");
  }
  if (file.size > MAX_FILE_BYTES) {
    return jsonError("The image exceeds the 4 MB upload limit.", 413, "FILE_TOO_LARGE");
  }
  if (!formats.includes(format as OutputFormat)) {
    return jsonError("Choose a supported output format.", 400, "INVALID_FORMAT");
  }
  if ((format !== "png" && (!Number.isInteger(quality) || quality < 1 || quality > 100))) {
    return jsonError("Quality must be between 1 and 100.", 400, "INVALID_QUALITY");
  }
  if (width === null || height === null) {
    return jsonError("Dimensions must be whole numbers from 1 to 12,000.", 400, "INVALID_DIMENSIONS");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(background)) {
    return jsonError("JPEG background must be a six-digit hex color.", 400, "INVALID_BACKGROUND");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const input = sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: "error" });

  const metadata = await input.metadata().catch(() => null);
  if (!metadata) {
    return jsonError("The file is not a valid supported image.", 415, "INVALID_IMAGE");
  }

  if (!metadata.format || !formats.includes(metadata.format as OutputFormat)) {
    return jsonError("Only JPEG, PNG, WebP, and AVIF images are supported.", 415, "UNSUPPORTED_FORMAT");
  }

  const sourceWidth = metadata.autoOrient.width ?? metadata.width ?? 0;
  const sourceHeight = metadata.autoOrient.height ?? metadata.height ?? 0;
  if (
    !sourceWidth ||
    !sourceHeight ||
    sourceWidth > MAX_SIDE ||
    sourceHeight > MAX_SIDE ||
    sourceWidth * sourceHeight > MAX_PIXELS
  ) {
    return jsonError(
      "Images are limited to 40 megapixels and 12,000 pixels per side.",
      413,
      "DIMENSIONS_TOO_LARGE",
    );
  }

  try {
    let pipeline = sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: "error" })
      .autoOrient()
      .toColorspace("srgb");

    if (width || height) {
      pipeline = pipeline.resize({
        width,
        height,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const target = format as OutputFormat;
    if (target === "jpeg") {
      pipeline = pipeline.flatten({ background }).jpeg({ quality, mozjpeg: true });
    } else if (target === "png") {
      pipeline = pipeline.png({ compressionLevel: 6 });
    } else if (target === "webp") {
      pipeline = pipeline.webp({ quality, effort: 4 });
    } else {
      pipeline = pipeline.avif({ quality, effort: 4 });
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    if (data.byteLength > MAX_OUTPUT_BYTES) {
      return jsonError(
        "The converted image is too large to return from Vercel. Reduce its dimensions or quality.",
        413,
        "OUTPUT_TOO_LARGE",
      );
    }

    const filename = `${safeBaseName(file.name)}-converted.${extensions[target]}`;
    return new Response(new Uint8Array(data), {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(data.byteLength),
        "Content-Type": contentTypes[target],
        "X-Image-Width": String(info.width),
        "X-Image-Height": String(info.height),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Image conversion failed", error instanceof Error ? error.message : error);
    return jsonError("The image could not be converted. Try a smaller image.", 422, "CONVERSION_FAILED");
  }
}
