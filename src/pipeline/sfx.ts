import fs from "node:fs/promises";
import path from "node:path";
import type { Sfx } from "../shared/episode";
import { ffmpeg } from "./audio";

/**
 * Meme sound effects, synthesised with ffmpeg so there is nothing to license.
 * Each is generated once per run into the render's public folder.
 */
const RECIPES: Record<Exclude<Sfx, "none">, string[]> = {
  // Deep "vine boom" style hit: falling sine + a little noise, long tail.
  boom: [
    "-f", "lavfi", "-i", "aevalsrc='0.95*sin(2*PI*(38+90*exp(-9*t))*t)*exp(-2.6*t)+0.25*(random(0)-0.5)*exp(-18*t)':s=44100:d=1.6",
    "-af", "aecho=0.6:0.5:60|120:0.35|0.2,lowpass=f=900,volume=1.6",
  ],
  whoosh: [
    "-f", "lavfi", "-i", "anoisesrc=d=0.55:c=pink:a=0.6",
    "-af", "bandpass=f=1400:width_type=o:w=1.4,afade=t=in:d=0.25,afade=t=out:st=0.28:d=0.27,volume=2.2",
  ],
  ding: [
    "-f", "lavfi", "-i", "aevalsrc='0.5*sin(2*PI*1318*t)*exp(-4*t)+0.25*sin(2*PI*2636*t)*exp(-6*t)':s=44100:d=1.2",
  ],
  pop: [
    "-f", "lavfi", "-i", "aevalsrc='0.9*sin(2*PI*(900-700*t/0.09)*t)*exp(-30*t)':s=44100:d=0.15",
  ],
  // "Wah wah wah waaah" sad trombone.
  sad: [
    "-f", "lavfi", "-i",
    "aevalsrc='0.45*(sin(2*PI*if(lt(t,0.32),392,if(lt(t,0.64),370,if(lt(t,0.96),349,330)))*t)+0.4*sin(4*PI*if(lt(t,0.32),392,if(lt(t,0.64),370,if(lt(t,0.96),349,330)))*t))*(1-0.5*mod(t,0.32)/0.32)*if(gt(t,0.96),(1+0.1*sin(2*PI*6*t))*exp(-1.6*(t-0.96)),1)':s=44100:d=2",
    "-af", "lowpass=f=1800",
  ],
  drumroll: [
    "-f", "lavfi", "-i", "aevalsrc='(random(0)-0.5)*0.9*(0.5+0.5*sin(2*PI*28*t))*min(1,t*1.5)*if(gt(t,1.3),exp(-12*(t-1.3)),1)':s=44100:d=1.6",
    "-af", "lowpass=f=1400,highpass=f=120",
  ],
};

/** Write the effect as a WAV into `dir` (once) and return its file name. */
export async function makeSfx(kind: Sfx, dir: string): Promise<string | undefined> {
  if (kind === "none") return undefined;
  const file = `sfx-${kind}.wav`;
  const out = path.join(dir, file);
  try {
    await fs.access(out);
    return file;
  } catch {
    /* not made yet */
  }
  try {
    await ffmpeg([...RECIPES[kind], "-ar", "44100", "-ac", "1", out]);
    return file;
  } catch (err) {
    console.warn(`  could not make sound effect "${kind}": ${String(err).slice(0, 200)}`);
    return undefined;
  }
}
