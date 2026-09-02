# IndexNow change notifications

The public proof file is `client/public/603435dfca216cef3eb7a0f5548d3475.txt`. After a deployment makes that file and the changed pages live, submit only the URLs changed by that deployment:

```sh
npm run indexnow -- \
  --added https://samedaydesk.com/new-page \
  --updated https://samedaydesk.com/x402 \
  --deleted https://samedaydesk.com/old-page
```

Use `--dry-run` before deployment to inspect the exact batch without network calls. There is intentionally no sitemap fallback, schedule, retry loop, or background process. A successful `200` or first-use `202` only acknowledges receipt; it does not prove indexing.
