#!/usr/bin/env node
// Runs one gate group from scripts/gates.json, in manifest order. The manifest is the only place a
// gate command is written down; every surface calls this script instead of copying the commands.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function readGroup(manifestText, group) {
  const gates = JSON.parse(manifestText);
  const commands = gates[group];
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error(`gate group "${group}" is missing or empty`);
  }
  for (const command of commands) {
    if (typeof command !== 'string' || command.trim() === '' || command.includes('\n')) {
      throw new Error(`gate command must be a non-empty single line: ${JSON.stringify(command)}`);
    }
  }
  return commands;
}

const spawnGate = (command) => spawnSync(command, { shell: true, stdio: 'inherit' });

export function runGroup(commands, spawn = spawnGate) {
  for (const command of commands) {
    console.log(`::group::${command}`);
    const result = spawn(command);
    console.log('::endgroup::');
    if (result.signal) {
      console.error(`gate killed by ${result.signal}: ${command}`);
      return 1;
    }
    if (result.status !== 0) {
      console.error(`gate failed with exit ${result.status}: ${command}`);
      return result.status || 1;
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const group = process.argv[2];
  if (!group) {
    console.error('usage: node scripts/run-gates.mjs <frontend|rust>');
    process.exit(2);
  }
  const manifest = process.env.GATES_MANIFEST ?? 'scripts/gates.json';
  let commands;
  try {
    commands = readGroup(readFileSync(manifest, 'utf8'), group);
  } catch (error) {
    console.error(`${manifest}: ${error.message}`);
    process.exit(2);
  }
  const code = runGroup(commands);
  if (code === 0) console.log(`ran ${commands.length} gate(s) for group ${group}`);
  process.exit(code);
}
