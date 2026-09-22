# GMO Coin MCP Server

An MCP server for the GMO Coin REST API. It exposes public market data, private
account data, and opt-in trading tools over stdio.

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
