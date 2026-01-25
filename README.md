# Fortnox MCP Server

An MCP (Model Context Protocol) server for integrating with the Fortnox Swedish accounting system. This server enables LLMs to interact with Fortnox for managing invoices, customers, suppliers, accounts, and vouchers.

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

### Company Information
- `fortnox_get_company_info` - Get company details

## Installation

```bash
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FORTNOX_CLIENT_ID` | Yes | Your Fortnox app client ID |
| `FORTNOX_CLIENT_SECRET` | Yes | Your Fortnox app client secret |
| `FORTNOX_REFRESH_TOKEN` | Yes | OAuth2 refresh token |
| `FORTNOX_ACCESS_TOKEN` | No | Current access token (auto-refreshed) |
| `TRANSPORT` | No | `stdio` (default) or `http` |
| `PORT` | No | HTTP port (default: 3000) |

### Getting OAuth Credentials

1. Register as a developer at [Fortnox Developer Portal](https://developer.fortnox.se)
2. Create a new application to get Client ID and Client Secret
3. Complete the OAuth2 authorization flow to obtain a refresh token
4. Set the environment variables

## Usage

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fortnox": {
      "command": "node",
      "args": ["/path/to/fortnox-mcp-server/dist/index.js"],
      "env": {
        "FORTNOX_CLIENT_ID": "your-client-id",
        "FORTNOX_CLIENT_SECRET": "your-client-secret",
        "FORTNOX_REFRESH_TOKEN": "your-refresh-token"
      }
    }
  }
}
```

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

## License

MIT
