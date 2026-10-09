import assert from 'node:assert/strict'
import { stripCode, extractLinks, resolve, buildGraph, fuzzy } from './links.ts'

// stripCode keeps length so line numbers and offsets survive
const md = 'a [[x]] b\n```\n[[y]]\n```\n`[[z]]` [[w|W]] [[v#h]]'
const stripped = stripCode(md)
assert.equal(stripped.length, md.length)
assert.ok(!stripped.includes('[[y]]') && !stripped.includes('[[z]]') && stripped.includes('[[x]]') && stripped.includes('[[w|W]]'))

const links = extractLinks(md)
assert.deepEqual(links.map((l) => [l.target, l.alias ?? null, l.line]), [['x', null, 1], ['w', 'W', 5], ['v', null, 5]], 'targets outside code, heading stripped, alias kept, 1-based lines')
assert.equal(links[1].text, '`[[z]]` [[w|W]] [[v#h]]', 'line text kept for backlink context')

const pages = ['README.md', 'ops/deploy.md', 'Deploy.md', 'notes/a.md', 'a.md']
assert.equal(resolve('ops/deploy', pages), 'ops/deploy.md', 'exact path')
assert.equal(resolve('deploy', pages), 'Deploy.md', 'basename, case-insensitive')
assert.equal(resolve('a', pages), 'a.md', 'exact path beats basename in a folder')
assert.equal(resolve('A', pages), 'a.md', 'case-insensitive exact')
assert.equal(resolve('nope', pages), null)

const g = buildGraph(new Map([['README.md', '- [[deploy]]\n- [[missing]]'], ['Deploy.md', 'back to [[README]] and [[readme]]'], ['a.md', 'nothing']]))
assert.deepEqual([...g.out.get('README.md')!].sort(), ['Deploy.md'])
assert.deepEqual([...g.in.get('README.md')!], ['Deploy.md'], 'two links from one page count once')
assert.deepEqual([...g.unresolved.get('README.md')!], ['missing'])
assert.equal(g.in.get('a.md')?.size ?? 0, 0)

const f = fuzzy('dep', ['ops/deploy.md', 'Deploy.md', 'decisions/epic.md', 'README.md'])
assert.deepEqual(f, ['Deploy.md', 'ops/deploy.md', 'decisions/epic.md'], 'basename prefix first, shorter path first, subsequence last, non-match dropped')
assert.deepEqual(fuzzy('', ['b.md', 'a.md']), ['a.md', 'b.md'], 'empty query lists all sorted')
console.log('links ok')
