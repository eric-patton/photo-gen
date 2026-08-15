// Curated catalog of video-game art styles suited to designing a character that
// will be built in a 3D game. Each entry carries a strong, self-contained prompt
// fragment that steers gpt-image-2 toward that look, a note on how the look is
// actually produced in a 3D pipeline, and example shipping games. The prompt is
// stored as a character's `style_notes` when a style is kept, so downstream view
// generation stays on-style.
//
// Generated from a research workflow; hand-edits here are fine but keep ids stable.

export interface ArtStyleGame {
  /** Shipping game title. */
  title: string;
  /** One line on how this game exemplifies the style. */
  note: string;
}

export interface ArtStyle {
  id: string;
  /** Short name shown in pickers. */
  label: string;
  /** One-line description of the look. */
  description: string;
  /** How this look is actually built in a 3D game (shader / model / texture technique). */
  pipeline: string;
  /** Shipping games that exemplify the style, each with a note. */
  games: ArtStyleGame[];
  /** Prompt fragment appended after the appearance description + framing. */
  prompt: string;
  /** Optional extra steering used only when rendering the neutral sample preview. */
  sampleHint?: string;
}

export const ART_STYLES: ArtStyle[] = [
  {
    "id": "photoreal-aaa",
    "label": "Photoreal AAA",
    "description": "Photorealistic AAA render: PBR materials, real anatomy, cinematic lighting.",
    "pipeline": "High-poly scanned or hand-sculpted meshes bake down to normal/AO/displacement maps driving physically based metallic-roughness materials, with dedicated multi-layer skin shaders (subsurface scattering, micro-normal pores, peach fuzz) and strand-based hair, lit via image-based lighting plus ray-traced or baked global illumination, finished with ACES filmic tonemapping, screen-space/ray-traced reflections, and cinematic depth-of-field/grain in post.",
    "games": [
      {
        "title": "Red Dead Redemption 2",
        "note": "Rockstar's PBR debut: subsurface-scattering skin, weathered leather, painterly-real open-world lighting."
      },
      {
        "title": "The Last of Us Part II",
        "note": "Naughty Dog's benchmark skin/hair shaders: pore-level subsurface scattering, strand-based hair, believable anatomy."
      },
      {
        "title": "Horizon Forbidden West",
        "note": "Guerrilla's Decima engine: deferred texturing and procedural materials render Aloy's skin and hair photoreal."
      },
      {
        "title": "Cyberpunk 2077",
        "note": "REDengine 4's PBR supershader plus ray-traced lighting give Night City's characters cinematic photoreal presence."
      },
      {
        "title": "Assassin's Creed",
        "note": "Ubisoft's photogrammetry-sourced textures and PBR materials ground historical open worlds in tangible realism."
      }
    ],
    "prompt": "Photoreal next-gen AAA game-engine render, in the vein of Red Dead Redemption 2 and The Last of Us Part II: physically based metallic-roughness materials, multi-layered skin shader with subsurface scattering, visible pores and peach fuzz, strand-based hair, anatomically accurate proportions, weathered leather and woven-fiber micro-detail, soft cinematic three-point lighting, shallow depth of field, filmic color grading, subtle film grain, zero stylization or toon shading.",
    "sampleHint": "Render leather, cloth weave, and metal buckles at high texel density with clear roughness variation; keep skin subsurface scattering subtle and matte, never waxy or plastic."
  },
  {
    "id": "dark-fantasy-realism",
    "label": "Dark Fantasy Realism",
    "description": "Grounded, weathered dark-fantasy realism: muted tones, grimy PBR materials, oppressive mood.",
    "pipeline": "Realistic humanoid rig rendered with a full PBR material workflow: Substance Painter-authored albedo/roughness/metalness maps plus baked normal and cavity maps drive scratches, edge-wear, and grime, muted desaturated color grading and low-key deferred lighting (Unreal Engine 5 Lumen or equivalent) sell the oppressive mood, with true-to-life proportions and no stylized exaggeration.",
    "games": [
      {
        "title": "Elden Ring",
        "note": "Realistic proportions and weathered armor define FromSoftware's muted, oppressive open-world template."
      },
      {
        "title": "Dark Souls III",
        "note": "Deliberately desaturated, near-monochrome palette and grimdark tone set the genre's visual template."
      },
      {
        "title": "Bloodborne",
        "note": "Grimy, blood-soaked Victorian-gothic cloth and leather rendered in a muted candlelit palette."
      },
      {
        "title": "Lies of P",
        "note": "UE4 PBR pipeline with Marvelous Designer cloth sim proves the grimy realism ships today."
      },
      {
        "title": "Lords of the Fallen (2023)",
        "note": "UE5 Nanite and Lumen push the same weathered, grounded materials to current-gen fidelity."
      }
    ],
    "prompt": "Rendered as a grounded dark-fantasy game character in the style of Elden Ring and Dark Souls III: photorealistic proportions, physically based materials with scratched steel, cracked leather, and frayed cloth, heavy edge-wear and grime baked into every surface, a muted desaturated palette of ash-grey, rust, and dried blood, low-key overcast lighting, filmic post-processing, oppressive somber mood, no stylization or exaggeration.",
    "sampleHint": "Emphasize scuffed leather straps, dulled steel buckles, and a weather-beaten hood; keep skin naturalistic and slightly grimy, avoid any glossy, saturated, or heroic-fantasy shine."
  },
  {
    "id": "stylized-hero",
    "label": "Stylized Hero (PBR)",
    "description": "Pixar-meets-esports hero look: heroic proportions, art-directed PBR, clean silhouette.",
    "pipeline": "Heroic proportions are exaggerated directly in the base mesh sculpt, then dressed in standard metal/roughness PBR materials whose albedo saturation and roughness ranges are clamped in the art-direction pass, with hand-painted surface detail baked into diffuse and normal maps and a soft fresnel/rim-light shader (not a cel/toon shader) boosting edge readability at gameplay camera distance.",
    "games": [
      {
        "title": "Overwatch",
        "note": "Blizzard's stylized-PBR benchmark: Pixar-like heroic silhouettes, narrowed value and saturation range."
      },
      {
        "title": "Apex Legends",
        "note": "Respawn's own term for the look: GGX spec-gloss PBR plus toon edge-lines for grit-and-glamour."
      },
      {
        "title": "Valorant",
        "note": "Riot's illustrative PBR: hand-painted Substance textures, true-to-life proportions, clean tactical-shooter readability."
      },
      {
        "title": "Fortnite",
        "note": "Epic's stylized-PBR roster spans goofy to heroic builds, proving the look scales widely."
      }
    ],
    "prompt": "Rendered as a modern stylized-PBR hero-shooter character: heroic athletic proportions with broadened shoulders and a cinched waist, clean confident silhouette, physically based metal/roughness materials with restrained saturation and hand-painted micro-detail in the albedo and normal maps, soft fresnel rim lighting, no ink outlines, crisp studio-quality render, in the polished grit-and-glamour style of Overwatch and Apex Legends.",
    "sampleHint": "Play up smooth PBR skin/leather/metal material transitions and a soft fresnel rim light along the cloak and shoulder silhouette edge."
  },
  {
    "id": "anime-open-world",
    "label": "Painterly Soft-Toon",
    "description": "Gentle gradient toon-shading with painterly textures, glossy anime hair, and soft open-world lighting.",
    "pipeline": "A custom NPR toon/cel shader layers over an otherwise PBR base: an N·L-driven ramp texture produces soft multi-step gradient shadows instead of hard cutoffs, a Kajiya-Kay-style anisotropic pass adds glossy anime-style hair highlights, hand-painted diffuse/AO maps carry most surface nuance on clean high-poly meshes, and rim light plus bloom finish it in post — the same soft-toon approach Nintendo pioneered for Breath of the Wild's painterly look and miHoYo popularized for Genshin Impact and Honkai: Star Rail.",
    "games": [
      {
        "title": "The Legend of Zelda: Breath of the Wild",
        "note": "Pioneered soft NPR toon shading and painterly matte textures now echoed by anime open-world games."
      },
      {
        "title": "Genshin Impact",
        "note": "Defines the modern look: gradient-ramp shadows, glossy anisotropic hair, and painterly open-world skies."
      },
      {
        "title": "Honkai: Star Rail",
        "note": "miHoYo's sibling title reuses the same soft toon ramp shader for cleaner, storybook JRPG scenes."
      },
      {
        "title": "Wuthering Waves",
        "note": "Custom Unreal Engine cel shader keeps skin and hair soft and natural under dynamic lighting."
      }
    ],
    "prompt": "Soft painterly toon-shading in the lineage of The Legend of Zelda: Breath of the Wild and Genshin Impact: gentle multi-step gradient shadow ramps instead of hard cel bands, glossy anisotropic hair with bright anime-style specular streaks, satin-smooth skin with faint warm subsurface bounce, clean saturated palette, soft directional key light with subtle rim glow, idealized slender proportions, thin painted silhouette outline, hand-painted diffuse detail over a clean PBR base, gentle bloom.",
    "sampleHint": "Give the auburn ponytail one bright anisotropic gloss streak, and shade the cloak and leather armor with soft two-to-three-tone gradients rather than flat or hard-edged blocks."
  },
  {
    "id": "hand-painted-fantasy",
    "label": "Hand-Painted Fantasy",
    "description": "Warm, saturated hand-painted diffuse textures on chunky, heroic proportions with almost no PBR.",
    "pipeline": "Artists sculpt a high-poly reference in ZBrush, bake it down to a modest low/mid-poly game mesh, then hand-paint all shading, ambient occlusion, and specular highlights straight into a single diffuse/albedo map in Photoshop or 3D-Coat, so the character reads correctly under flat or simple vertex lighting with little to no normal, roughness, or true PBR response.",
    "games": [
      {
        "title": "World of Warcraft",
        "note": "Textbook example: simple low-poly meshes, all light and detail baked into hand-painted diffuse textures."
      },
      {
        "title": "Dota 2",
        "note": "Valve's character guide mandates hand-painted shading and chunky silhouettes readable from a top-down camera."
      },
      {
        "title": "Torchlight II",
        "note": "Runic's isometric ARPG where armor, skin, and ground textures are all legitimately hand-painted, saturated fantasy colors."
      },
      {
        "title": "Heroes of the Storm",
        "note": "Blizzard's brightest, cleanest hand-painted MOBA look, with bold heroic proportions and minimal specular complexity."
      },
      {
        "title": "Diablo III",
        "note": "Blizzard's warmer, more painterly reboot of the franchise's palette, chunky armor forms over grim realism."
      }
    ],
    "prompt": "Rendered as a hand-painted stylized fantasy game character: chunky, exaggerated proportions with oversized hands, weapons, and bold silhouette-first shapes; all shading, ambient occlusion, and specular highlights baked directly into a warm, saturated diffuse texture with visible painterly brushstrokes, no PBR reflections or fine normal-map micro-detail, moderate low-to-mid poly mesh, soft vertex lighting, in the style of World of Warcraft and Dota 2 character art.",
    "sampleHint": "Paint the sword hilt, satchel buckle, and cloak clasp as chunky oversized readable shapes with hand-painted warm highlights baked into the diffuse, not real specular."
  },
  {
    "id": "handcrafted-stopmotion",
    "label": "Handcrafted Stop-Motion",
    "description": "Sculpted clay and felt puppet look with tactile seams and miniature tabletop-set lighting.",
    "pipeline": "Physical clay/felt/fabric maquettes are photogrammetry-scanned into high-detail meshes (as in Harold Halibut and The Midnight Walk), retopologized with normal/AO maps baked from real tool marks and fingerprints, shaded with a matte high-roughness non-metallic material under baked warm tabletop three-point lighting, then finished with on-twos frame-holding or slight vertex jitter so motion reads as genuine stop-motion.",
    "games": [
      {
        "title": "The Midnight Walk",
        "note": "700+ hand-sculpted clay models 3D-scanned and animated frame-by-frame like true stop-motion."
      },
      {
        "title": "Harold Halibut",
        "note": "Puppets and sets hand-built from clay, felt, and wood, then photogrammetry-scanned into Unity."
      },
      {
        "title": "Armikrog",
        "note": "Old-school claymation point-and-click from The Neverhood's team, built entirely from real sculpted materials."
      },
      {
        "title": "The Nightmare Before Christmas: Oogie's Revenge",
        "note": "Recreates Burton's gothic stop-motion puppet designs and lighting inside a 3D action game."
      }
    ],
    "prompt": "Rendered as tactile handcrafted stop-motion: sculpted matte clay skin with visible fingerprint dimples and tool marks, felt and canvas fabric with frayed hand-stitched seams, subtly asymmetrical handmade proportions, muted earthy palette. Lit like a miniature tabletop set with warm raking key light and soft shadow pools, shallow depth of field, faint dust motes, gentle frame-stutter, in the style of Harold Halibut and The Midnight Walk.",
    "sampleHint": "Cloak reads as felt with a raw pinked edge, leather armor and sword as tool-marked matte clay, hair as sculpted matte clumps rather than strands, single warm key light casting soft tabletop-set shadows."
  },
  {
    "id": "stylized-caricature",
    "label": "Stylized Caricature",
    "description": "Bold caricature 3D: oversized features, springy proportions, playful cartoon appeal.",
    "pipeline": "The exaggeration is sculpted into the base mesh and rig itself (oversized head/hands scaled up in the model, not faked by a shader), then finished with hand-painted diffuse/AO textures and a soft toon-gradient shader plus warm-to-cool illustrative rim lighting — the same illustrative-rendering recipe Valve documented for Team Fortress 2.",
    "games": [
      {
        "title": "Psychonauts",
        "note": "Oversized heads and elastic limbs turn every character into a walking caricature."
      },
      {
        "title": "Team Fortress 2",
        "note": "Silhouette-first character design with warm-to-cool illustrative shading defines the caricature-in-3D playbook."
      },
      {
        "title": "Ratchet & Clank: Rift Apart",
        "note": "Big eyes, thick brows, and bold cartoon shape language on high-fidelity PBR-rendered heroes."
      },
      {
        "title": "Crash Bandicoot N. Sane Trilogy",
        "note": "Squash-and-stretch cartoon anatomy and huge expressive eyes built directly into a bold silhouette."
      }
    ],
    "prompt": "Rendered as a stylized 3D caricature game character: bold, exaggerated proportions with an oversized head, hands, and props on a springy, elastic body, and a strong clean silhouette read from any angle. Hand-painted diffuse textures with baked ambient occlusion, soft gradient toon shading, and warm-to-cool illustrative rim lighting (Valve's Team Fortress 2 illustrative-rendering technique), moderate poly density with smooth simplified forms, vivid saturated color, playful cartoon appeal like Psychonauts or Ratchet & Clank.",
    "sampleHint": "Exaggerate her hands, satchel, and hood proportionally larger; keep the sword short and chunky so the whole silhouette reads as a springy caricature."
  },
  {
    "id": "cel-shaded-toon",
    "label": "Cel-Shaded Toon",
    "description": "Hard black ink outlines, flat 2-3 tone shadow bands, bold comic/anime toon shading.",
    "pipeline": "Built via a toon/ramp shader that quantizes N·L lighting through a hand-tuned gradient LUT into 2-3 hard bands, paired with an inverted-hull (or post-process edge-detect) black outline pass, flat unshaded diffuse textures instead of PBR roughness/metalness maps, and simplified low-poly meshes since the shading carries the read, not texture or geometric fidelity.",
    "games": [
      {
        "title": "The Legend of Zelda: The Wind Waker",
        "note": "Pioneered LUT-clamped toon lighting with dynamic ink outlines that defined the genre's benchmark."
      },
      {
        "title": "Jet Set Radio",
        "note": "First cel-shaded game ever shipped, with thick ink outlines and flat graffiti-bright color bands."
      },
      {
        "title": "Guilty Gear Strive",
        "note": "3D fighters cel-shaded frame by frame to read as hand-drawn anime with crisp shadow banding."
      },
      {
        "title": "Sly Cooper",
        "note": "Sucker Punch's toon-shading gives thick black outlines and flat color, feeling like a playable comic."
      }
    ],
    "prompt": "Rendered with hard-edged toon shading: a thick black ink outline (inverted-hull technique) traces every silhouette and interior crease, surfaces are flat unlit color fills stepped into two or three hard-clamped shadow bands with no soft gradients, low-detail flat textures, simplified clean-cut proportions, and glossy angular specular highlights on hair and metal — bold, saturated, comic-crisp like The Legend of Zelda: The Wind Waker and Guilty Gear Strive.",
    "sampleHint": "Emphasize a bold black outline around the cloak, hair, and sword silhouette, with cloak, armor, and skin flat-filled in two or three clean tonal steps — no gradients, no texture noise, no soft ambient occlusion."
  },
  {
    "id": "retro-lowfi-3d",
    "label": "Retro Low-Fi 3D (PS1)",
    "description": "Nostalgic PS1-era 3D: low-poly models, affine texture warp, dithering, vertex lighting.",
    "pipeline": "Low-poly meshes of only a few hundred triangles are skinned with small (64-128px) hand-painted diffuse textures sampled through uncorrected affine UV mapping with no mipmapping or bilinear filtering, lit by per-vertex Gouraud shading rather than per-pixel light, with vertex coordinates snapped to a coarse grid for the signature \"wobble,\" then finished with an 8-bit-style dithered palette, fog-based depth cueing to mask draw-distance pop-in, and a VHS/CRT post-process pass for scanlines and analog grain.",
    "games": [
      {
        "title": "Silent Hill (1999)",
        "note": "Real-time fog-shrouded low-poly world with grainy dithering and vertex-lit character models."
      },
      {
        "title": "Resident Evil (1996)",
        "note": "Chunky affine-textured low-poly survivors composited over static pre-rendered mansion backdrops."
      },
      {
        "title": "Tomb Raider (1996)",
        "note": "Fully real-time low-poly adventurer heroine with warping affine textures and fog-hidden draw distance."
      },
      {
        "title": "Crow Country (2024)",
        "note": "Modern throwback nailing PS1 vertex wobble, texture warp, and blocky FF7-style proportions."
      },
      {
        "title": "Signalis (2022)",
        "note": "Indie revival pairing grainy low-poly 3D models with moody pre-rendered-style backdrops and lighting."
      }
    ],
    "prompt": "Rendered as a real-time PS1-era 3D game character: a low-poly mesh of only a few hundred triangles with a jagged faceted silhouette, small hand-painted diffuse textures warped by uncorrected affine mapping, chunky per-vertex Gouraud lighting, a muddy low-bit color palette with visible dithering, subtle vertex jitter, fog-hazed depth cueing, and a grainy VHS/CRT scanline overlay, like Silent Hill or Tomb Raider (1996).",
    "sampleHint": "Render the cloak and leather armor as a few flat, texture-warped panels with visible seams rather than smooth cloth; keep the sword blade and ponytail as faceted low-poly shapes, never smoothly curved."
  },
  {
    "id": "low-poly-flat",
    "label": "Low-Poly Flat-Shaded",
    "description": "Faceted, flat-shaded low-poly models with baked AO and cozy indie charm.",
    "pipeline": "Meshes are kept low-vertex with hard, unsmoothed face normals (or an unlit/lit-vertex-color shader) instead of smooth normals, colors are painted directly onto vertices or a tiny flat-color texture rather than full PBR maps, and soft ambient occlusion is pre-baked into those vertex colors or a simple lightmap instead of computed in real time.",
    "games": [
      {
        "title": "A Short Hike",
        "note": "Flat-shaded low-poly island and bird protagonist define its cozy, faceted look."
      },
      {
        "title": "Tunic",
        "note": "No textures, extremely low-poly meshes, and baked ambient occlusion shape its faceted fox hero."
      },
      {
        "title": "Monument Valley",
        "note": "Princess Ida rendered as a simple faceted low-poly figure amid flat geometric architecture."
      },
      {
        "title": "Kentucky Route Zero",
        "note": "Modestly polygonated, minimally textured characters staged under stark theatrical lighting for a haunting mood."
      },
      {
        "title": "Donut County",
        "note": "Refined low-poly shapes, flat toon-shaded color, and PS1-inspired chunky, pastel cartoon charm."
      }
    ],
    "prompt": "Rendered as a low-poly 3D game character model, faceted flat-shaded geometry built from visible hard-edged polygon facets with no smooth gradients or ink outlines, flat vertex-colored surfaces with little to no texture maps, soft baked ambient occlusion nestled in creases and joints, gentle matte diffuse lighting with no specular gloss, muted cozy pastel palette, simplified chunky proportions, in the charming indie style of A Short Hike and Tunic.",
    "sampleHint": "Render her face and hair as a few simplified flat geometric planes (no fine strands, pores, or smooth curvature) so the head reads as low-poly as the faceted body and gear."
  },
  {
    "id": "cute-chibi-3d",
    "label": "Cute Chibi 3D",
    "description": "Oversized-head, tiny-body toy chibi with pastel toon shading and glossy eyes.",
    "pipeline": "Sculpt heavily-smoothed low-to-mid-poly meshes with a deliberately oversized head socket and stubby limbs, shade them with a gradient-ramp toon/cel shader (hard shadow bands plus a bright rim highlight for a \"plasticky\" feel) over hand-painted or lightly-PBR pastel diffuse maps and large flat glossy-eye decals, light with baked/vertex bounce lighting, and finish with soft ambient occlusion and gentle bloom.",
    "games": [
      {
        "title": "Fall Guys",
        "note": "Designed explicitly like vinyl toys: bean bodies, pill eyes, stubby limbs, glossy plastic-smooth toy-shelf appeal."
      },
      {
        "title": "Kirby and the Forgotten Land",
        "note": "Waddle Dees and Kirby show oversized rounded heads, stubby limbs, pastel toon-shaded, plush toy-like charm."
      },
      {
        "title": "A Hat in Time",
        "note": "Hat Kid: huge head, tiny body, hard-edged plasticky gradient toon shading, Kickstarter-era cel-shaded indie icon."
      },
      {
        "title": "Ooblets",
        "note": "Hand-painted low-poly villagers and creatures: oversized heads, soft cute features, warm pastel farm-sim palette."
      },
      {
        "title": "Overcooked",
        "note": "Chibi chefs: oversized heads, stubby rounded bodies, bright saturated toon colors, instantly readable co-op silhouettes."
      }
    ],
    "prompt": "Render in adorable super-deformed 3D chibi proportions: head about half the total body height, tiny rounded torso, stubby short limbs, in the toy-like style of Fall Guys and A Hat in Time. Smooth, low-to-mid-poly forms with soft gradient cel-shaded toon lighting and a plasticky rim highlight, oversized glossy eyes, pastel candy-colored palette, hand-painted matte textures, soft ambient occlusion, gentle bloom post-processing, no photoreal skin or hard realism.",
    "sampleHint": "Push the head-to-body ratio hard (roughly 1:1) and keep every surface soft, rounded, and glossy so the toy-like chibi proportions read clearly even on a plain neutral figure."
  },
  {
    "id": "voxel",
    "label": "Voxel / Blocky",
    "description": "Entirely built from cubic voxel blocks: chunky, blocky, and playful, Minecraft-style.",
    "pipeline": "Characters are modeled as rigid cubic-block meshes (or voxel grids run through greedy meshing) textured with a tiny hand-painted texture atlas at low texel density, then lit with flat/vertex-lit shading and hard per-face normals so no shading gradient ever crosses a cube edge.",
    "games": [
      {
        "title": "Minecraft",
        "note": "The defining voxel look: the entire world and every character built from uniform textured cubes."
      },
      {
        "title": "Trove",
        "note": "Voxel MMORPG where every character, weapon, and mount is hand-built from textured cubic blocks."
      },
      {
        "title": "Riverbond",
        "note": "Colorful voxel hack-and-slash where enemies and scenery shatter into destructible cubic chunks."
      },
      {
        "title": "Crossy Road",
        "note": "Mobile hit rendering chunky low-poly voxel characters with crisp 90-degree block edges."
      },
      {
        "title": "Cube World",
        "note": "Action-RPG explicitly named for its cube-built characters, creatures, and blocky terrain."
      }
    ],
    "prompt": "Rendered as blocky voxel character art built entirely from cubic 3D blocks: boxy right-angle limbs, a cube-shaped head, and squared-off armor plates with zero curves anywhere. Crisp hard edges on every block face, flat unshaded or lightly-toon-shaded color fills, small low-resolution pixel textures per block, subtle blocky ambient-occlusion seams, bright saturated toy-like palette, in the style of Minecraft and Trove.",
    "sampleHint": "Render the hood, ponytail, satchel, and sword each as distinct blocky sub-shapes with visible cube-grid seams — nothing smoothed into a curved silhouette."
  }
];

const BY_ID = new Map(ART_STYLES.map((s) => [s.id, s]));

export function artStyleById(id: string): ArtStyle | undefined {
  return BY_ID.get(id);
}

/** Standard full-body framing so every style renders a comparable turnaround anchor. */
export const STYLE_FRAMING =
  'Full body, head to toe, neutral standing A-pose, centered in frame, plain solid neutral background, no text, no watermark, no UI.';

/**
 * The single neutral character rendered for every style's "See examples" preview,
 * held constant so the styles compare apples-to-apples. Keep in sync with the
 * baked previews in web/src/assets/style-previews (re-bake if this changes).
 */
export const STYLE_SAMPLE_SUBJECT =
  "A young adventurer: a woman in her mid-twenties with a short auburn ponytail, a hooded traveler's cloak over light leather armor, a small satchel at one hip, and a plain short sword sheathed at her side.";

/**
 * Compose a generation prompt that renders `description` in `style`.
 * `extra` is any optional freeform steering the user added.
 */
export function composeStylePrompt(description: string, style: ArtStyle, extra = ''): string {
  return [description.trim(), STYLE_FRAMING, style.prompt, extra.trim()]
    .filter((part) => part.length > 0)
    .join(' ');
}

/** Compose the preview prompt: the shared sample subject rendered in `style`. */
export function composeSamplePrompt(style: ArtStyle, extra = ''): string {
  const hint = [style.sampleHint ?? '', extra].filter(Boolean).join(' ');
  return composeStylePrompt(STYLE_SAMPLE_SUBJECT, style, hint);
}
