# Fortnox MCP Server

An MCP (Model Context Protocol) server for integrating with the Fortnox Swedish accounting system. This server enables LLMs to interact with Fortnox for managing invoices, customers, suppliers, orders, accounts, vouchers, and provides business intelligence analytics.

## Two Ways to Use

| Mode | Best For | Setup |
|------|----------|-------|
| **Remote Mode** | End users | Just add URL, authorize in browser |
| **Local Mode** | Developers, self-hosted | Configure environment variables |

---

## Quick Start: Remote Mode (Recommended)

The easiest way to use Fortnox MCP - no credentials needed, just authorize in your browser.

### Option A: Add to Claude.ai (Web)

1. Go to [claude.ai](https://claude.ai)
2. Navigate to **Settings** → **Integrations** → **Add Integration**
3. Enter the URL: `https://fortnox-mcp.vercel.app/mcp`
4. Wait for it to load, then authorize access by clicking connect

### Option B: Add to Claude Desktop

Open your Claude Desktop config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "fortnox": {
      "url": "https://fortnox-mcp.vercel.app/mcp"
    }
  }
}
```

Restart Claude Desktop. When you first ask Claude to do something with Fortnox, a browser window will open for you to authorize access to your Fortnox account. Once authorized, you're all set!

---

## Quick Start: Local Mode (Self-Hosted)

For developers who want to run the server locally or use their own Fortnox app credentials.

### 1. Get your Fortnox credentials

1. Register at [Fortnox Developer Portal](https://developer.fortnox.se)
2. Create an application to get your **Client ID** and **Client Secret**
3. Complete the OAuth2 flow to get a **Refresh Token**

### 2. Add to Claude Desktop

Open your Claude Desktop config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "fortnox": {
      "command": "npx",
      "args": ["-y", "fortnox-mcp-server"],
      "env": {
        "FORTNOX_CLIENT_ID": "your-client-id",
        "FORTNOX_CLIENT_SECRET": "your-client-secret",
        "FORTNOX_REFRESH_TOKEN": "your-refresh-token"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

That's it! You can now ask Claude to manage your Fortnox invoices, customers, and more.

---

## Features

### Customer Management
- `fortnox_list_customers` - List and search customers
- `fortnox_get_customer` - Get customer details
- `fortnox_create_customer` - Create new customer
- `fortnox_update_customer` - Update customer
- `fortnox_delete_customer` - Delete customer

### Invoice Management
- `fortnox_list_invoices` - List invoices with filtering
- `fortnox_get_invoice` - Get invoice details with line items
- `fortnox_create_invoice` - Create new invoice
- `fortnox_update_invoice` - Update draft invoice
- `fortnox_bookkeep_invoice` - Bookkeep invoice
- `fortnox_cancel_invoice` - Cancel invoice
- `fortnox_credit_invoice` - Create credit note
- `fortnox_send_invoice_email` - Send invoice by email

### Supplier Management
- `fortnox_list_suppliers` - List and search suppliers
- `fortnox_get_supplier` - Get supplier details
- `fortnox_create_supplier` - Create new supplier
- `fortnox_update_supplier` - Update supplier
- `fortnox_delete_supplier` - Delete supplier

### Supplier Invoice Management
- `fortnox_list_supplier_invoices` - List supplier invoices with filtering
- `fortnox_get_supplier_invoice` - Get supplier invoice details
- `fortnox_approve_supplier_invoice` - Approve supplier invoice for payment
- `fortnox_payables_report` - Get accounts payable aging report

### Order Management
- `fortnox_list_orders` - List sales orders with filtering
- `fortnox_list_offers` - List offers/quotes with filtering

### Account Management
- `fortnox_list_accounts` - List chart of accounts
- `fortnox_get_account` - Get account details
- `fortnox_create_account` - Create new account
- `fortnox_update_account` - Update account
- `fortnox_delete_account` - Delete account

### Voucher Management
- `fortnox_list_vouchers` - List vouchers (journal entries)
- `fortnox_get_voucher` - Get voucher details with rows
- `fortnox_create_voucher` - Create manual voucher
- `fortnox_list_voucher_series` - List available voucher series
- `fortnox_account_activity` - Get activity for a specific account
- `fortnox_search_vouchers` - Search vouchers by description, account, or amount

### Company Information
- `fortnox_get_company_info` - Get company details
- `fortnox_list_financial_years` - List company financial years

### Analytics
- `fortnox_invoice_summary` - Get invoice statistics by period
- `fortnox_top_customers` - Get top customers by revenue
- `fortnox_unpaid_report` - Get detailed unpaid invoice report

### Business Intelligence
- `fortnox_cash_flow_forecast` - Forecast cash flow based on invoices and payables
- `fortnox_order_pipeline` - Analyze sales order pipeline
- `fortnox_sales_funnel` - Analyze sales funnel from offers to invoices
- `fortnox_product_performance` - Analyze product/article performance
- `fortnox_period_comparison` - Compare financial metrics across periods
- `fortnox_customer_growth` - Analyze customer acquisition and growth
- `fortnox_project_profitability` - Analyze project profitability (if using projects)
- `fortnox_cost_center_analysis` - Analyze costs by cost center
- `fortnox_expense_analysis` - Analyze expenses by category
- `fortnox_yearly_comparison` - Compare year-over-year performance
- `fortnox_gross_margin_trend` - Track gross margin trends over time

## Installation

### Via npx (Recommended)

No installation needed! Just add the config above to Claude Desktop.

### Manual Installation

```bash
npm install -g fortnox-mcp-server
```

### From Source

```bash
git clone https://github.com/jakobwennberg/fortnox-mcp.git
cd fortnox-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

#### Local Mode (default)

| Variable | Required | Description |
|----------|----------|-------------|
| `FORTNOX_CLIENT_ID` | Yes | Your Fortnox app client ID |
| `FORTNOX_CLIENT_SECRET` | Yes | Your Fortnox app client secret |
| `FORTNOX_REFRESH_TOKEN` | Yes | OAuth2 refresh token |
| `FORTNOX_ACCESS_TOKEN` | No | Current access token (auto-refreshed) |
| `TRANSPORT` | No | `stdio` (default) or `http` |
| `PORT` | No | HTTP port (default: 3000) |

#### Remote Mode (AUTH_MODE=remote)

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_MODE` | Yes | Set to `remote` |
| `SERVER_URL` | Yes | Public URL of your server |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `FORTNOX_CLIENT_ID` | Yes | Your Fortnox app client ID |
| `FORTNOX_CLIENT_SECRET` | Yes | Your Fortnox app client secret |
| `UPSTASH_REDIS_REST_URL` | Yes* | Upstash Redis URL for token storage |
| `UPSTASH_REDIS_REST_TOKEN` | Yes* | Upstash Redis token |
| `PORT` | No | HTTP port (default: 3000) |

*Falls back to in-memory storage if not provided (not recommended for production)

### Getting OAuth Credentials

1. Register as a developer at [Fortnox Developer Portal](https://developer.fortnox.se)
2. Create a new application to get Client ID and Client Secret
3. Complete the OAuth2 authorization flow to obtain a refresh token
4. Set the environment variables

## Usage

### With Claude Desktop

See [Quick Start](#quick-start-claude-desktop) above.

### As HTTP Server

```bash
TRANSPORT=http PORT=3000 node dist/index.js
```

Then connect to `http://localhost:3000/mcp`

## Tool Examples

### List Unpaid Invoices
```json
{
  "tool": "fortnox_list_invoices",
  "arguments": {
    "filter": "unpaid",
    "limit": 20
  }
}
```

### Create Invoice
```json
{
  "tool": "fortnox_create_invoice",
  "arguments": {
    "customer_number": "1001",
    "rows": [
      {
        "description": "Consulting services",
        "quantity": 10,
        "price": 1000
      }
    ]
  }
}
```

### Create Voucher
```json
{
  "tool": "fortnox_create_voucher",
  "arguments": {
    "voucher_series": "A",
    "description": "Office supplies",
    "transaction_date": "2025-01-24",
    "rows": [
      { "account_number": 6110, "debit": 500 },
      { "account_number": 1910, "credit": 500 }
    ]
  }
}
```

## Rate Limiting

The Fortnox API allows 25 requests per 5 seconds. This server includes automatic rate limiting to prevent exceeding this limit.

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Build for production
npm run build

# Clean build artifacts
npm run clean
```

## Publishing & Distribution

This server is published to multiple registries for easy installation:

| Registry | URL | Purpose |
|----------|-----|---------|
| **npm** | [npmjs.com/package/fortnox-mcp-server](https://www.npmjs.com/package/fortnox-mcp-server) | Package distribution via `npx` |
| **MCP Registry** | [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io) | Official MCP server discovery |
| **GitHub** | [github.com/jakobwennberg/fortnox-mcp](https://github.com/jakobwennberg/fortnox-mcp) | Source code |

### How It Works

1. **User adds config** to Claude Desktop with `npx fortnox-mcp-server`
2. **Claude Desktop starts the server** via npx (downloads latest version from npm)
3. **Server authenticates** with Fortnox using OAuth2 credentials from environment variables
4. **Claude can now use tools** like `fortnox_list_invoices`, `fortnox_create_customer`, etc.
5. **Server handles API calls** to Fortnox, including automatic token refresh and rate limiting

### Releasing New Versions

To release a new version, use the release script:

```bash
# Bug fixes (1.0.0 → 1.0.1)
npm run release:patch

# New features (1.0.0 → 1.1.0)
npm run release:minor

# Breaking changes (1.0.0 → 2.0.0)
npm run release:major
```

The release script automatically:
1. Bumps the version in `package.json`
2. Updates `server.json` for the MCP Registry
3. Builds the project
4. Commits and tags the release
5. Publishes to npm
6. Publishes to MCP Registry
7. Pushes to GitHub

**Prerequisites for releasing:**
- `npm login` - Logged into npm
- `mcp-publisher login github` - Logged into MCP Registry
- Clean git working directory

### Users Get Updates Automatically

When you publish a new version, users running `npx -y fortnox-mcp-server` will automatically get the latest version the next time they restart Claude Desktop.

---

## Deploying Your Own Remote Server

Want to host your own instance of the Fortnox MCP server? Follow these instructions.

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jakobwennberg/fortnox-mcp)

#### 1. Prerequisites

- A [Vercel](https://vercel.com) account
- An [Upstash Redis](https://upstash.com) database (for token storage)
- A [Fortnox Developer](https://developer.fortnox.se) account with an app created

#### 2. Set Environment Variables

In your Vercel project settings, add these environment variables:

| Variable | Description |
|----------|-------------|
| `AUTH_MODE` | Set to `remote` |
| `SERVER_URL` | Your Vercel deployment URL (e.g., `https://your-app.vercel.app`) |
| `JWT_SECRET` | A random secret string for signing tokens (generate with `openssl rand -hex 32`) |
| `FORTNOX_CLIENT_ID` | Your Fortnox app client ID |
| `FORTNOX_CLIENT_SECRET` | Your Fortnox app client secret |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |

#### 3. Configure Fortnox OAuth Callback

In your Fortnox app settings, add this redirect URI:
```
https://your-app.vercel.app/oauth/fortnox/callback
```

#### 4. Deploy

```bash
vercel --prod
```

### Server Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /.well-known/oauth-authorization-server` | OAuth metadata |
| `POST /authorize` | Start OAuth flow |
| `POST /token` | Exchange code for tokens |
| `GET /oauth/fortnox/callback` | Fortnox OAuth callback |
| `POST /mcp` | Protected MCP endpoint |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    fortnox-mcp-server                       │
├─────────────────────────────────────────────────────────────┤
│   Mode: AUTH_MODE=local | remote                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   LOCAL MODE                    REMOTE MODE                 │
│   ───────────                   ───────────                 │
│   • Env var tokens              • OAuth flow                │
│   • Single user                 • Multi-user                │
│   • stdio or HTTP               • HTTP only                 │
│                                 • Token storage (Redis)     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## License

MIT
