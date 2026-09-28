import { z } from "zod";
import { ResponseFormat } from "../constants.js";

export const UploadReceiptSchema = z
  .object({
    content_base64: z
      .string()
      .min(1)
      .describe("Base64-encoded file contents (PDF, JPG, JPEG, PNG, or TIF)"),
    filename: z
      .string()
      .min(1)
      .describe("Filename including extension, e.g. receipt.pdf or kvitto.jpg"),
    inbox_path: z
      .enum(["inbox_v", "inbox_s", "inbox_a", "inbox_b", "inbox_kf", "inbox"])
      .default("inbox_v")
      .describe(
        "Fortnox inbox folder. inbox_v = vouchers (kvitton), inbox_s = supplier invoices",
      ),
    voucher_series: z
      .string()
      .min(1)
      .max(2)
      .optional()
      .describe("If set with voucher_number, connect the uploaded file to that voucher"),
    voucher_number: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Voucher number to attach the file to"),
    financial_year: z
      .number()
      .int()
      .optional()
      .describe("Fortnox financial year Id when connecting to a voucher"),
    response_format: z
      .nativeEnum(ResponseFormat)
      .default(ResponseFormat.MARKDOWN)
      .describe("Output format: markdown or json"),
  })
  .strict()
  .refine(
    (v) =>
      (v.voucher_series === undefined && v.voucher_number === undefined) ||
      (v.voucher_series !== undefined && v.voucher_number !== undefined),
    { message: "voucher_series and voucher_number must be provided together" },
  );

export type UploadReceiptInput = z.infer<typeof UploadReceiptSchema>;

export const ConnectFileToVoucherSchema = z
  .object({
    file_id: z.string().min(1).describe("File Id returned from inbox upload"),
    voucher_series: z.string().min(1).max(2).describe("Voucher series, e.g. K or A"),
    voucher_number: z.number().int().min(1).describe("Voucher number"),
    financial_year: z.number().int().optional().describe("Fortnox financial year Id"),
    response_format: z
      .nativeEnum(ResponseFormat)
      .default(ResponseFormat.MARKDOWN)
      .describe("Output format: markdown or json"),
  })
  .strict();

export type ConnectFileToVoucherInput = z.infer<typeof ConnectFileToVoucherSchema>;
