import { google } from "googleapis";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptGoogleRefreshToken } from "@/lib/crypto/token-encrypt";
import { getOAuth2Client } from "@/lib/integrations/google-oauth";

export async function sendInvoiceViaGmail(opts: {
  userId: string;
  to: string;
  subject: string;
  htmlBody: string;
  pdfBuffer: Buffer;
  filename: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("user_google_integrations")
    .select("*")
    .eq("user_id", opts.userId)
    .single();
  if (error || !row) throw new Error("Google account not connected");

  const refreshToken = decryptGoogleRefreshToken(
    row.refresh_token_ciphertext as string,
    row.refresh_token_iv as string,
    row.refresh_token_tag as string,
  );

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const boundary = "boundary_worksupp_" + Math.random().toString(36).slice(2);
  const pdfB64 = opts.pdfBuffer.toString("base64").replace(/(.{76})/g, "$1\r\n");
  const htmlB64 = Buffer.from(opts.htmlBody, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");

  const lines = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    htmlB64,
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${opts.filename.replace(/"/g, "")}"`,
    "",
    pdfB64,
    `--${boundary}--`,
  ];

  const raw = Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}
