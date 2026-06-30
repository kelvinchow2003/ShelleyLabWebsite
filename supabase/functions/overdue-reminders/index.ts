// Supabase Edge Function: email contacts who have overdue equipment.
//
// Runs on Deno. Deploy with:  supabase functions deploy overdue-reminders
// Schedule it (see supabase/schedule_overdue_reminders.sql) to run daily.
//
// Required secrets (supabase secrets set ...):
//   SUPABASE_URL                — your project URL (provided automatically)
//   SUPABASE_SERVICE_ROLE_KEY   — service role key (provided automatically)
//   RESEND_API_KEY              — from https://resend.com (free tier is plenty)
//   FROM_EMAIL                  — a verified sender, e.g. "lab@yourdomain.com"
//
// It finds loans that are past their expected return date and not yet returned,
// then emails each contact once. Equipment with no contact email is skipped.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface LoanRow {
  id: string;
  equipment_id: string;
  contact_name: string;
  contact_email: string;
  expected_return_date: string;
  quantity_borrowed: number;
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'onboarding@resend.dev';

  const supabase = createClient(supabaseUrl, serviceKey);
  const today = new Date().toISOString().slice(0, 10);

  const { data: loans, error } = await supabase
    .from('equipment_loans')
    .select('id,equipment_id,contact_name,contact_email,expected_return_date,quantity_borrowed')
    .neq('status', 'returned')
    .is('actual_return_date', null)
    .lt('expected_return_date', today);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const rows = (loans ?? []) as LoanRow[];
  if (rows.length === 0) {
    return Response.json({ ok: true, sent: 0, message: 'No overdue loans.' });
  }

  // Resolve equipment names.
  const equipmentIds = [...new Set(rows.map((r) => r.equipment_id))];
  const { data: equipment } = await supabase
    .from('equipment')
    .select('id,name')
    .in('id', equipmentIds);
  const nameMap = new Map((equipment ?? []).map((e) => [e.id, e.name]));

  // Group overdue items by contact email.
  const byContact = new Map<string, { name: string; items: string[] }>();
  for (const r of rows) {
    if (!r.contact_email) continue;
    const entry = byContact.get(r.contact_email) ?? { name: r.contact_name, items: [] };
    entry.items.push(
      `${nameMap.get(r.equipment_id) ?? 'Equipment'} (×${r.quantity_borrowed}) — due ${r.expected_return_date}`
    );
    byContact.set(r.contact_email, entry);
  }

  if (!resendKey) {
    return Response.json({
      ok: false,
      message: 'RESEND_API_KEY not set — found overdue loans but cannot email.',
      overdueContacts: byContact.size,
    });
  }

  let sent = 0;
  for (const [email, { name, items }] of byContact) {
    const html = `
      <p>Hi ${name},</p>
      <p>Our records show the following Shelley Automation equipment is past its return date:</p>
      <ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>
      <p>Please arrange to return it at your earliest convenience. Thank you!</p>
    `;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: 'Overdue equipment reminder — Shelley Automation',
        html,
      }),
    });
    if (res.ok) sent++;
  }

  return Response.json({ ok: true, sent, contacts: byContact.size });
});
