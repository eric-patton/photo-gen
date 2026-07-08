-- Split the single 'side' view into left/right so asymmetrical characters
-- (shoulder pads, scars, weapons on one hip) get both profiles.
UPDATE character_views SET slot = 'side_left', label = 'Side (left)'
WHERE slot = 'side';

UPDATE character_views SET sort_order = 4
WHERE slot = 'back' AND sort_order = 3;

INSERT INTO character_views (character_id, slot, label, prompt_hint, sort_order)
SELECT c.id, 'side_right', 'Side (right)', '', 3
FROM characters c
WHERE EXISTS (
  SELECT 1 FROM character_views cv WHERE cv.character_id = c.id AND cv.slot = 'side_left'
)
AND NOT EXISTS (
  SELECT 1 FROM character_views cv WHERE cv.character_id = c.id AND cv.slot = 'side_right'
);

-- Backfill exact costs from the stored usage of past generations, at the
-- published gpt-image-2 rates per 1M tokens: text in $5, image in $8, output $30.
UPDATE generations
SET cost_actual = (
    COALESCE(json_extract(usage_json, '$.input_tokens_details.text_tokens'), 0) * 5.0
  + COALESCE(json_extract(usage_json, '$.input_tokens_details.image_tokens'), 0) * 8.0
  + COALESCE(json_extract(usage_json, '$.output_tokens'), 0) * 30.0
) / 1000000.0
WHERE usage_json IS NOT NULL
  AND status = 'succeeded'
  AND cost_actual IS NULL;
