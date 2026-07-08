import OpenAI, { toFile } from 'openai';
import type { Moderation, OutputFormat } from '@photo-gen/shared';

export const MODEL = 'gpt-image-2';

let client: OpenAI | null = null;

/** Shared client for every OpenAI call the server makes (images and text). */
export function getOpenAIClient(): OpenAI {
  return getClient();
}

function getClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    client = new OpenAI({
      timeout: 600_000, // generations can take ~2 minutes; leave lots of headroom
      maxRetries: 0, // the job queue owns retries so attempts get recorded
    });
  }
  return client;
}

export interface ImageCallParams {
  prompt: string;
  size: string; // 'auto' or 'WxH'
  quality: string;
  n: number;
  outputFormat: OutputFormat;
  outputCompression?: number;
  moderation: Moderation;
  signal?: AbortSignal;
  /** >0 with onPartial enables streaming partial previews (generations endpoint, n=1). */
  partialImages?: number;
  onPartial?: (bytes: Buffer, index: number) => void;
}

export interface InputImage {
  bytes: Buffer;
  name: string;
  mimeType: string;
}

export interface ImageCallResult {
  images: Buffer[];
  usage: unknown;
}

// The SDK's size/quality unions may lag behind gpt-image-2's arbitrary-size
// support, so params are cast through this single narrow seam.
type LooseParams = Record<string, unknown>;

export async function generateImages(params: ImageCallParams): Promise<ImageCallResult> {
  const body: LooseParams = {
    model: MODEL,
    prompt: params.prompt,
    size: params.size,
    quality: params.quality,
    n: params.n,
    output_format: params.outputFormat,
    moderation: params.moderation,
  };
  if (params.outputCompression !== undefined && params.outputFormat !== 'png') {
    body.output_compression = params.outputCompression;
  }

  const streaming = (params.partialImages ?? 0) > 0 && params.n === 1 && params.onPartial;
  if (streaming) {
    body.stream = true;
    body.partial_images = params.partialImages;
    const stream = (await getClient().images.generate(
      body as unknown as Parameters<OpenAI['images']['generate']>[0],
      { signal: params.signal },
    )) as unknown as AsyncIterable<{
      type: string;
      b64_json?: string;
      partial_image_index?: number;
      usage?: unknown;
    }>;
    let final: Buffer | null = null;
    let usage: unknown = null;
    for await (const event of stream) {
      if (event.type === 'image_generation.partial_image' && event.b64_json) {
        params.onPartial!(Buffer.from(event.b64_json, 'base64'), event.partial_image_index ?? 0);
      } else if (event.type === 'image_generation.completed' && event.b64_json) {
        final = Buffer.from(event.b64_json, 'base64');
        usage = event.usage ?? null;
      }
    }
    if (!final) throw new Error('Streamed generation ended without a completed image');
    return { images: [final], usage };
  }

  // Cast through unknown: stream is not set here, so the result is a plain ImagesResponse.
  const res = (await getClient().images.generate(
    body as unknown as Parameters<OpenAI['images']['generate']>[0],
    { signal: params.signal },
  )) as OpenAI.Images.ImagesResponse;
  return extractImages(res);
}

export interface EditCallParams extends ImageCallParams {
  inputImages: InputImage[]; // ordered; mask applies to the first
  mask?: InputImage;
}

export async function editImages(params: EditCallParams): Promise<ImageCallResult> {
  const image = await Promise.all(
    params.inputImages.map((img) => toFile(img.bytes, img.name, { type: img.mimeType })),
  );
  const body: LooseParams = {
    model: MODEL,
    prompt: params.prompt,
    image,
    size: params.size,
    quality: params.quality,
    n: params.n,
    output_format: params.outputFormat,
    moderation: params.moderation,
  };
  if (params.mask) {
    body.mask = await toFile(params.mask.bytes, params.mask.name, { type: params.mask.mimeType });
  }
  if (params.outputCompression !== undefined && params.outputFormat !== 'png') {
    body.output_compression = params.outputCompression;
  }
  const res = (await getClient().images.edit(
    body as unknown as Parameters<OpenAI['images']['edit']>[0],
    { signal: params.signal },
  )) as OpenAI.Images.ImagesResponse;
  return extractImages(res);
}

function extractImages(res: OpenAI.Images.ImagesResponse): ImageCallResult {
  const images = (res.data ?? [])
    .map((d) => d.b64_json)
    .filter((b64): b64 is string => typeof b64 === 'string')
    .map((b64) => Buffer.from(b64, 'base64'));
  if (images.length === 0) {
    throw new Error('API response contained no image data');
  }
  return { images, usage: (res as { usage?: unknown }).usage ?? null };
}

export interface ModerationDetails {
  moderation_stage?: string;
  categories?: string[];
}

export interface ClassifiedError {
  retryable: boolean;
  code: string | null;
  message: string;
  moderationDetails: ModerationDetails | null;
}

export function classifyError(err: unknown): ClassifiedError {
  // APIConnectionError extends APIError — check it first so network drops stay retryable.
  if (err instanceof OpenAI.APIConnectionError) {
    return { retryable: true, code: 'connection_error', message: err.message, moderationDetails: null };
  }
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 0;
    const body = (err.error ?? {}) as Record<string, unknown>;
    const code = (typeof err.code === 'string' ? err.code : null) ?? (body.code as string | null) ?? null;
    const moderationDetails =
      (body.moderation_details as ModerationDetails | undefined) ??
      ((err as unknown as Record<string, unknown>).moderation_details as
        | ModerationDetails
        | undefined) ??
      null;
    return {
      // 429 and server-side failures are transient; everything else needs a changed request
      retryable: status === 429 || status >= 500,
      code,
      message: err.message,
      moderationDetails,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { retryable: false, code: null, message, moderationDetails: null };
}
