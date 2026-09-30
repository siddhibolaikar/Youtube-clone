import path from "path";
import PDFDocument from "pdfkit";
import { formatIst } from "../ist";
import { formatInr, getProduct } from "../plans";
import { adminDb } from "./firebaseAdmin";
import { escapeHtml, getMailer } from "./mailer";
import type { PaymentDoc } from "./payments";

export interface InvoiceData {
  invoiceNumber: string;
  issuedAt: Date;
  customerName: string;
  customerEmail: string;
  productName: string;
  amountPaise: number;
  includes: string[];
  orderId: string;
  paymentId: string;
  testMode: boolean;
}

// Noto Sans has the ₹ glyph; pdfkit's built-in Helvetica does not.
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "NotoSans-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "NotoSans-Bold.ttf");

const BRAND = "#dc2626";
const MUTED = "#6b7280";

export function renderInvoicePdf(d: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Invoice ${d.invoiceNumber}`, Author: "YourTube" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("body", FONT_REGULAR);
    doc.registerFont("bold", FONT_BOLD);

    doc.font("bold").fontSize(24).fillColor(BRAND).text("YourTube", 50, 50);
    doc.font("bold").fontSize(18).fillColor("#111827").text("INVOICE", 50, 55, { align: "right" });
    if (d.testMode) {
      doc.font("bold").fontSize(10).fillColor("#b45309").text("TEST MODE: no real money was charged", 50, 80, { align: "right" });
    }

    doc.moveTo(50, 105).lineTo(545, 105).strokeColor("#e5e7eb").stroke();

    const row = (label: string, value: string, y: number) => {
      doc.font("body").fontSize(10).fillColor(MUTED).text(label, 50, y, { width: 140 });
      doc.font("body").fontSize(10).fillColor("#111827").text(value, 190, y, { width: 355 });
    };
    let y = 120;
    for (const [label, value] of [
      ["Invoice number", d.invoiceNumber],
      ["Date", formatIst(d.issuedAt)],
      ["Billed to", `${d.customerName}\n${d.customerEmail}`],
      ["Razorpay order ID", d.orderId],
      ["Razorpay payment ID", d.paymentId],
    ] as const) {
      row(label, value, y);
      y += label === "Billed to" ? 34 : 20;
    }

    y += 15;
    doc.rect(50, y, 495, 24).fill("#f3f4f6");
    doc.font("bold").fontSize(10).fillColor("#111827").text("Item", 60, y + 7).text("Amount", 50, y + 7, { width: 485, align: "right" });
    y += 34;
    doc.font("bold").fontSize(11).text(d.productName, 60, y);
    doc.font("bold").fontSize(11).text(formatInr(d.amountPaise), 50, y, { width: 485, align: "right" });
    y += 20;
    for (const line of d.includes) {
      doc.font("body").fontSize(10).fillColor(MUTED).text(`• ${line}`, 70, y);
      y += 16;
    }

    y += 10;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e5e7eb").stroke();
    y += 12;
    doc.font("bold").fontSize(13).fillColor("#111827").text("Total paid", 60, y);
    doc.text(formatInr(d.amountPaise), 50, y, { width: 485, align: "right" });

    doc
      .font("body")
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        "Payment processed by Razorpay. This is a computer-generated invoice and needs no signature. " +
          "YourTube is a demo project; prices are inclusive of all taxes.",
        50,
        760,
        { width: 495, align: "center" }
      );
    doc.end();
  });
}

export function renderInvoiceHtml(d: InvoiceData): string {
  const e = escapeHtml;
  const rows: [string, string][] = [
    ["Invoice number", d.invoiceNumber],
    ["Date", formatIst(d.issuedAt)],
    ["Name", d.customerName],
    ["Email", d.customerEmail],
    ["Plan", d.productName],
    ["Amount", formatInr(d.amountPaise)],
    ["Razorpay order ID", d.orderId],
    ["Razorpay payment ID", d.paymentId],
  ];
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:${BRAND};color:#fff;padding:20px 24px">
    <div style="font-size:22px;font-weight:bold">YourTube</div>
    <div style="opacity:.9">Payment receipt · ${e(d.invoiceNumber)}</div>
  </div>
  ${d.testMode ? `<div style="background:#fef3c7;color:#92400e;padding:10px 24px;font-weight:bold;font-size:13px">TEST MODE: no real money was charged</div>` : ""}
  <div style="padding:24px">
    <p style="margin-top:0">Hi ${e(d.customerName)}, thanks for your purchase. Your <b>${e(d.productName)}</b> is active now.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 0;color:${MUTED};width:45%">${e(k)}</td><td style="padding:6px 0">${e(v)}</td></tr>`
        )
        .join("")}
    </table>
    <p style="margin:20px 0 6px;font-weight:bold">What's included</p>
    <ul style="margin:0;padding-left:20px;font-size:14px">${d.includes.map((i) => `<li>${e(i)}</li>`).join("")}</ul>
    <p style="margin-top:24px;font-size:12px;color:${MUTED}">The PDF invoice is attached. Payment processed by Razorpay.</p>
  </div>
</div></body></html>`;
}

export function renderInvoiceText(d: InvoiceData): string {
  return [
    d.testMode ? "TEST MODE: no real money was charged\n" : "",
    `YourTube invoice ${d.invoiceNumber}`,
    `Date: ${formatIst(d.issuedAt)}`,
    `Name: ${d.customerName}`,
    `Email: ${d.customerEmail}`,
    `Plan: ${d.productName}`,
    `Amount: ${formatInr(d.amountPaise)}`,
    `Includes: ${d.includes.join("; ")}`,
    `Razorpay order ID: ${d.orderId}`,
    `Razorpay payment ID: ${d.paymentId}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Email the invoice for a fulfilled payment. Never throws: a failed email must
 * not fail the payment. Records the outcome on payments/{id}.emailStatus.
 */
export async function sendInvoiceEmail(paymentId: string): Promise<"sent" | "failed"> {
  const db = adminDb();
  const ref = db.collection("payments").doc(paymentId);
  try {
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`payment ${paymentId} not found`);
    const p = snap.data() as PaymentDoc;
    const user = await db.collection("users").doc(p.uid).get();
    const email: string | undefined = user.get("email");
    if (!email) throw new Error(`user ${p.uid} has no email`);

    const data: InvoiceData = {
      invoiceNumber: p.invoiceNumber,
      issuedAt: p.createdAt.toDate(),
      customerName: user.get("name") || email,
      customerEmail: email,
      productName: p.productName,
      amountPaise: p.amount,
      includes: getProduct(p.product)?.includes ?? [],
      orderId: p.orderId,
      paymentId: p.paymentId,
      testMode: p.testMode,
    };
    const pdf = await renderInvoicePdf(data);
    await getMailer().send({
      to: email,
      subject: `${data.testMode ? "[TEST] " : ""}Your YourTube invoice ${data.invoiceNumber}`,
      html: renderInvoiceHtml(data),
      text: renderInvoiceText(data),
      attachments: [{ filename: `${data.invoiceNumber}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    await ref.update({ emailStatus: "sent", emailSentAt: new Date(), emailError: null });
    return "sent";
  } catch (err) {
    console.error(`[invoice] email for ${paymentId} failed:`, err);
    await ref
      .update({ emailStatus: "failed", emailError: String(err instanceof Error ? err.message : err).slice(0, 300) })
      .catch((e) => console.error("[invoice] could not record failure:", e));
    return "failed";
  }
}
