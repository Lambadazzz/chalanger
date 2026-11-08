import { build } from 'vite';
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

await build();
await cp('web/icons', 'dist/icons', { recursive: true });
const notices = [await readFile('licenses/NOTICE.txt', 'utf8')];
for (const name of ['core', 'android', 'app', 'share', 'local-notifications']) {
  notices.push('@capacitor/' + name + '\n\n' + await readFile('node_modules/@capacitor/' + name + '/LICENSE', 'utf8'));
}
notices.push(await readFile('licenses/Apache-2.0.txt', 'utf8'));
await writeFile('dist/third-party.txt', notices.join('\n\n--------------------\n\n'));
async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesIn(dir + '/' + entry.name) : [dir + '/' + entry.name]))).flat();
}
const files = (await filesIn('dist')).sort();
const digest = createHash('sha256');
let worker = await readFile('web/sw.js', 'utf8');
digest.update(worker);
for (const path of files) digest.update(await readFile(path));
const version = digest.digest('hex').slice(0, 16);
const assets = ['./', ...files.map(path => './' + path.slice(5))];
worker = worker.replace('__CHALANGER_BUILD__', version)
  .replace(/const assets = \[[\s\S]*?\];/, 'const assets = ' + JSON.stringify(assets) + ';');
await writeFile('dist/sw.js', worker);
console.log('Offline cache: ' + version + ', ' + assets.length + ' files');
