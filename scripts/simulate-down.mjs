import nextEnv from "@next/env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { loadEnvConfig } = nextEnv;

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvConfig(projectDir);

const stateDir = path.join(projectDir, ".monitor");
const stateFile = path.join(stateDir, "state.json");

async function readState() {
  try {
    const raw = await readFile(stateFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeState(state) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function main() {
  const state = await readState();
  state.forcedDown = true;
  await writeState(state);
  process.stdout.write("Simulation enabled: forcedDown=true\n");
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exitCode = 1;
});
