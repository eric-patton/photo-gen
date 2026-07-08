import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  GenerateAcceptedDto,
  GenerationDto,
  ImageDetailDto,
  ImagePageDto,
  ProjectDto,
} from '@photo-gen/shared';
import { api } from './client';

export interface ImageFilters {
  project?: number;
  folder?: number;
  source?: string;
  starred?: boolean;
  q?: string;
  tags?: number[];
  character?: number;
}

function imageParams(filters: ImageFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.project !== undefined) params.set('project', String(filters.project));
  if (filters.folder !== undefined) params.set('folder', String(filters.folder));
  if (filters.source) params.set('source', filters.source);
  if (filters.starred) params.set('starred', 'true');
  if (filters.q) params.set('q', filters.q);
  if (filters.tags?.length) params.set('tags', filters.tags.join(','));
  if (filters.character !== undefined) params.set('character', String(filters.character));
  return params;
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api<ProjectDto[]>('/api/projects'),
  });
}

export function useImages(filters: ImageFilters) {
  return useInfiniteQuery({
    queryKey: ['images', filters],
    queryFn: ({ pageParam }) => {
      const params = imageParams(filters);
      params.set('limit', '100');
      if (pageParam) params.set('cursor', pageParam);
      return api<ImagePageDto>(`/api/images?${params}`);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useImageDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['images', 'detail', id],
    queryFn: () => api<ImageDetailDto>(`/api/images/${id}`),
    enabled: !!id,
  });
}

export function useGenerations(opts: { statuses?: string[]; project?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (opts.statuses?.length) params.set('status', opts.statuses.join(','));
  if (opts.project !== undefined) params.set('project', String(opts.project));
  if (opts.limit) params.set('limit', String(opts.limit));
  return useQuery({
    queryKey: ['generations', opts],
    queryFn: () => api<GenerationDto[]>(`/api/generations?${params}`),
  });
}

export interface GeneratePayload {
  projectId: number;
  folderId?: number;
  prompt: string;
  size: string;
  quality: string;
  n: number;
  outputFormat?: string;
  referenceImageIds?: string[];
  maskImageId?: string;
  maskDataUrl?: string;
  characterViewId?: number;
  promoteFromImageId?: string;
}

export function useGenerate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: GeneratePayload) =>
      api<GenerateAcceptedDto>('/api/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['generations'] });
    },
  });
}

export function useCancelGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (generationId: number) =>
      api<{ ok: boolean }>(`/api/generations/${generationId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['generations'] });
    },
  });
}
