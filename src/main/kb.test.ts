// Run: npm test. Pure link rewriting + a real temp-dir rename with git.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { rewriteLinks, kbRename, kbReadAll, kbMkdir, kbWrite, kbCommit } from './kbfs.ts'

// --- rewriteLinks ---
const src = 'See [[a]], [[a|alias]], [[a#head]], [[dir/a]] and [[ab]].\n```\n[[a]] in code stays\n```\n`[[a]]` inline too'
const out = rewriteLinks(src, 'a', 'b')
assert.ok(out.includes('[[b]]') && out.includes('[[b|alias]]') && out.includes('[[b#head]]'), 'plain, alias, heading rewritten')
assert.ok(out.includes('[[dir/a]]'), 'different folder path untouched')
assert.ok(out.includes('[[ab]]'), 'prefix-only name untouched')
assert.ok(out.includes('```\n[[a]] in code stays') && out.includes('`[[a]]` inline'), 'code untouched')
assert.ok(rewriteLinks('[[dir/a]] [[a]]', 'dir/a', 'dir/c').includes('[[dir/c]] [[a]]'), 'folder-qualified rename')
assert.ok(rewriteLinks('[[A]]', 'a', 'b').includes('[[b]]'), 'case-insensitive match')

// --- kbRename on disk ---
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-'))
execSync('git init -q && git config user.email t@t && git config user.name t', { cwd: dir })
kbMkdir(dir, 'runbooks')
kbWrite(dir, 'README.md', '# idx\n- [[deploy]]\n')
kbWrite(dir, 'runbooks/deploy.md', '# Deploy\nsee [[README]]\n')
kbWrite(dir, 'other.md', 'links [[runbooks/deploy|the runbook]] and [[deploy#steps]]\n')
kbCommit(dir)
const touched = kbRename(dir, 'runbooks/deploy.md', 'runbooks/release.md')
assert.ok(!fs.existsSync(path.join(dir, 'runbooks/deploy.md')) && fs.existsSync(path.join(dir, 'runbooks/release.md')), 'file moved')
assert.deepEqual(touched.sort(), ['README.md', 'other.md'], 'pages with links rewritten')
assert.equal(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), '# idx\n- [[release]]\n')
assert.equal(fs.readFileSync(path.join(dir, 'other.md'), 'utf8'), 'links [[runbooks/release|the runbook]] and [[release#steps]]\n')
assert.throws(() => kbRename(dir, 'other.md', 'README.md'), /exists/, 'refuses to overwrite')
const log = execSync('git log --oneline', { cwd: dir, encoding: 'utf8' })
assert.ok(log.includes('rename'), 'rename committed')
// folder rename rewrites folder-qualified links
kbRename(dir, 'runbooks', 'ops')
assert.ok(fs.existsSync(path.join(dir, 'ops/release.md')), 'folder moved')
assert.ok(fs.readFileSync(path.join(dir, 'other.md'), 'utf8').includes('[[ops/release|the runbook]]'), 'folder link rewritten')
// readAll
const all = kbReadAll(dir)
assert.deepEqual(all.map((p) => p.rel).sort(), ['README.md', 'ops/release.md', 'other.md'])
// write does not commit; commit does
kbWrite(dir, 'other.md', 'changed\n')
assert.ok(execSync('git status --porcelain', { cwd: dir, encoding: 'utf8' }).trim().length > 0, 'write leaves the tree dirty')
kbCommit(dir)
assert.equal(execSync('git status --porcelain', { cwd: dir, encoding: 'utf8' }).trim(), '', 'commit cleans the tree')
fs.rmSync(dir, { recursive: true, force: true })
console.log('kb ok')
