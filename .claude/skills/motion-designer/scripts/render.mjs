import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openFilm } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const [, value] = args.splice(i, 2);
  return value;
};
const scale = Number(flag("--scale", 1));
const audio = flag("--audio", null);
const from = Number(flag("--from", 0));
const toArg = flag("--to", null);
const crf = flag("--crf", "14");
const deband = args.includes("--deband") ? (args.splice(args.indexOf("--deband"), 1), true) : false;
const [mode, pageArg, out, ...rest] = args;
if (!["stills", "sheet", "video", "cues"].includes(mode) || !pageArg || !out) {
  console.error("usage: render.mjs stills <page.html> <out-dir> <t1,t2,...> [--scale 2]\n" +
    "       render.mjs sheet <page.html> <out.png> <from> <to> <step>\n" +
    "       render.mjs video <page.html> <out.mp4> [--audio file] [--scale 2] [--from s] [--to s] [--crf 14] [--deband]\n" +
    "       render.mjs cues <page.html> <out.json>");
  process.exit(2);
}

let { page, info } = await openFilm(resolve(pageArg), { scale });
const frameAt = async (t) => {
  try {
    await page.evaluate(`seek(${t})`);
    return await page.screenshot();
  } catch (e) {
    console.error(`frame at ${t}s: ${e.message.split("\n")[0]}; restarting Chrome and trying again`);
    await page.close().catch(() => {});
    ({ page } = await openFilm(resolve(pageArg), { scale }));
    await page.evaluate(`seek(${t})`);
    return page.screenshot();
  }
};

try {
  if (mode === "cues") {
    const cues = (await page.evaluate("window.FILM_CUES")) || [];
    writeFileSync(out, JSON.stringify({ fps: info.FPS, frames: info.frames, bpm: info.BPM, cues }, null, 1));
    console.log(`${out}: ${cues.length} cues`);
  } else if (mode === "stills") {
    mkdirSync(out, { recursive: true });
    for (const t of rest[0].split(",").map(Number)) writeFileSync(join(out, `t${t.toFixed(3)}.png`), await frameAt(t));
  } else if (mode === "sheet") {
    const [a, b, step] = rest.map(Number);
    const dir = out.replace(/\.png$/, "");
    mkdirSync(dir, { recursive: true });
    for (let t = a; t <= b + 1e-9; t += step) writeFileSync(join(dir, `t${t.toFixed(3)}.png`), await frameAt(+t.toFixed(3)));
    const sheet = [join(here, "sheet.py"), out, dir, String(info.BPM || 0)];
    if (spawnSync("uv", ["--version"]).status === 0) await run("uv", ["run", "--quiet", ...sheet]);
    else await run("python3", sheet);
  } else {
    const first = Math.round(from * info.FPS);
    const last = toArg === null ? info.frames : Math.min(info.frames, Math.round(Number(toArg) * info.FPS));
    const seconds = (last - first) / info.FPS;
    const ff = spawn("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(info.FPS), "-c:v", "png", "-i", "-",
      ...(audio ? ["-ss", String(from), "-i", audio, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "256k"] : []),
      ...(scale > 1 || deband ? ["-vf", [scale > 1 && `scale=${info.W}:${info.H}:flags=lanczos`, deband && "gradfun=1.2:16"].filter(Boolean).join(",")] : []),
      "-c:v", "libx264", "-preset", "slow", "-crf", crf, "-pix_fmt", "yuv420p",
      "-profile:v", "high", "-movflags", "+faststart", "-t", String(seconds), out,
    ], { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise((res, rej) => ff.on("exit", (c) => (c ? rej(new Error(`ffmpeg exited ${c}`)) : res())));
    const started = Date.now();
    for (let i = first; i < last; i++) {
      const png = await frameAt(i / info.FPS);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if ((i - first) % 120 === 0) console.log(`frame ${i - first}/${last - first}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await done;
    console.log(`${out}: ${last - first} frames in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  if (page.errors.length) {
    console.error("page errors:", page.errors);
    process.exitCode = 1;
  }
} finally {
  await page.close();
}

function run(cmd, argv) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: "inherit" });
    p.on("exit", (c) => (c ? rej(new Error(`${cmd} exited ${c}`)) : res()));
  });
}
