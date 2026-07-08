import type { GenerationDto } from '@photo-gen/shared';
import type { GeneratePayload } from '../api/queries';

const PROMOTE_INSTRUCTION =
  'Keep the composition, subject, and colors of the base image identical; increase detail, sharpness, and rendering quality.';

/** High-quality re-run of one candidate. A character-view candidate's result auto-approves into its slot. */
export function promotePayload(gen: GenerationDto, imageId: string): GeneratePayload {
  const userPrompt = gen.userPrompt.trim();
  return {
    projectId: gen.projectId,
    prompt: userPrompt ? `${userPrompt}. ${PROMOTE_INSTRUCTION}` : PROMOTE_INSTRUCTION,
    size: gen.params.size,
    quality: 'high',
    n: 1,
    promoteFromImageId: imageId,
  };
}
