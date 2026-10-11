/** Dependency-free project syntax validation using the globally installed TypeScript compiler.
 * Does not typecheck, resolve imports, or replace a Vite build.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const globalTsPath = '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript';
let ts;
try { ts = require('typescript'); } catch {
  try { ts = require(globalTsPath); } catch {
    console.error('TypeScript compiler not found. Install dependencies or a global TypeScript package.');
    process.exit(2);
  }
}
const root = path.resolve(__dirname, '..');
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(['node_modules','.git','dist'].includes(entry.name))continue;
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())walk(file);
  else if(/\.(tsx?|jsx?)$/.test(entry.name))files.push(file);
}}
walk(root);
let errors=0;
for(const file of files){
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  for(const d of source.parseDiagnostics){errors++;const pos=source.getLineAndCharacterOfPosition(d.start||0);console.error(`${path.relative(root,file)}:${pos.line+1}:${pos.character+1}: ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`)}
}
console.log(`Parsed ${files.length} JS/TS/TSX files; syntax errors: ${errors}. Compiler: ${ts.version}`);
process.exitCode=errors?1:0;
