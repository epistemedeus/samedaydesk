import { parse } from 'parse5';
import { SDK_SEARCH_CONTENT } from '../src/data/sdkSearchContent.mjs';

const walk = function* (node) { yield node; for (const child of node.childNodes || []) yield* walk(child); };
const attr = (node, name) => node?.attrs?.find(item => item.name === name)?.value;
const escaped = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const phrasePattern = value => new RegExp(value.split(' ').map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'g');

// Patching source locations preserves the generated API/code/navigation bytes. Reapply on every
// normal build, including after a fresh Sourcey export; refuse drift instead of dropping the copy.
export function applyReferenceSearchContent(html, pathname) {
  const copy = SDK_SEARCH_CONTENT[pathname];
  if (!copy) return html;
  const document = parse(html, { sourceCodeLocationInfo: true }), nodes = [...walk(document)];
  const content = nodes.find(node => attr(node, 'id') === 'content-area');
  const title = nodes.find(node => node.tagName === 'head')?.childNodes.find(node => node.tagName === 'title');
  const heading = content && [...walk(content)].find(node => node.tagName === 'h1');
  const description = content && [...walk(content)].find(node => attr(node, 'class')?.split(' ').includes('page-description'));
  const introduction = description && ([...walk(description)].find(node => node.tagName === 'span') || description);
  const canonical = nodes.find(node => node.tagName === 'link' && attr(node, 'rel') === 'canonical');
  if (!content || !title || !heading || !introduction || attr(canonical, 'href') !== `https://samedaydesk.com${pathname}`) throw Error(`Reference search content: unexpected document structure for ${pathname}`);
  const edits = [];
  for (const [node, value] of [[title, copy.title], [heading, copy.heading], [introduction, copy.introduction]]) {
    const location = node.sourceCodeLocation;
    if (!location?.startTag || !location.endTag) throw Error(`Reference search content: missing source location for ${pathname}`);
    edits.push({ start: location.startTag.endOffset, end: location.endTag.startOffset, text: escaped(value) });
  }
  for (const [name, value] of [['description', copy.description], ['og:title', copy.title], ['og:description', copy.description], ['twitter:title', copy.title], ['twitter:description', copy.description]]) {
    const node = nodes.find(node => node.tagName === 'meta' && (attr(node, 'name') === name || attr(node, 'property') === name));
    const location = node?.sourceCodeLocation?.attrs?.content;
    if (!location) throw Error(`Reference search content: missing ${name} in ${pathname}`);
    edits.push({ start: location.startOffset, end: location.endOffset, text: `content="${escaped(value)}"` });
  }
  for (const node of [...walk(content)].filter(node => node.nodeName === '#text')) {
    let protectedText = false;
    for (let parent = node.parentNode; parent; parent = parent.parentNode) {
      if (['pre', 'code', 'script', 'style', 'svg', 'nav', 'aside'].includes(parent.tagName)) protectedText = true;
    }
    if (protectedText || !node.sourceCodeLocation) continue;
    const { startOffset: start, endOffset: end } = node.sourceCodeLocation;
    const original = html.slice(start, end);
    const updated = copy.proseReplacements.reduce((value, [before, after]) => value.replace(phrasePattern(before), after), original);
    if (updated !== original) edits.push({ start, end, text: updated });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, edit.start) + edit.text + html.slice(edit.end);
  return html;
}
