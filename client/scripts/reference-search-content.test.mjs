import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'parse5';
import { applyReferenceSearchContent } from './reference-search-content.mjs';
import { SDK_SEARCH_CONTENT } from '../src/data/sdkSearchContent.mjs';
import { READINESS_PAGE } from '../src/data/readinessPage.mjs';
import { X402_SHELL } from '../src/data/machineEntry.mjs';
import { SPA_ROUTE_SHELLS } from '../../server/lib/spa-route-shells.js';
const walk = function* (n) { yield n; for (const c of n.childNodes || []) yield* walk(c); };
const attr = (n,k) => n.attrs?.find(a=>a.name===k)?.value;
const text = n => (n.nodeName==='#text'?n.value:(n.childNodes||[]).map(text).join('')).trim();
const structural = html => {
  const nodes=[...walk(parse(html))];
  return {code:nodes.filter(n=>['pre','code'].includes(n.tagName)).map(text),links:nodes.filter(n=>n.tagName==='a').map(n=>attr(n,'href')),ids:nodes.map(n=>attr(n,'id')).filter(Boolean),canonical:attr(nodes.find(n=>n.tagName==='link'&&attr(n,'rel')==='canonical'),'href')};
};
for (const [path,copy] of Object.entries(SDK_SEARCH_CONTENT)) {
  test(`fresh pinned SDK export gets maintained search content without changing API references: ${path}`,async()=>{
    const source=await readFile(new URL('../public'+path,import.meta.url),'utf8');
    const html=applyReferenceSearchContent(source,path),nodes=[...walk(parse(html))];
    assert.deepEqual(structural(html),structural(source));
    assert.deepEqual(html.match(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/g),source.match(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/g),'code markup bytes stay exact');
    assert.equal(text(nodes.find(n=>n.tagName==='title')),copy.title);
    const content=nodes.find(n=>attr(n,'id')==='content-area');assert.equal(text([...walk(content)].find(n=>n.tagName==='h1')),copy.heading);
    for(const name of ['description','og:description','twitter:description'])assert.equal(attr(nodes.find(n=>n.tagName==='meta'&&(attr(n,'name')===name||attr(n,'property')===name)),'content'),copy.description);
    const prose = node => ['pre','code','script','style','svg','nav','aside'].includes(node.tagName) ? '' : node.nodeName === '#text' ? node.value : (node.childNodes || []).map(prose).join(' ');
    const plain = prose(content).replace(/\s+/g, ' ');
    const punctuation = [...plain.matchAll(/[\u2013\u2014]|\s-\s/g)].map(match => plain.slice(Math.max(0, match.index - 45), match.index + 60));
    assert.deepEqual(punctuation, []);
    const located = [...walk(parse(source,{sourceCodeLocationInfo:true}))];
    const description = located.find(node=>attr(node,'class')?.split(' ').includes('page-description'));
    const span = [...walk(description)].find(node=>node.tagName==='span') || description;
    const location = span.sourceCodeLocation;
    const freshExport = source.slice(0,location.startTag.endOffset)+'A mutable - upstream introduction.'+source.slice(location.endTag.startOffset);
    assert.ok(applyReferenceSearchContent(freshExport,path).includes(copy.introduction),'site introduction wins without overlapping prose edits');
    assert.equal(applyReferenceSearchContent(html,path),html,'idempotent across ordinary rebuilds');
    assert.throws(()=>applyReferenceSearchContent(source.replace('id="content-area"','id="missing-area"'),path),/unexpected document structure/);
    assert.throws(()=>applyReferenceSearchContent(source.replace('name="twitter:description"','name="missing-description"'),path),/missing twitter:description/);
    assert.throws(()=>applyReferenceSearchContent(source.replace('rel="canonical"','rel="alternate"'),path),/unexpected document structure/);
  });
}
test('reference generation leaves every other page unchanged',()=>{assert.equal(applyReferenceSearchContent('<html><title>Other</title></html>','/docs/other/index.html'),'<html><title>Other</title></html>')});
test('readiness route shell and client source share their public title and first answer',async()=>{
  const shell=SPA_ROUTE_SHELLS.find(route => route.path === '/tools/ai-readiness');assert.equal(shell.title,READINESS_PAGE.title);assert.equal(shell.description,READINESS_PAGE.description);assert.ok(shell.crawlerHtml.includes(READINESS_PAGE.heading));assert.ok(shell.crawlerHtml.includes(READINESS_PAGE.introduction));
  const client=await readFile(new URL('../src/pages/AiReadiness.tsx',import.meta.url),'utf8');assert.match(client,/applyMachineMetadata\(document, READINESS_PAGE\)/);assert.match(client,/READINESS_PAGE\.introduction/);
});
test('x402 crawler first answer agrees with the interactive page and supported protocol headers',()=>{
  assert.ok(X402_SHELL.crawlerHtml.includes(X402_SHELL.comparison));assert.ok(X402_SHELL.crawlerHtml.includes(X402_SHELL.mcpExplanation));for(const header of ['PAYMENT-REQUIRED','PAYMENT-SIGNATURE','WWW-Authenticate','Authorization'])assert.ok(X402_SHELL.comparison.includes(header));
});

test('automation and hiring guides lead to the maintained SDS offer instead of substitute signups',async()=>{
  for (const filename of ['instagram-whatsapp-dm-automation-manychat-2026.html','how-to-hire-ai-agents-2026.html']) {
    const html=await readFile(new URL('../public/guides/'+filename,import.meta.url),'utf8');
    const nodes=[...walk(parse(html))];
    assert.ok(nodes.some(node=>node.tagName==='a'&&attr(node,'href')==='/checkout?offer=agent_workflow'));
    assert.ok(html.includes('149 USD'));
    assert.equal(nodes.filter(node=>node.tagName==='a').some(node=>/manychat|agenthansa/i.test(attr(node,'href')||'')),false);
    const prose=nodes.filter(node=>node.nodeName==='#text').map(text).join(' ');
    assert.doesNotMatch(prose,/Manychat|AgentHansa|Clustly|stay on Free|use the native inbox/);
    const structured=nodes.filter(node=>node.tagName==='script'&&attr(node,'type')==='application/ld+json').map(node=>JSON.parse(text(node)));
    if(filename==='how-to-hire-ai-agents-2026.html'){assert.ok(html.includes('listing=5a2db664-5392-406f-b85e-fa34dcd405a4'));assert.ok(html.includes('listing=53090395-7513-4f0a-b42a-13df61779791'));}
    assert.equal(structured[0]['@graph'][0].mainEntityOfPage,'https://samedaydesk.com/guides/'+filename);
  }
});
test('documentation-index guide keeps a useful internal next step and drops competitor-derived percentages',async()=>{
  const html=await readFile(new URL('../public/guides/does-llms-txt-work-2026.html',import.meta.url),'utf8');
  assert.ok(html.includes('href="/tools/llms-txt-generator.html"'));
  assert.ok(html.includes('href="/tools/ai-readiness"'));
  assert.doesNotMatch(html,/Ahrefs|Seer Interactive|Search Engine Land|97%|87%/);
  const referral=await readFile(new URL('../public/go/agenthansa-merchant/index.html',import.meta.url),'utf8');
  assert.ok(referral.includes('content="0;url=/checkout?offer=agent_workflow"'));
  assert.doesNotMatch(referral,/https:\/\/www\.agenthansa\.com/);
});

test('the dated benchmark publishes a labelled selection with the original retained observations',async()=>{
  const {createHash}=await import('node:crypto');
  const html=await readFile(new URL('../public/reports/ai-search-readiness-leaderboard-2026.html',import.meta.url),'utf8');
  const match=html.match(/const DATA\s*=\s*(\[[^\n]+\]);/);assert.ok(match);
  const rows=JSON.parse(match[1]);assert.equal(rows.length,187);assert.equal(new Set(rows.map(r=>r.domain)).size,187);
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),'e7b6ba53716de2f755f55570983cf066abc17202fa7e3f657d7c4c5d9ff3e449');
  assert.match(html,/187<\/strong> selected results from the 189 companies/);
  assert.match(html,/selection average \/100/);assert.match(html,/r\.grade==="C"\|\|r\.grade==="D"\|\|r\.grade==="F"/);
  assert.match(html,/https:\/\/creativecommons\.org\/licenses\/by\/4.0\//);
  assert.doesNotMatch(html,/wise\.com|gumroad\.com/i);
  for(const[name,count,total]of[['ai-search-readiness-saas-2026.html',23,24],['ai-search-readiness-fintech-2026.html',15,16]]){
    const page=await readFile(new URL('../public/reports/'+name,import.meta.url),'utf8');
    const body=page.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];assert.ok(body);assert.equal((body.match(/<tr>/g)||[]).length,count);
    assert.ok(page.includes(`table shows ${count} selected examples`));assert.ok(page.includes(`all ${total} sites in the original June 2026 sample`));
  }
});
