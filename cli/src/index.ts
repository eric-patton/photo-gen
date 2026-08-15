import { Command } from 'commander';
import { runGen } from './generate.js';
import { runCutout, runPreview, runResize, runSlice } from './ops.js';
import { runProjects, runRecent, runStyles } from './info.js';

const collect = (value: string, previous: string[]): string[] => previous.concat([value]);

const program = new Command();
program
  .name('pgen')
  .description('Game-asset CLI for the photo-gen library: generate with gpt-image-2, then cut, slice, resize, and preview.')
  .configureHelp({ sortSubcommands: false });

program
  .command('gen')
  .description('Generate images into the library (and optionally copy them to a directory)')
  .argument('<prompt>', 'what to generate; scaffolds and styles wrap it')
  .requiredOption('-p, --project <ref>', 'project id or name')
  .option('-r, --ref <path|id>', 'style reference image (file or library id), repeatable', collect, [])
  .option('-b, --base <path|id>', 'base image to edit (mask applies to it)')
  .option('--mask <path|id>', 'inpaint mask PNG (transparent = repaint), requires --base')
  .option('--style <id>', 'art style from the catalog (pgen styles)')
  .option('--scaffold <kind>', 'game-asset prompt wrapper: icon|sprite|portrait')
  .option('--sheet <RxC>', 'generate an RxC grid sheet (slice it after with pgen slice)')
  .option('--size <size>', "output size: 'auto' or WxH", '1024x1024')
  .option('-q, --quality <q>', 'low|medium|high|auto', 'medium')
  .option('-n <count>', 'number of images (1-8)', '1')
  .option('--cutout [color]', "remove the background from results ('auto' or #rrggbb) and alpha-trim, writing a -cut.png beside the --out copies")
  .option('--format <fmt>', 'png|jpeg|webp', 'png')
  .option('-o, --out <dir>', 'also copy results into this directory')
  .option('--name <base>', 'filename base for --out copies (default: prompt slug)')
  .option('--title <title>', 'library title for the result images')
  .option('--dry-run', 'print the final prompt and cost estimate without generating')
  .action(runGen);

program
  .command('cutout')
  .description('Trim images to their alpha bounding box, optionally removing a solid background first')
  .argument('<files...>', 'input images')
  .option('--key <color>', "background to remove: 'auto' or #rrggbb (flood fill from the borders)")
  .option('--tolerance <n>', 'per-channel color tolerance for --key', '24')
  .option('--threshold <n>', 'alpha above this counts as content', '8')
  .option('--pad <n>', 'transparent padding around the trimmed result', '0')
  .option('-o, --out <dir>', 'output directory (default: beside the input, suffixed -cut)')
  .action(runCutout);

program
  .command('slice')
  .description('Cut a generated grid sheet into individual asset files')
  .argument('<file>', 'sheet image')
  .requiredOption('--grid <RxC>', 'rows x columns, e.g. 3x3')
  .option('--trim', 'alpha-trim each cell')
  .option('--pad-to <n>', 'fit each cell into an n x n transparent square')
  .option('--key <color>', "remove the sheet background first: 'auto' or #rrggbb")
  .option('--tolerance <n>', 'per-channel color tolerance for --key', '24')
  .option('--threshold <n>', 'alpha above this counts as content when trimming', '8')
  .option('-o, --out <dir>', 'output directory (default: beside the sheet)')
  .option('--name <base>', 'filename base (default: sheet filename)')
  .action(runSlice);

program
  .command('resize')
  .description('Resize images to one or more target sizes (lanczos, transparent padding)')
  .argument('<files...>', 'input images')
  .requiredOption('--size <sizes>', 'comma list: N (square) or WxH, e.g. 128,96,64')
  .option('--fit <mode>', 'contain|inside|cover', 'contain')
  .option('-o, --out <dir>', 'output directory (default: beside each input)')
  .action(runResize);

program
  .command('preview')
  .description('Composite images at game sizes over a panel color to judge how they scale down')
  .argument('<files...>', 'input images (one row each)')
  .option('--sizes <sizes>', 'comma list of pixel sizes', '128,96,64')
  .option('--bg <color>', 'panel color', '#221d15')
  .option('-o, --out <file>', 'output file', 'preview.png')
  .action(runPreview);

program
  .command('projects')
  .description('List projects (id, name, image count, spend) or create one')
  .option('--create <name>', 'create a new project')
  .action(runProjects);

program
  .command('styles')
  .description('List the art-style catalog, or show one style in full')
  .argument('[style]', 'style id (or unique prefix) to expand')
  .action(runStyles);

program
  .command('recent')
  .description('Show recent generations with status, cost, and output image ids')
  .option('-c, --count <n>', 'how many to show', '10')
  .action(runRecent);

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  // exitCode, not exit(): a forced exit races libuv handle teardown on
  // Windows and dies on an assertion after the message prints.
  process.exitCode = 1;
});
