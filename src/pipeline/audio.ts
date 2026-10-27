import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function ffmpeg(args: string[]): Promise<void> {
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
}

export async function durationOf(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return Number(stdout.trim());
}

let rubberband: boolean | undefined;

/** True when this ffmpeg has the Rubber Band filter (much cleaner time-stretch than atempo). */
export async function hasRubberband(): Promise<boolean> {
  if (rubberband === undefined) {
    try {
      const { stdout } = await run("ffmpeg", ["-hide_banner", "-filters"], { maxBuffer: 8 * 1024 * 1024 });
      rubberband = /\brubberband\b/.test(stdout);
    } catch {
      rubberband = false;
    }
  }
  return rubberband;
}

/**
 * ffmpeg filters that change speed and/or pitch independently, keeping the voice natural.
 * Input must already be resampled to 44.1 kHz.
 *   tempo < 1 = slower, pitch > 1 = higher.
 */
export async function stretchFilters(tempo = 1, pitch = 1): Promise<string[]> {
  const t = Math.min(2, Math.max(0.5, tempo));
  const p = Math.min(1.5, Math.max(0.67, pitch));
  const tOn = Math.abs(t - 1) > 0.005;
  const pOn = Math.abs(p - 1) > 0.005;
  if (!tOn && !pOn) return [];
  if (await hasRubberband()) {
    // formant=preserved keeps the voice sounding like a person, not a chipmunk.
    return [`rubberband=tempo=${t.toFixed(4)}:pitch=${p.toFixed(4)}:formant=preserved:transients=smooth:window=long`];
  }
  const out: string[] = [];
  // asetrate on 44.1 kHz audio shifts pitch AND speed by p; atempo then undoes the speed change.
  if (pOn) out.push(`asetrate=${Math.round(44100 * p)}`, "aresample=44100");
  const at = t / (pOn ? p : 1);
  if (Math.abs(at - 1) > 0.005) out.push(`atempo=${at.toFixed(4)}`);
  return out;
}

/**
 * Normalise any TTS output to 44.1 kHz mono WAV: optional speed/pitch change, leading and
 * trailing silence trimmed (with a little air left so word endings are not clipped), and the
 * loudness levelled for Shorts. Pass normalize=false when the take was already levelled as a whole.
 */
export async function toEpisodeWav(input: string, output: string, pitch = 1, speed = 1, normalize = true): Promise<void> {
  const filters: string[] = [
    // Resample FIRST. Gemini returns 24 kHz; every filter below assumes 44.1 kHz.
    "aresample=44100",
    ...(await stretchFilters(speed, pitch)),
    "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08",
    "areverse",
    "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15",
    "areverse",
  ];
  if (normalize) filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  await ffmpeg(["-i", input, "-af", filters.join(","), "-ar", "44100", "-ac", "1", output]);
}

/** Level a whole take once (before cutting it into lines) so every line has the same loudness. */
export async function normalizeTake(input: string, output: string): Promise<void> {
  await ffmpeg(["-i", input, "-af", "aresample=44100,highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=9", "-ar", "44100", "-ac", "1", output]);
}
