import { ART_STYLES } from '@photo-gen/shared';

/**
 * Row of one-click video-game art-style presets. Clicking a chip sets the
 * target field (usually a character's style notes) to that style's prompt.
 */
export default function StylePresetPicker({
  activePrompt,
  onPick,
}: {
  /** Current style-notes text; a chip highlights when it matches exactly. */
  activePrompt: string;
  onPick: (prompt: string, label: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ART_STYLES.map((style) => {
        const active = activePrompt.trim() === style.prompt;
        const games = style.games.map((g) => g.title).join(', ');
        return (
          <button
            key={style.id}
            type="button"
            onClick={() => onPick(style.prompt, style.label)}
            title={`${style.description}${games ? `\n\nLike: ${games}` : ''}`}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
              active
                ? 'border-indigo-500 bg-indigo-950/60 text-indigo-300'
                : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
            }`}
          >
            {style.label}
          </button>
        );
      })}
    </div>
  );
}
