// Generate the demo narration from public/demo-script.json.
//
//   pip install edge-tts          # once. Free, no key, no signup.
//   npm run demo:voice            # write mp3s and measure them
//   npm run demo:voice -- --voice en-IN-NeerjaNeural
//   npm run demo:voice -- --rate +12% --force   # shorten the run, cut nothing
//   npm run demo:voice -- --list  # what voices are available
//   npm run demo:voice -- --force # regenerate clips that already exist
//
// One mp3 per beat, written to public/demo-audio/, plus `audio` and `seconds`
// written back into the beats file. The runner then uses each clip's real
// duration as the beat's length, so captions and clicks stay aligned with the
// voice no matter how the wording or the speaking rate changes -- which is the
// whole reason this is generated rather than recorded by hand.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, '..', 'public', 'demo-script.json');
const OUTDIR = path.join(here, '..', 'public', 'demo-audio');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const voiceArg = args.indexOf('--voice');
const rateArg = args.indexOf('--rate');
// edge-tts speaks around 113 wpm, slower than a person pitching. Raising the
// rate is the one lever that shortens the run without cutting anything, so it
// is worth having before you start trimming sentences you want to keep.
const RATE = rateArg >= 0 ? args[rateArg + 1] : null;

async function edgeTts(argv) {
  // Installed as a console script on PATH, or runnable through the interpreter.
  for (const cmd of [['edge-tts', argv], ['python', ['-m', 'edge_tts', ...argv]]]) {
    try {
      return await run(cmd[0], cmd[1], { maxBuffer: 1 << 26 });
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
  }
  throw new Error('edge-tts not found. Install it with:  pip install edge-tts');
}

if (args.includes('--list')) {
  const { stdout } = await edgeTts(['--list-voices']);
  const indian = stdout.split('\n').filter((l) => /en-IN|en-GB|en-AU/.test(l));
  console.log(indian.join('\n') || stdout);
  process.exit(0);
}

/**
 * mp3 duration without a decoder: sum the frame headers. Avoids making ffmpeg a
 * prerequisite for a script whose whole appeal is not needing one.
 *
 * edge-tts returns 24 kHz mono, which is MPEG-2 Layer III, not MPEG-1: half the
 * sample rate, half the samples per frame (576, not 1152), and a different
 * bitrate table. Reading it as MPEG-1 reports exactly half the real duration --
 * a five-minute script that claims to be two and a half.
 */
const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
};
const RATES = {
  3: [44100, 48000, 32000, 0],    // MPEG-1
  2: [22050, 24000, 16000, 0],    // MPEG-2
  0: [11025, 12000, 8000, 0],     // MPEG-2.5
};

function mp3Seconds(buf) {
  let i = 0;
  let seconds = 0;
  // Skip an ID3v2 tag if present.
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    i = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  }
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i += 1; continue; }

    const versionBits = (buf[i + 1] & 0x18) >> 3;   // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layerBits = (buf[i + 1] & 0x06) >> 1;     // 1 = Layer III
    const rates = RATES[versionBits];
    if (!rates || layerBits !== 1) { i += 1; continue; }

    const mpeg1 = versionBits === 3;
    const bitrate = BITRATES[mpeg1 ? 1 : 2][(buf[i + 2] & 0xf0) >> 4];
    const rate = rates[(buf[i + 2] & 0x0c) >> 2];
    if (!bitrate || !rate) { i += 1; continue; }

    const samples = mpeg1 ? 1152 : 576;
    const padding = (buf[i + 2] & 0x02) >> 1;
    const length = Math.floor(((samples / 8) * bitrate * 1000) / rate) + padding;
    if (length < 4) { i += 1; continue; }

    seconds += samples / rate;
    i += length;
  }
  return seconds;
}

const script = JSON.parse(await fs.readFile(SCRIPT, 'utf8'));
const voice = voiceArg >= 0 ? args[voiceArg + 1] : script.voice;
await fs.mkdir(OUTDIR, { recursive: true });

console.log(`voice: ${voice}\nbeats: ${script.beats.length}\n`);

let total = 0;
let made = 0;

for (const beat of script.beats) {
  const file = `demo-audio/${beat.id}.mp3`;
  const abs = path.join(here, '..', 'public', file);

  const exists = await fs.access(abs).then(() => true).catch(() => false);
  if (!exists || FORCE) {
    const argv = ['--voice', voice, '--text', beat.caption, '--write-media', abs];
    if (RATE) argv.push(`--rate=${RATE}`);
    await edgeTts(argv);
    made += 1;
  }

  const seconds = mp3Seconds(await fs.readFile(abs));
  beat.audio = file;
  beat.seconds = Number(seconds.toFixed(2));
  total += seconds + (beat.hold || 0);

  const mins = `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  console.log(`  ${beat.id.padEnd(5)} ${String(beat.seconds).padStart(6)}s  ${mins}  ${exists && !FORCE ? '(cached)' : ''} ${beat.caption.slice(0, 52)}…`);
}

script.voice = voice;
await fs.writeFile(SCRIPT, `${JSON.stringify(script, null, 2)}\n`);

const core = script.beats.filter((b) => !b.optional).reduce((s, b) => s + b.seconds + (b.hold || 0), 0);
const fmt = (s) => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;

console.log(`\n${made} clip(s) generated, ${script.beats.length - made} reused.`);
console.log(`Core run (no section 7): ${fmt(core)}`);
console.log(`Everything, including section 7: ${fmt(total)}`);
if (core > 300) {
  const faster = Math.ceil(((core / 300) - 1) * 100);
  console.log(`
Over five minutes by ${Math.round(core - 300)}s. Either drop the tab switch in section 5, or keep every word and speed the voice up:`);
  console.log(`  npm run demo:voice -- --rate +${faster}% --force`);
}
console.log('\nNow: npm start, open http://localhost:3000/?demo=1, press Play.');
