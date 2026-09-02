import { createClient } from "@supabase/supabase-js";
import { sendGmail } from "../../../lib/gmail";

// ============================================================
// POST /api/send-deal
// Sends from the connected Workspace mailbox, attaches selected
// documents, and logs the outreach with its Gmail thread id.
// ============================================================

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIME_BY_EXT = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export async function POST(req) {
  try {
    const {
      dealId,
      contactId,
      subject,
      body,
      documentIds = [],
      snapshotId,
      accountId,
    } = await req.json();

    if (!dealId || !contactId || !subject || !body) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: contact, error: contactErr } = await admin
      .from("deal_contacts")
      .select("id, full_name, email")
      .eq("id", contactId)
      .single();
    if (contactErr) throw contactErr;

    // Gmail caps a message at 25MB. Stop before Google does, with a
    // message that says what to do about it.
    const attachments = [];
    let totalBytes = 0;

    if (documentIds.length) {
      const { data: docs } = await admin
        .from("deal_documents")
        .select("title, storage_path, file_type")
        .in("id", documentIds);

      for (const doc of docs || []) {
        if (!doc.storage_path) continue;
        const { data: file, error } = await admin.storage
          .from("deal-documents")
          .download(doc.storage_path);
        if (error) continue;

        const buf = Buffer.from(await file.arrayBuffer());
        totalBytes += buf.length;
        if (totalBytes > 24 * 1024 * 1024) {
          throw new Error(
            "Attachments exceed Gmail's 25MB limit. Send the largest as a link instead."
          );
        }
        const ext = (doc.file_type || "pdf").toLowerCase();
        attachments.push({
          filename: `${doc.title.replace(/[^\w\s-]/g, "")}.${ext}`,
          mimeType: MIME_BY_EXT[ext] || "application/octet-stream",
          content: buf,
        });
      }
    }

    const sent = await sendGmail({
      accountId,
      to: contact.email,
      toName: contact.full_name,
      subject,
      text: body,
      attachments,
    });

    const { data: outreach, error: logErr } = await admin
      .from("deal_outreach")
      .insert({
        deal_id: dealId,
        contact_id: contactId,
        channel: "email",
        subject,
        body,
        documents: documentIds,
        status: "sent",
        gmail_message_id: sent.messageId,
        gmail_thread_id: sent.threadId,
        sent_from_account_id: sent.accountId,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (logErr) throw logErr;

    if (snapshotId) {
      await admin
        .from("pro_forma_snapshots")
        .update({ sent_to_contact_id: contactId })
        .eq("id", snapshotId);
    }

    return Response.json({
      ok: true,
      outreachId: outreach.id,
      threadId: sent.threadId,
      from: sent.from,
      attachments: attachments.length,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
