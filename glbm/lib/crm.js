import { supabase } from "./queries";

// ============================================================
// CRM data access.
//
// Most of the timeline writes itself from database triggers —
// sending a deal, a reply landing, a pro forma being opened.
// What's here is the manual layer: moving cards, notes, tasks.
// ============================================================

export const STAGES = [
  { id: "sent", label: "Sent", hint: "Deal is in their inbox" },
  { id: "viewed", label: "Viewed", hint: "Opened the pro forma" },
  { id: "reviewing", label: "Reviewing", hint: "Replied, working through it" },
  { id: "call_scheduled", label: "Call set", hint: "Time on the calendar" },
  { id: "offer", label: "Offer", hint: "Number on the table" },
  { id: "committed", label: "Committed", hint: "Verbal, going to contract" },
  { id: "closed", label: "Closed", hint: "Funded" },
];

export const ACTIVITY_ICONS = {
  email_sent: "→",
  email_replied: "←",
  follow_up_sent: "↻",
  proforma_viewed: "◉",
  stage_changed: "⇢",
  call: "☎",
  meeting: "◈",
  note: "✎",
  task_completed: "✓",
};

// ---------- pipeline ----------

export async function getPipeline() {
  const { data, error } = await supabase
    .from("pipeline_board")
    .select("*")
    .order("position");
  if (error) throw error;
  return data;
}

export async function moveCard(interestId, stage, position = 0) {
  const { data, error } = await supabase
    .from("deal_interests")
    .update({ stage, position })
    .eq("id", interestId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInterest(interestId, patch) {
  const { data, error } = await supabase
    .from("deal_interests")
    .update(patch)
    .eq("id", interestId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function passOnDeal(interestId, reason) {
  return updateInterest(interestId, { stage: "passed", passed_reason: reason });
}

export async function addInterest(dealId, contactId) {
  const { data, error } = await supabase
    .from("deal_interests")
    .upsert({ deal_id: dealId, contact_id: contactId, stage: "sent" }, { onConflict: "deal_id,contact_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getStalled() {
  const { data, error } = await supabase.from("pipeline_stalled").select("*");
  if (error) throw error;
  return data;
}

// ---------- contacts ----------

export async function listContacts() {
  const { data, error } = await supabase
    .from("contact_summary")
    .select("*")
    .order("last_activity_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function getContact(id) {
  const [contact, activities, tasks, interests] = await Promise.all([
    supabase.from("contact_summary").select("*").eq("id", id).single(),
    supabase
      .from("contact_activities")
      .select("*, deals(slug, address_line, city)")
      .eq("contact_id", id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    supabase
      .from("contact_tasks")
      .select("*, deals(slug, address_line)")
      .eq("contact_id", id)
      .order("due_date", { nullsFirst: false }),
    supabase
      .from("pipeline_board")
      .select("*")
      .eq("contact_id", id),
  ]);

  if (contact.error) throw contact.error;
  return {
    contact: contact.data,
    activities: activities.data || [],
    tasks: tasks.data || [],
    interests: interests.data || [],
  };
}

export async function updateContact(id, patch) {
  const { data, error } = await supabase
    .from("deal_contacts")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- activities ----------

// Manual entries only — calls, meetings, notes. Everything else
// arrives from a trigger with is_automatic = true.
export async function logActivity({ contactId, dealId, type, title, detail, occurredAt, actorEmail }) {
  const { data, error } = await supabase
    .from("contact_activities")
    .insert({
      contact_id: contactId,
      deal_id: dealId || null,
      activity_type: type,
      title,
      detail: detail || null,
      is_automatic: false,
      actor_email: actorEmail || null,
      occurred_at: occurredAt || new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- tasks ----------

export async function listOpenTasks() {
  const { data, error } = await supabase
    .from("contact_tasks")
    .select("*, deal_contacts(full_name), deals(slug, address_line)")
    .is("completed_at", null)
    .order("due_date", { nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function createTask({ contactId, dealId, title, detail, dueDate, priority }) {
  const { data, error } = await supabase
    .from("contact_tasks")
    .insert({
      contact_id: contactId,
      deal_id: dealId || null,
      title,
      detail: detail || null,
      due_date: dueDate || null,
      priority: priority || "normal",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function completeTask(taskId) {
  const { data: task } = await supabase
    .from("contact_tasks")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .select()
    .single();

  if (task?.contact_id) {
    await logActivity({
      contactId: task.contact_id,
      dealId: task.deal_id,
      type: "task_completed",
      title: task.title,
    });
  }
  return task;
}
