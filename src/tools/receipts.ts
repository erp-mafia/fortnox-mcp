import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fortnoxRequest, fortnoxUploadFile } from "../services/api.js";
import { ResponseFormat } from "../constants.js";
import { buildToolResponse, buildErrorResponse } from "../services/formatters.js";
import {
  UploadReceiptSchema,
  ConnectFileToVoucherSchema,
  type UploadReceiptInput,
  type ConnectFileToVoucherInput,
} from "../schemas/receipts.js";

interface InboxFile {
  Id?: string;
  Name?: string;
  Path?: string;
  Size?: string | number;
  "@url"?: string;
}

interface InboxUploadResponse {
  File?: InboxFile;
}

interface VoucherFileConnection {
  FileId?: string;
  VoucherSeries?: string;
  VoucherNumber?: string | number;
  VoucherDescription?: string;
  VoucherYear?: string | number;
  "@url"?: string;
}

interface VoucherFileConnectionResponse {
  VoucherFileConnection?: VoucherFileConnection;
}

/**
 * Register receipt / document archive tools.
 * Requires Fortnox scopes: inbox + connectfile (and bookkeeping for vouchers).
 */
export function registerReceiptTools(server: McpServer): void {
  server.registerTool(
    "fortnox_upload_receipt",
    {
      title: "Upload Fortnox Receipt",
      description: `Upload a receipt image/PDF to the Fortnox inbox and optionally attach it to a voucher.

Uses Fortnox Archive/Inbox API:
  1. POST /3/inbox?path=inbox_v (or inbox_s for supplier invoices)
  2. Optional POST /3/voucherfileconnections to attach FileId to a voucher

Args:
  - content_base64 (string): Base64-encoded file (required)
  - filename (string): e.g. expo-kvitto.pdf (required)
  - inbox_path ('inbox_v' | 'inbox_s' | ...): default inbox_v for kvitton/vouchers
  - voucher_series / voucher_number: if both set, connect after upload
  - financial_year (number): Fortnox financial year Id when connecting
  - response_format ('markdown' | 'json')

Returns:
  Uploaded file Id and optional voucher connection.

Note: Requires OAuth scopes inbox and connectfile. Re-authorize the remote MCP if you get 403.`,
      inputSchema: UploadReceiptSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args: UploadReceiptInput) => {
      try {
        const bytes = Buffer.from(args.content_base64, "base64");
        if (bytes.length === 0) {
          throw new Error("Decoded file is empty. Check content_base64.");
        }

        const uploaded = await fortnoxUploadFile<InboxUploadResponse>(
          "/3/inbox",
          args.filename,
          bytes,
          { path: args.inbox_path },
        );

        const file = uploaded.File || {};
        const fileId = file.Id;
        if (!fileId) {
          throw new Error(
            `Upload succeeded but no File.Id in response: ${JSON.stringify(uploaded)}`,
          );
        }

        let connection: VoucherFileConnection | null = null;
        if (args.voucher_series && args.voucher_number) {
          const connected = await fortnoxRequest<VoucherFileConnectionResponse>(
            "/3/voucherfileconnections",
            "POST",
            {
              VoucherFileConnection: {
                FileId: fileId,
                VoucherSeries: args.voucher_series,
                VoucherNumber: String(args.voucher_number),
              },
            },
            args.financial_year !== undefined
              ? { financialyear: args.financial_year }
              : undefined,
          );
          connection = connected.VoucherFileConnection || null;
        }

        const output = {
          file_id: fileId,
          name: file.Name || args.filename,
          path: file.Path,
          size: file.Size,
          inbox_path: args.inbox_path,
          connection,
        };

        if (args.response_format === ResponseFormat.JSON) {
          return buildToolResponse(JSON.stringify(output, null, 2), output);
        }

        const lines = [
          `# Receipt uploaded`,
          ``,
          `- **File Id:** ${fileId}`,
          `- **Name:** ${file.Name || args.filename}`,
          `- **Inbox:** ${args.inbox_path}`,
        ];
        if (connection) {
          lines.push(
            `- **Connected to:** ${connection.VoucherSeries}${connection.VoucherNumber}`,
            connection.VoucherDescription
              ? `- **Voucher:** ${connection.VoucherDescription}`
              : "",
          );
        } else {
          lines.push(
            ``,
            `File is in the inbox. Use fortnox_connect_file_to_voucher to attach it, or pass voucher_series + voucher_number on upload.`,
          );
        }

        return buildToolResponse(lines.filter(Boolean).join("\n"), output);
      } catch (error) {
        return buildErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "fortnox_connect_file_to_voucher",
    {
      title: "Connect File to Fortnox Voucher",
      description: `Attach an already uploaded inbox file to a voucher via voucherfileconnections.

Args:
  - file_id (string): Id from fortnox_upload_receipt
  - voucher_series (string): e.g. K
  - voucher_number (number)
  - financial_year (number, optional)
  - response_format ('markdown' | 'json')

Requires connectfile scope.`,
      inputSchema: ConnectFileToVoucherSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args: ConnectFileToVoucherInput) => {
      try {
        const connected = await fortnoxRequest<VoucherFileConnectionResponse>(
          "/3/voucherfileconnections",
          "POST",
          {
            VoucherFileConnection: {
              FileId: args.file_id,
              VoucherSeries: args.voucher_series,
              VoucherNumber: String(args.voucher_number),
            },
          },
          args.financial_year !== undefined
            ? { financialyear: args.financial_year }
            : undefined,
        );

        const connection = connected.VoucherFileConnection || {};
        const output = {
          file_id: args.file_id,
          connection,
        };

        if (args.response_format === ResponseFormat.JSON) {
          return buildToolResponse(JSON.stringify(output, null, 2), output);
        }

        return buildToolResponse(
          [
            `# File connected to voucher`,
            ``,
            `- **File Id:** ${args.file_id}`,
            `- **Voucher:** ${args.voucher_series}${args.voucher_number}`,
            connection.VoucherDescription
              ? `- **Description:** ${connection.VoucherDescription}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          output,
        );
      } catch (error) {
        return buildErrorResponse(error);
      }
    },
  );
}
