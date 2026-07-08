import { z } from 'zod';
import { validateSize } from './size-rules';

// ---------- enums ----------

export const qualitySchema = z.enum(['low', 'medium', 'high', 'auto']);
export const outputFormatSchema = z.enum(['png', 'jpeg', 'webp']);
export const moderationSchema = z.enum(['auto', 'low']);
export const imageSourceSchema = z.enum(['generated', 'imported', 'mask']);
export const generationStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'canceled']);

export type OutputFormat = z.infer<typeof outputFormatSchema>;
export type Moderation = z.infer<typeof moderationSchema>;
export type ImageSource = z.infer<typeof imageSourceSchema>;
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const sizeSchema = z.string().check((ctx) => {
  const result = validateSize(ctx.value);
  for (const error of result.errors) {
    ctx.issues.push({ code: 'custom', message: error, input: ctx.value });
  }
});

// ---------- requests ----------

export const generateRequestSchema = z.object({
  projectId: z.number().int().positive(),
  folderId: z.number().int().positive().optional(),
  prompt: z.string().min(1).max(32_000),
  size: sizeSchema.default('auto'),
  quality: qualitySchema.default('auto'),
  n: z.number().int().min(1).max(8).default(1),
  outputFormat: outputFormatSchema.default('png'),
  outputCompression: z.number().int().min(0).max(100).optional(),
  referenceImageIds: z.array(z.string().min(1)).max(8).optional(),
  baseImageId: z.string().min(1).optional(),
  maskImageId: z.string().min(1).optional(),
  maskDataUrl: z.string().startsWith('data:image/png;base64,').optional(),
  characterViewId: z.number().int().positive().optional(),
  promoteFromImageId: z.string().min(1).optional(),
});
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export const projectUpsertSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).default(''),
});

export const projectPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  archived: z.boolean().optional(),
});

export const folderUpsertSchema = z.object({
  projectId: z.number().int().positive(),
  name: z.string().min(1).max(200),
});

export const tagUpsertSchema = z.object({
  name: z.string().min(1).max(100),
});

export const imagePatchSchema = z.object({
  title: z.string().max(500).optional(),
  notes: z.string().max(10_000).optional(),
  folderId: z.number().int().positive().nullable().optional(),
  starred: z.boolean().optional(),
});

export const characterUpsertSchema = z.object({
  projectId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  description: z.string().max(8000).default(''),
  styleNotes: z.string().max(4000).default(''),
});

export const characterViewUpsertSchema = z.object({
  slot: z.string().min(1).max(100),
  label: z.string().min(1).max(300),
  promptHint: z.string().max(2000).default(''),
  sortOrder: z.number().int().default(0),
});

export const characterViewGenerateSchema = z.object({
  extraPrompt: z.string().max(8000).default(''),
  size: sizeSchema.default('1024x1536'),
  quality: qualitySchema.default('medium'),
  n: z.number().int().min(1).max(8).default(1),
  extraRefIds: z.array(z.string().min(1)).max(4).optional(),
});

export const settingsPatchSchema = z
  .object({
    defaultQuality: qualitySchema,
    defaultSize: sizeSchema,
    defaultOutputFormat: outputFormatSchema,
    moderation: moderationSchema,
    queueConcurrency: z.number().int().min(1).max(8),
    partialImages: z.number().int().min(0).max(3),
    textInputTokenPriceUsd: z.number().min(0),
    imageInputTokenPriceUsd: z.number().min(0),
    outputTokenPriceUsd: z.number().min(0),
  })
  .partial();
export type Settings = Required<z.infer<typeof settingsPatchSchema>>;

export const DEFAULT_SETTINGS: Settings = {
  defaultQuality: 'auto',
  defaultSize: 'auto',
  defaultOutputFormat: 'png',
  moderation: 'auto',
  queueConcurrency: 2,
  partialImages: 2,
  // gpt-image-2 published prices per 1M tokens: text in $5, image in $8, output $30.
  // Setting the output rate to 0 disables cost_actual computation.
  textInputTokenPriceUsd: 5 / 1_000_000,
  imageInputTokenPriceUsd: 8 / 1_000_000,
  outputTokenPriceUsd: 30 / 1_000_000,
};

// ---------- prompt improver ----------

export const improveSpeedSchema = z.enum(['fast', 'smart']);
export const improveEffortSchema = z.enum(['none', 'low', 'medium', 'high', 'xhigh']);
export type ImproveEffort = z.infer<typeof improveEffortSchema>;

export const improvePromptRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('generation'),
    prompt: z.string().min(1).max(32_000),
    projectId: z.number().int().positive().optional(),
    speed: improveSpeedSchema.default('fast'),
    effort: improveEffortSchema.default('medium'),
  }),
  z.object({
    mode: z.literal('character'),
    character: z.object({
      name: z.string().max(200).default(''),
      description: z.string().max(8_000).default(''),
      styleNotes: z.string().max(4_000).default(''),
    }),
    projectId: z.number().int().positive().optional(),
    speed: improveSpeedSchema.default('fast'),
    effort: improveEffortSchema.default('medium'),
  }),
]);
export type ImprovePromptRequest = z.infer<typeof improvePromptRequestSchema>;

export interface ImproveGenerationResultDto {
  mode: 'generation';
  improvedPrompt: string;
  notes: string;
  model: string;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ImproveCharacterResultDto {
  mode: 'character';
  description: string;
  styleNotes: string;
  notes: string;
  model: string;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type ImproveResultDto = ImproveGenerationResultDto | ImproveCharacterResultDto;

export interface ImprovementDto {
  id: number;
  projectId: number | null;
  mode: 'generation' | 'character';
  model: string;
  speed: 'fast' | 'smart';
  effort: ImproveEffort;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  createdAt: string;
}

// ---------- DTOs (server -> client) ----------

export interface ProjectDto {
  id: number;
  name: string;
  description: string;
  archived: boolean;
  createdAt: string;
}

export interface ProjectStatsDto {
  imageCount: number;
  generationCount: number;
  costTotal: number;
}

export interface FolderDto {
  id: number;
  projectId: number;
  name: string;
}

export interface TagDto {
  id: number;
  name: string;
  usageCount?: number;
}

export interface ImageDto {
  id: string;
  projectId: number;
  folderId: number | null;
  generationId: number | null;
  source: ImageSource;
  width: number;
  height: number;
  format: OutputFormat;
  sizeBytes: number;
  title: string;
  notes: string;
  starred: boolean;
  createdAt: string;
  tags: TagDto[];
}

export interface GenerationInputDto {
  imageId: string;
  role: 'base' | 'reference' | 'mask';
  position: number;
}

export interface GenerationDto {
  id: number;
  projectId: number;
  characterViewId: number | null;
  endpoint: 'generations' | 'edits';
  prompt: string;
  userPrompt: string;
  params: {
    size: string;
    quality: string;
    n: number;
    outputFormat: OutputFormat;
    outputCompression?: number;
    moderation: Moderation;
    stream: boolean;
    partialImages: number;
    /** Promote of a character-view image: the result auto-approves into the slot. */
    autoApproveView?: boolean;
  };
  status: GenerationStatus;
  errorCode: string | null;
  errorMessage: string | null;
  moderationDetails: { moderation_stage?: string; categories?: string[] } | null;
  costEstimated: number;
  costActual: number | null;
  attempt: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  inputs: GenerationInputDto[];
  outputImageIds: string[];
}

export interface ImagePageDto {
  items: ImageDto[];
  nextCursor: string | null;
}

export interface ImageDetailDto extends ImageDto {
  filePath: string;
  generation: GenerationDto | null;
  usedIn: GenerationDto[];
}

export interface CharacterViewDto {
  id: number;
  characterId: number;
  slot: string;
  label: string;
  promptHint: string;
  approvedImageId: string | null;
  sortOrder: number;
}

export interface CharacterDto {
  id: number;
  projectId: number;
  name: string;
  description: string;
  styleNotes: string;
  createdAt: string;
  views: CharacterViewDto[];
}

export interface CostSummaryDto {
  /** Combined spend: image generations + prompt improvements. */
  total: number;
  imagesTotal: number;
  improveTotal: number;
  improveCount: number;
  byProject: { projectId: number; projectName: string; total: number }[];
  byDay: { day: string; total: number }[];
  byQuality: { quality: string; total: number; count: number }[];
}

export interface GenerateAcceptedDto {
  generationId: number;
  estimatedCost: number;
}

// ---------- SSE events ----------

export type SseEvent =
  | { type: 'generation:queued'; generationId: number }
  | { type: 'generation:started'; generationId: number; attempt: number }
  | { type: 'generation:partial'; generationId: number; partialIndex: number }
  | { type: 'generation:succeeded'; generationId: number; imageIds: string[] }
  | {
      type: 'generation:failed';
      generationId: number;
      errorCode: string | null;
      errorMessage: string;
      moderationDetails: { moderation_stage?: string; categories?: string[] } | null;
    }
  | { type: 'generation:canceled'; generationId: number }
  | { type: 'heartbeat'; at: string };
