import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CharacterDto,
  CharacterViewDto,
  CostSummaryDto,
  FolderDto,
  GenerateAcceptedDto,
  GenerationDto,
  ImageDetailDto,
  ImagePageDto,
  ProjectDto,
  ProjectStatsDto,
  Settings,
  TagDto,
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

export function useGenerations(opts: {
  statuses?: string[];
  project?: number;
  character?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (opts.statuses?.length) params.set('status', opts.statuses.join(','));
  if (opts.project !== undefined) params.set('project', String(opts.project));
  if (opts.character !== undefined) params.set('character', String(opts.character));
  if (opts.limit) params.set('limit', String(opts.limit));
  return useQuery({
    queryKey: ['generations', opts],
    queryFn: () => api<GenerationDto[]>(`/api/generations?${params}`),
  });
}

// ---------- characters ----------

export function useCharacters(projectId: number | undefined) {
  return useQuery({
    queryKey: ['characters', projectId],
    queryFn: () => api<CharacterDto[]>(`/api/characters?project=${projectId}`),
    enabled: projectId !== undefined,
  });
}

export function useCharacter(id: number | undefined) {
  return useQuery({
    queryKey: ['characters', 'detail', id],
    queryFn: () => api<CharacterDto>(`/api/characters/${id}`),
    enabled: id !== undefined,
  });
}

export function useCreateCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { projectId: number; name: string; description: string; styleNotes: string }) =>
      api<CharacterDto>('/api/characters', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['characters'] }),
  });
}

export function usePatchCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: number; name?: string; description?: string; styleNotes?: string }) =>
      api<CharacterDto>(`/api/characters/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['characters'] }),
  });
}

export function useDeleteCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/characters/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['characters'] }),
  });
}

export function useCreateView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      characterId,
      ...payload
    }: {
      characterId: number;
      slot: string;
      label: string;
      promptHint?: string;
      sortOrder?: number;
    }) =>
      api<CharacterViewDto>(`/api/characters/${characterId}/views`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['characters'] }),
  });
}

export function useDeleteView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (viewId: number) => api<void>(`/api/character-views/${viewId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['characters'] }),
  });
}

export function useGenerateView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      viewId,
      ...payload
    }: {
      viewId: number;
      extraPrompt?: string;
      size?: string;
      quality?: string;
      n?: number;
    }) =>
      api<GenerateAcceptedDto>(`/api/character-views/${viewId}/generate`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['generations'] }),
  });
}

export function useApproveView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ viewId, imageId }: { viewId: number; imageId: string | null }) =>
      api<CharacterViewDto>(`/api/character-views/${viewId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ imageId }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['characters'] }),
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
  baseImageId?: string;
  maskImageId?: string;
  maskDataUrl?: string;
  promoteFromImageId?: string;
}

export function useGenerationDetail(id: number | undefined) {
  return useQuery({
    queryKey: ['generations', 'detail', id],
    queryFn: () => api<GenerationDto>(`/api/generations/${id}`),
    enabled: id !== undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 2_000 : false;
    },
  });
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

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      api<ProjectDto>('/api/projects', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useProjectStats(projectId: number | undefined) {
  return useQuery({
    queryKey: ['projects', projectId, 'stats'],
    queryFn: () => api<ProjectStatsDto>(`/api/projects/${projectId}/stats`),
    enabled: projectId !== undefined,
  });
}

export function useFolders(projectId: number | undefined) {
  return useQuery({
    queryKey: ['folders', projectId],
    queryFn: () => api<FolderDto[]>(`/api/projects/${projectId}/folders`),
    enabled: projectId !== undefined,
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { projectId: number; name: string }) =>
      api<FolderDto>('/api/folders', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useTags() {
  return useQuery({ queryKey: ['tags'], queryFn: () => api<TagDto[]>('/api/tags') });
}

export function usePatchImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Record<string, unknown>) =>
      api<ImageDetailDto>(`/api/images/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['images'] });
      void queryClient.invalidateQueries({ queryKey: ['images', 'detail', vars.id] });
    },
  });
}

export function useDeleteImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hard }: { id: string; hard?: boolean }) =>
      api<void>(`/api/images/${id}${hard ? '?hard=true' : ''}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['images'] }),
  });
}

export function useAddImageTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ imageId, name }: { imageId: string; name: string }) =>
      api<TagDto>(`/api/images/${imageId}/tags`, { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['images'] });
      void queryClient.invalidateQueries({ queryKey: ['images', 'detail', vars.imageId] });
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useRemoveImageTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ imageId, tagId }: { imageId: string; tagId: number }) =>
      api<void>(`/api/images/${imageId}/tags/${tagId}`, { method: 'DELETE' }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['images'] });
      void queryClient.invalidateQueries({ queryKey: ['images', 'detail', vars.imageId] });
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      folderId,
      files,
    }: {
      projectId: number;
      folderId?: number;
      files: File[];
    }) => {
      const form = new FormData();
      form.set('projectId', String(projectId));
      if (folderId !== undefined) form.set('folderId', String(folderId));
      for (const file of files) form.append('files', file);
      const res = await fetch('/api/import', { method: 'POST', body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Import failed (${res.status})`);
      }
      return (await res.json()) as { imported: unknown[]; failed: { filename: string; error: string }[] };
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['images'] }),
  });
}

export function useCostSummary(filters: { project?: number; from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (filters.project !== undefined) params.set('project', String(filters.project));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return useQuery({
    queryKey: ['costs', filters],
    queryFn: () => api<CostSummaryDto>(`/api/costs/summary?${params}`),
  });
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/settings') });
}

export function usePatchSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) =>
      api<Settings>('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (data) => queryClient.setQueryData(['settings'], data),
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
