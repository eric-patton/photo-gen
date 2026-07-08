import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type {
  ImproveEffort,
  ImprovePromptRequest,
  ImproveResultDto,
  ImproveSpeed,
} from '@photo-gen/shared';
import { IMPROVER_MODELS } from '@photo-gen/shared';
import { api } from '../../api/client';

const EFFORTS: ImproveEffort[] = ['none', 'low', 'medium', 'high', 'xhigh'];

type Props =
  | {
      mode: 'generation';
      prompt: string;
      onApply: (improvedPrompt: string) => void;
    }
  | {
      mode: 'character';
      character: { name: string; description: string; styleNotes: string };
      onApply: (result: { description: string; styleNotes: string }) => void;
    };

/** "Improve" button + Fast/Smart and effort pickers + apply/dismiss suggestion card. */
export default function PromptImprover(props: Props) {
  const [speed, setSpeed] = useState<ImproveSpeed>('fast');
  const [effort, setEffort] = useState<ImproveEffort>('medium');
  const [result, setResult] = useState<ImproveResultDto | null>(null);

  const improve = useMutation({
    mutationFn: (payload: ImprovePromptRequest) =>
      api<ImproveResultDto>('/api/improve-prompt', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: setResult,
  });

  const hasInput =
    props.mode === 'generation'
      ? props.prompt.trim().length > 0
      : (props.character.description + props.character.styleNotes).trim().length > 0;

  const run = () => {
    if (!hasInput || improve.isPending) return;
    setResult(null);
    improve.mutate(
      props.mode === 'generation'
        ? { mode: 'generation', prompt: props.prompt.trim(), speed, effort }
        : { mode: 'character', character: props.character, speed, effort },
    );
  };

  const apply = () => {
    if (!result) return;
    if (props.mode === 'generation' && result.mode === 'generation') {
      props.onApply(result.improvedPrompt);
    } else if (props.mode === 'character' && result.mode === 'character') {
      props.onApply({ description: result.description, styleNotes: result.styleNotes });
    }
    setResult(null);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={run}
          disabled={!hasInput || improve.isPending}
          title={hasInput ? 'Ask a language model to improve this text' : 'Write something first'}
          className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 hover:border-indigo-500 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {improve.isPending ? 'Improving…' : '✨ Improve'}
        </button>
        <select
          value={speed}
          onChange={(e) => setSpeed(e.target.value as ImproveSpeed)}
          title={`Fast = ${IMPROVER_MODELS.fast.id}, Smart = ${IMPROVER_MODELS.smart.id}`}
          className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-[11px] text-neutral-400"
        >
          <option value="fast">Fast</option>
          <option value="smart">Smart</option>
        </select>
        <select
          value={effort}
          onChange={(e) => setEffort(e.target.value as ImproveEffort)}
          title="Reasoning effort — higher thinks longer and costs more"
          className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-[11px] text-neutral-400"
        >
          {EFFORTS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        {improve.isError && <span className="text-[11px] text-red-400">{improve.error.message}</span>}
      </div>

      {result && (
        <div className="mt-2 rounded-md border border-indigo-900/60 bg-indigo-950/20 p-2.5">
          {result.mode === 'generation' ? (
            <p className="whitespace-pre-wrap text-xs text-neutral-200">{result.improvedPrompt}</p>
          ) : (
            <div className="space-y-2">
              <SuggestionBlock label="Description" text={result.description} />
              <SuggestionBlock label="Style notes" text={result.styleNotes} />
            </div>
          )}
          {result.notes && <p className="mt-1.5 text-[11px] italic text-indigo-300/80">{result.notes}</p>}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setResult(null)}
              className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 hover:border-neutral-500"
            >
              Dismiss
            </button>
            <button
              onClick={apply}
              className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
            >
              Use suggestion
            </button>
            <span className="ml-auto text-[10px] text-neutral-600">
              {result.model} · {effort}
              {result.costUsd != null && ` · $${result.costUsd.toFixed(4)}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-indigo-400/70">{label}</div>
      <p className="whitespace-pre-wrap text-xs text-neutral-200">{text}</p>
    </div>
  );
}
