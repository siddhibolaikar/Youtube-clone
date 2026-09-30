import { writeFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { renderInvoiceHtml, renderInvoicePdf, renderInvoiceText, type InvoiceData } from "./invoice";

const sample: InvoiceData = {
  invoiceNumber: "INV-20260930-ABC123",
  issuedAt: new Date("2026-09-30T14:15:00Z"),
  customerName: "Piush <script>",
  customerEmail: "piush@example.com",
  productName: "Silver plan",
  amountPaise: 5000,
  includes: ["10 minutes per video", "Downloads: 1 per day (unlimited with Premium)"],
  orderId: "order_TiHOo5df0vuFMR",
  paymentId: "pay_TiHQ9xYz12AbCd",
  testMode: true,
};

describe("invoice", () => {
  it("renders a PDF with the embedded Noto Sans font", async () => {
    const pdf = await renderInvoicePdf(sample);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("NotoSans");
    // INVOICE_PREVIEW=dir writes the file so it can be eyeballed.
    if (process.env.INVOICE_PREVIEW) writeFileSync(path.join(process.env.INVOICE_PREVIEW, "invoice.pdf"), pdf);
  });

  it("HTML has every required field, IST time, test-mode marker, and escapes user data", () => {
    const html = renderInvoiceHtml(sample);
    for (const s of ["INV-20260930-ABC123", "piush@example.com", "Silver plan", "₹50", "order_TiHOo5df0vuFMR", "pay_TiHQ9xYz12AbCd", "TEST MODE", "10 minutes per video"]) {
      expect(html).toContain(s);
    }
    // 14:15 UTC = 19:45 IST
    expect(html).toMatch(/7:45\s?pm IST/i);
    expect(html).toContain("Piush &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("plain-text fallback carries the same facts", () => {
    const text = renderInvoiceText(sample);
    expect(text).toContain("Amount: ₹50");
    expect(text).toContain("TEST MODE");
  });

  it("omits the test marker for live payments", () => {
    expect(renderInvoiceHtml({ ...sample, testMode: false })).not.toContain("TEST MODE");
  });
});
