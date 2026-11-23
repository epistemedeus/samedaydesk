// One public title and first answer for the direct route shell and interactive page.
const headingPrefix = "Check your website's";
const headingHighlight = "AI readiness";
export const READINESS_PAGE = Object.freeze({
  path: '/tools/ai-readiness',
  title: 'Free Website AI Readiness Checker | SameDayDesk',
  description: 'Check your website\'s AI readiness for free. Enter a URL to test crawler access, readable content, structured data and buyer answers, then get practical fixes. No signup.',
  canonical: 'https://samedaydesk.com/tools/ai-readiness',
  ogImage: '/og/ai-readiness.png',
  headingPrefix, headingHighlight,
  heading: `${headingPrefix} ${headingHighlight}`,
  introduction: 'Enter your website URL to see what AI search crawlers can read, what is missing and how to fix it. Get a score and the biggest fixes first. Free, with no signup or email.',
});
export const READINESS_SHELL = Object.freeze({
  ...READINESS_PAGE,
  crawlerHtml: `<h1>${READINESS_PAGE.heading}</h1><p>${READINESS_PAGE.introduction}</p>
    <p>The check reads your public page and robots.txt, then checks readable content, structured data,
    metadata, your sitemap and documented actions. Measurements that are unavailable stay Not verified.</p>
    <p>Give developer tools a short index with our llms.txt generator, alongside readable pages, structured data and a sitemap.</p>`,
});
