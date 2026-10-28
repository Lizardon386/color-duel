#!/usr/bin/env node
/**
 * 构建变色对决：server + 单文件客户端 + reference 资料，生成 .bpmap。
 * 用法：node scripts/build.mjs [--platform <3178 仓库>] [--start] [--host <地址>] [--out <文件>]
 */
import { createRequire } from 'node:module';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { API_VERSION, DEFAULT_MODE } from '@lizardon386/game-sdk';
import { packDirectory, readPack, readPackSource } from '@lizardon386/game-sdk/node';

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) fail(`${name} 后面要跟一个值`);
  return value;
};
const hasFlag = (name) => args.includes(name);

const gameRoot = process.cwd();
const pkg = JSON.parse(readFileSync(join(gameRoot, 'package.json'), 'utf8'));
const id = pkg.bp?.id ?? pkg.name;
const version = pkg.version;
const entry = pkg.bp?.entry ?? 'client/client.js';
const outDir = join(gameRoot, 'dist-pack');
const packFile = resolve(gameRoot, argValue('--out', `dist/${id}.bpmap`));
const platformRoot = argValue('--platform', null);
const hostUrl = argValue('--host', null);
const shouldStart = hasFlag('--start');

if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(String(id))) fail(`package.json 的 bp.id 不合法：${id}`);
if (typeof version !== 'string' || !/^\S{1,64}$/.test(version)) fail(`package.json 的 version 不合法：${version}`);
if (typeof entry !== 'string' || entry.includes('..') || isAbsolute(entry) || entry.includes('\\')) {
  fail(`package.json 的 bp.entry 必须是包内相对路径：${entry}`);
}
if (packFile === outDir || packFile.startsWith(`${outDir}${sep}`)) fail('--out 不能放在 dist-pack 里');
if (shouldStart && !platformRoot) fail('--start 需要同时给 --platform <3178 仓库>');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(gameRoot, 'src', 'server', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['@lizardon386/game-sdk', '@lizardon386/game-sdk/node', '@lizardon386/game-sdk/kit/server', '@lizardon386/core-abi'],
  outfile: join(outDir, 'server.js'),
  logLevel: 'info',
});

const clientOut = join(outDir, entry);
await build({
  entryPoints: [join(gameRoot, 'src', 'client', 'index.ts')],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  loader: { '.css': 'text' },
  outfile: clientOut,
  logLevel: 'info',
});

if (existsSync(join(gameRoot, 'src', 'reference.json'))) {
  copyFileSync(join(gameRoot, 'src', 'reference.json'), join(outDir, 'reference.json'));
}
if (existsSync(join(gameRoot, 'src', 'assets'))) {
  cpSync(join(gameRoot, 'src', 'assets'), join(outDir, 'assets'), { recursive: true });
}

const manifest = {
  id,
  version,
  mode: pkg.bp?.mode ?? DEFAULT_MODE,
  apiVersion: pkg.bp?.apiVersion ?? API_VERSION,
  server: 'server.js',
  client: entry,
  ...(existsSync(join(outDir, 'reference.json')) ? { reference: { entry: 'reference.json' } } : {}),
};
writeFileSync(join(outDir, 'bpmap.json'), JSON.stringify(manifest, null, 2) + '\n');

const source = readPackSource(outDir);
const packed = packDirectory(outDir, packFile, source);
const pack = readPack(packFile);
const bytes = packed.files.reduce((sum, file) => sum + file.size, 0);

console.log('');
console.log(`已生成 ${packFile}`);
console.log(`  id/version：${packed.id} ${packed.version}`);
console.log(`  文件：${packed.files.length} 个，${bytes} 字节`);
console.log(`  包哈希：${pack.packageHash}`);

if (platformRoot) {
  const platform = resolve(gameRoot, platformRoot);
  const gamesDir = join(platform, 'games');
  if (!existsSync(gamesDir)) fail(`平台里没有 games 目录：${gamesDir}`);
  const target = join(gamesDir, `${id}.bpmap`);
  copyFileSync(packFile, target);
  console.log(`已安装到 ${target}`);
}

if (hostUrl) {
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve('@lizardon386/sdk-tools/package.json')), 'dist', 'cli', 'index.js');
  console.log(`检查宿主兼容性：${hostUrl}`);
  const result = spawnSync(process.execPath, [cli, 'doctor', packFile, '--host', hostUrl], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (shouldStart) {
  const platform = resolve(gameRoot, platformRoot);
  const hostCli = join(platform, 'packages', 'hostd', 'dist', 'cli.js');
  if (!existsSync(hostCli)) fail('平台还没构建：先在平台仓库跑 npm run build');
  const port = argValue('--port', '3178');
  const lanPort = argValue('--lan-port', '3000');
  console.log(`启动宿主：http://127.0.0.1:${port}`);
  const result = spawnSync(process.execPath, [hostCli, 'host', '--port', port, '--lan-port', lanPort], {
    cwd: platform,
    stdio: 'inherit',
  });
  process.exit(result.status ?? 0);
}

console.log('下一步：重启宿主，建房时就能在列表里看到它。');

function fail(message) {
  console.error(`[x] ${message}`);
  process.exit(1);
}
