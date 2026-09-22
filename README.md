# GMO Coin MCP Server

An MCP server for the GMO Coin REST API. It exposes public market data, private
account data, and opt-in trading tools over stdio, and can be deployed as a
remote HTTP server on Cloudflare Workers.

## Requirements

- Node.js 24
- npm
- A GMO Coin API key only if private tools are needed

WebSocket support is not included in this release.

## Install

```bash
git clone <repository-url>
cd gmocoin-mcp
npm ci
npm run build
```

Run the compiled server with:

```bash
npm start
```

`npm start` loads `.env` when it exists. The equivalent direct command is:

```bash
node --env-file-if-exists=.env dist/index.js
```

The package binary can also be launched as `gmocoin-mcp` after a global
installation, or through `npx gmocoin-mcp`. The entry point supports npm's
symlinked bin layout.

The server communicates over stdout using MCP. Diagnostic messages are written
to stderr.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `GMO_API_KEY` | Private tools only | GMO Coin API key |
| `GMO_API_SECRET` | Private tools only | GMO Coin API secret |
| `GMO_ENABLE_TRADING` | No | Set to exactly `true` to register write tools; defaults to off |
| `GMO_ALLOWED_SYMBOLS` | No | Optional comma-separated symbol allowlist for order tools |
| `GMO_MAX_ORDER_SIZE` | No | Optional maximum order size as a decimal string |

Both credential variables must be present to enable private read tools. Secrets
are never logged or returned in tool results.

Trading and transfer tools can place, alter, or cancel real-money transactions.
They are not registered unless credentials are present and
`GMO_ENABLE_TRADING=true`.

## Trading safeguards

`GMO_ALLOWED_SYMBOLS` and `GMO_MAX_ORDER_SIZE` are optional. When they are
unset, symbols and sizes are sent to the API unchanged.

`GMO_ALLOWED_SYMBOLS` is a comma-separated list. When it is set,
`gmo_place_order`, `gmo_close_order`, `gmo_close_bulk_order`, and
`gmo_cancel_bulk_order` reject any symbol that is not in the list. The tool
returns an error and does not call the API.

`GMO_MAX_ORDER_SIZE` is a non-negative decimal string. When it is set,
`gmo_place_order.size`, the single `gmo_close_order` position size, and
`gmo_close_bulk_order.size` must be less than or equal to that value. The
comparison scales both strings to the same number of decimal places and uses
integer arithmetic, so it does not use floating point. A value that is not a
decimal string is refused, and every size-checked order then fails without a
network call.

```bash
GMO_ALLOWED_SYMBOLS=BTC,ETH
GMO_MAX_ORDER_SIZE=0.01
```

## Security notes

Create the GMO Coin API key with the minimum permissions required. Use
read-only permissions unless trading is intentionally enabled, and turn on IP
restriction in the GMO member page.

Store the key and secret in a `.env` file with mode 600. Passing them with
`claude mcp add -e` puts the secret in shell history and in the MCP client's
configuration file as plain text.

```bash
chmod 600 .env
node --env-file-if-exists=.env dist/index.js
```

With `GMO_ENABLE_TRADING=true`, any content the model reads can try to trigger
an order. Keep the write tools out of any client auto-approve or allow list,
leave the flag off for day-to-day use, and use a separate API key without
order permission for read-only work. `GMO_ALLOWED_SYMBOLS` and
`GMO_MAX_ORDER_SIZE` can further limit symbols and order size when trading is
enabled.

This API surface has no tool that withdraws crypto or JPY to an external
destination. `gmo_transfer_jpy` moves JPY only between the user's own crypto
account and FX account.

`--env-file-if-exists=.env` resolves `.env` relative to the current working
directory. Start the server from the directory that contains that file, or
pass an absolute path.

## Claude Code

Public tools only:

```bash
claude mcp add gmocoin -- node /absolute/path/to/gmocoin-mcp/dist/index.js
```

Private read tools:

```bash
claude mcp add \
  -e GMO_API_KEY=your-key \
  -e GMO_API_SECRET=your-secret \
  gmocoin -- node /absolute/path/to/gmocoin-mcp/dist/index.js
```

Add `-e GMO_ENABLE_TRADING=true` only when write tools are intentionally
required.

## Claude Desktop

Add an entry like this to the Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "gmocoin": {
      "command": "node",
      "args": ["/absolute/path/to/gmocoin-mcp/dist/index.js"],
      "env": {
        "GMO_API_KEY": "your-key",
        "GMO_API_SECRET": "your-secret"
      }
    }
  }
}
```

Omit `env` for public-only access. Add
`"GMO_ENABLE_TRADING": "true"` only to enable write tools.

## Remote server (Cloudflare Workers)

The Worker entry serves the same tools over HTTPS at `/mcp`. It is stateless:
each request builds its own server and returns a single JSON body. Clients that
open a GET event stream receive `405`. Each user sends their own GMO Coin
credentials in request headers. The Worker stores no user credentials and
ignores `GMO_API_KEY` and `GMO_API_SECRET` in its own environment.

### Prerequisites

- A Cloudflare account
- Wrangler logged in (`npx wrangler login`)

### Secrets

Set the shared access token as a Worker secret so it stays out of
`wrangler.jsonc` and the git repo:

```bash
npx wrangler secret put MCP_AUTH_TOKEN
```

Generate the token with `openssl rand -hex 32` and share it only with invited
users. It is a quota gate, not a user identity. A request with a missing or
invalid token receives `401`; a valid request without GMO headers receives the
six public tools.

Remove any operator credentials left from an earlier single-user deployment:

```bash
npx wrangler secret delete GMO_API_KEY
npx wrangler secret delete GMO_API_SECRET
```

The operator must set `GMO_ENABLE_TRADING` to exactly `true` before any user's
`X-GMO-ENABLE-TRADING: true` header can enable write tools:

```bash
npx wrangler secret put GMO_ENABLE_TRADING
```

Leave this secret unset to disable trading globally. Optional
`GMO_ALLOWED_SYMBOLS` and `GMO_MAX_ORDER_SIZE` Worker values are operator
ceilings. The effective symbol list is the intersection of the operator and
user lists, and the effective maximum order size is the smaller value. Set
them with `npx wrangler secret put GMO_ALLOWED_SYMBOLS` and
`npx wrangler secret put GMO_MAX_ORDER_SIZE` when needed.

Local `npm run dev:worker` reads the operator settings from `.dev.vars` (see
`.dev.vars.example`). User credentials still come from request headers.

### Deploy

```bash
npm run deploy
```

The endpoint is `https://gmocoin-mcp.<subdomain>.workers.dev/mcp`.

### Client setup

Example for Claude Code:

Create a project `.mcp.json` and export the referenced values in the shell that
starts Claude Code. Claude Code supports `${VAR}` expansion in project MCP
header values. Clients must support custom HTTP headers; OAuth-only custom
connectors such as claude.ai are not supported by this deployment model.

```json
{
  "mcpServers": {
    "gmocoin": {
      "type": "http",
      "url": "https://gmocoin-mcp.<subdomain>.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer ${GMOCOIN_MCP_TOKEN}",
        "X-GMO-API-KEY": "${GMO_API_KEY}",
        "X-GMO-API-SECRET": "${GMO_API_SECRET}"
      }
    }
  }
}
```

Add `"X-GMO-ENABLE-TRADING": "true"` only when write tools are required and
the operator has enabled trading. Users can also tighten the operator ceilings
with `X-GMO-ALLOWED-SYMBOLS` and `X-GMO-MAX-ORDER-SIZE`.

The command-line alternative is:

```bash
claude mcp add --transport http gmocoin https://gmocoin-mcp.<subdomain>.workers.dev/mcp \
  --header "Authorization: Bearer <token>" \
  --header "X-GMO-API-KEY: <key>" \
  --header "X-GMO-API-SECRET: <secret>"
```

This command puts all header values in shell history and stores them as plain
text in `~/.claude.json`. `claude mcp get gmocoin` prints the header values
unmasked; `claude mcp list` does not.

### Security notes

Cloudflare Workers has no fixed egress IP, so a GMO API key IP allow-list does
not work with this deployment. Every user's key must have no IP allow-list.
Use a separate key from any locally IP-restricted key and grant only the
function permissions needed for the intended tools.

Users must trust the Worker operator. The secret travels to Cloudflare over TLS
on every request and exists as plaintext in Worker memory while the request is
signed, even though the Worker does not store it.

Never run `wrangler tail` in any format or attach a Tail Worker while users are
connected. Tail events include custom request headers without redaction. The
Worker configuration disables invocation logs; keep invocation logs disabled
and never add code that logs requests or headers.

`MCP_AUTH_TOKEN` is mandatory. If it is unset, every request is refused.
Optionally put Cloudflare Access in front of the Worker.

If the shared token leaks, rotate it: generate a new one, run
`npx wrangler secret put MCP_AUTH_TOKEN`, then update each invited client's
configuration.

## Tools

### Public (always available)

- `gmo_get_status`
- `gmo_get_ticker`
- `gmo_get_orderbooks`
- `gmo_get_trades`
- `gmo_get_klines`
- `gmo_get_symbols`

### Private read (credentials required)

- `gmo_get_margin`
- `gmo_get_assets`
- `gmo_get_trading_volume`
- `gmo_get_fiat_deposit_history`
- `gmo_get_fiat_withdrawal_history`
- `gmo_get_crypto_deposit_history`
- `gmo_get_crypto_withdrawal_history`
- `gmo_get_exchange_fee_history`
- `gmo_get_orders`
- `gmo_get_active_orders`
- `gmo_get_executions`
- `gmo_get_latest_executions`
- `gmo_get_open_positions`
- `gmo_get_position_summary`

### Private write (credentials and trading flag required)

- `gmo_place_order`
- `gmo_change_order`
- `gmo_cancel_order`
- `gmo_cancel_orders`
- `gmo_cancel_bulk_order`
- `gmo_close_order`
- `gmo_close_bulk_order`
- `gmo_change_losscut_price`
- `gmo_transfer_jpy`

`gmo_transfer_jpy` transfers JPY between the crypto account and the GMO
foreign-exchange (FX) account, not between spot and leverage. The API accepts
`WITHDRAWAL` and `DEPOSIT`, but the direction relative to the crypto account is
not documented; verify the direction in the member page before use. An FX
account is required, and the endpoint is limited to one call per three minutes.

## Numeric values

Prices, sizes, amounts, balances, and other precision-sensitive API values are
kept as strings. Do not convert them to floating-point numbers. Identifiers and
pagination fields that the API defines as numbers remain numbers.

Symbols are accepted as strings instead of a fixed enum so newly listed symbols
work without a server release. The GMO Coin API reports invalid symbols.

## Development

```bash
npm test
npm run typecheck
npm run build
```

The test suite covers HMAC signing, query-string exclusion, response envelopes,
error bodies, and all three tool-registration safety-gate states.
