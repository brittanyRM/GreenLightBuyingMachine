import { admin } from "./supabaseAdmin";

// ============================================================
// Gmail send + thread reading for Google Workspace.
//
// Mail goes out from the sender's real mailbox, so it lands in
// their Sent folder and replies thread normally in Gmail.
// Server-only — never import this into a client component.
// ============================================================

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

// ---------- tokens ----------

export async function getAccount(accountId = null) {
  const db = admin();
  const q = db.from("email_accounts").select("*");
  const { data, error } = accountId
    ? await q.eq("id", accountId).single()
    : await q.eq("is_default", true).single();
  if (error) throw new Error("No connected Google Workspace account.");
  return data;
}

// Access tokens last an hour. Refresh when we're inside a minute of expiry.
export async function getAccessToken(account) {
  const stillValid =
    account.access_token &&
    account.token_expires_at &&
    new Date(account.token_expires_at).getTime() - Date.now() > 60_000;
  if (stillValid) return account.access_token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();

  if (!res.ok) {
    await admin()
      .from("email_accounts")
      .update({ last_error: json.error_description || json.error })
      .eq("id", account.id);
    throw new Error(
      `Google token refresh failed: ${json.error_description || json.error}. Reconnect the account.`
    );
  }

  await admin()
    .from("email_accounts")
    .update({
      access_token: json.access_token,
      token_expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      last_error: null,
    })
    .eq("id", account.id);

  return json.access_token;
}

// ---------- MIME ----------

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// RFC 2047 encoding so names with accents or symbols survive the header.
const encodeHeader = (s) =>
  /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;

function htmlFromText(text) {
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">${text
    .split("\n")
    .map((l) => (l.trim() === "" ? "<br/>" : `<p style="margin:0 0 10px">${esc(l)}</p>`))
    .join("")}</div>`;
}

export function buildMime({ from, fromName, to, toName, subject, text, attachments = [], inReplyTo, references }) {
  const boundary = `glbm_${Math.random().toString(36).slice(2)}`;
  const altBoundary = `alt_${Math.random().toString(36).slice(2)}`;

  const headers = [
    `From: ${fromName ? `${encodeHeader(fromName)} <${from}>` : from}`,
    `To: ${toName ? `${encodeHeader(toName)} <${to}>` : to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${references || inReplyTo}`);

  const body = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    text,
    "",
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    htmlFromText(text),
    "",
    `--${altBoundary}--`,
  ].join("\r\n");

  if (!attachments.length) {
    return b64url([...headers, "", body].join("\r\n"));
  }

  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    body,
    "",
  ];

  for (const a of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${a.mimeType || "application/octet-stream"}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(a.content).toString("base64").replace(/(.{76})/g, "$1\r\n"),
      ""
    );
  }
  parts.push(`--${boundary}--`);

  return b64url(parts.join("\r\n"));
}

// ---------- send ----------

export async function sendGmail({ accountId, to, toName, subject, text, attachments = [], threadId, inReplyTo }) {
  const account = await getAccount(accountId);
  const token = await getAccessToken(account);

  const raw = buildMime({
    from: account.email,
    fromName: account.display_name,
    to,
    toName,
    subject,
    text,
    attachments,
    inReplyTo,
  });

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Gmail send failed");

  return { messageId: json.id, threadId: json.threadId, accountId: account.id, from: account.email };
}

// ---------- reply detection ----------

// A thread with a message from anyone other than us means they answered.
export async function threadHasReply({ accountId, threadId }) {
  const account = await getAccount(accountId);
  const token = await getAccessToken(account);

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return { replied: false, error: true };

  const thread = await res.json();
  const ours = account.email.toLowerCase();

  for (const msg of thread.messages || []) {
    const from =
      msg.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value || "";
    if (!from.toLowerCase().includes(ours)) {
      return {
        replied: true,
        repliedAt: new Date(Number(msg.internalDate)).toISOString(),
        from,
      };
    }
  }
  return { replied: false };
}
