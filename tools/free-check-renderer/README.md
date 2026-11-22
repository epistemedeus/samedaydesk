# Free check renderer

Rendered text for the free check's `rendered` measurement: open a visitor's page in headless Chrome
and count the words a reader sees after scripts run. It runs on a VM-side worker, never on the web
host, and is called with a short timeout. Any failure keeps the check Not verified.

## How private addresses are kept out

Chrome reaches the network only through `guard.mjs`, a local forward proxy:

- `--proxy-server` points at the guard and `--proxy-bypass-list=<-loopback>` sends loopback through
  it too. `--host-resolver-rules` maps every name except the proxy address to NOTFOUND, so Chrome
  resolves nothing itself. QUIC is off and WebRTC cannot use direct UDP (the APIs are also removed
  before page scripts run).
- The guard resolves each host per connection and refuses it if any answer is private, loopback,
  link-local (including 169.254.169.254), carrier-grade NAT, documentation, multicast or reserved,
  in IPv4 or IPv6 (IPv4-mapped addresses are judged as IPv4). It refuses metadata and `.internal`,
  `.local` and `localhost` names, and any port but 80 and 443. It connects to the address it
  checked, so a name that rebinds from public to private is caught on the next connection.
- Redirects and subresources are new requests through the guard, so each one is checked.
- Caps: 8 s of page time (a hard kill 4 s later), 8 MB and 150 requests per render; one render at a
  time with a queue of three. Only http(s), data and blob URLs load; WebSockets are blocked.
- The page itself must load with HTTP below 400, otherwise nothing is measured. A bot challenge
  page is reported as `challenged` and not counted.
- Chrome's own sandbox stays on. Nothing is stored; the worker holds no other secrets.

`npm test` proves this without outside network: names map to loopback aliases and a page tries a
private host, a metadata name, a redirect to 169.254.169.254, loopback literals, an image on a
10.x address and a rebinding name. The private service receives no request.

## Running it

```sh
npm ci
FREE_CHECK_RENDER_TOKEN=<32+ random characters> PORT=8787 node worker.mjs
# POST /render  Authorization: Bearer <token>  {"url": "...", "initialWords": 120}
# 200 {words, extraWords, challenged, ms, requests, bytes, refused, capped}; 401, 400, 422 or 429 otherwise
```

## What production needs

- A small Linux VM or container that is not the web host: Node 22, Chrome stable, 1 vCPU and 2 GB
  per concurrent render. Measured on this VM: 1 to 2.5 s for most pages, up to about 8 s for heavy
  ones (stripe.com).
- Outbound 80 and 443 to the internet, and no route to any internal network or cloud metadata
  service (a firewall rule as a second layer under the guard).
- An HTTPS endpoint the web host can reach (a reverse proxy in front of `worker.mjs`, which binds to
  127.0.0.1), and `FREE_CHECK_RENDER_TOKEN` in both hosts' settings only.
- In the free check: a `renderer` that POSTs here with a 9 s timeout inside the 20 s budget and maps
  `challenged`, an error or a timeout to Not verified.
