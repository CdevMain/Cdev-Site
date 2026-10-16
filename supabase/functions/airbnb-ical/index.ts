// CDEV - Edge Function "airbnb-ical"
// Le (SOMENTE LEITURA) o calendario .ics exportado pelo Airbnb e grava as reservas em public.property_bookings.
// Nunca escreve nada no Airbnb: faz apenas um GET no link salvo em public.property_calendars.
// Deploy: supabase functions deploy airbnb-ical   (ou pelo painel do Supabase)
//
// POST JSON: { property_name }  -> sincroniza o calendario desse imovel (apenas admin)
// Resposta: { ok, counts: { events, reservations, blocks, created, updated, removed }, synced_at }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const ICAL_RE = /^https:\/\/([a-z0-9-]+\.)*airbnb\.[a-z.]+\/calendar\/ical\/[^\s]+$/i;

type Ev = { uid: string; start: string; end: string; summary: string; description: string; url: string };

// RFC 5545: desdobra linhas continuadas e le VEVENTs
export function parseIcs(text: string): Ev[] {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out: Ev[] = [];
  let cur: Record<string, string> | null = null;
  const unescape = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  const toDate = (v: string) => {
    const m = v.match(/(\d{4})(\d{2})(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  };
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur) out.push({ uid: cur.UID || '', start: toDate(cur.DTSTART || ''), end: toDate(cur.DTEND || ''), summary: unescape(cur.SUMMARY || ''), description: unescape(cur.DESCRIPTION || ''), url: cur.URL || '' });
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const name = line.slice(0, i).split(';')[0].toUpperCase();
    cur[name] = line.slice(i + 1);
  }
  return out.filter((e) => e.start && e.end && e.end > e.start);
}

export function classify(e: Ev) {
  const text = `${e.summary}\n${e.description}\n${e.url}`;
  const code = (text.match(/reservations\/details\/([A-Z0-9]{6,14})/i) || text.match(/\b(HM[A-Z0-9]{6,12})\b/) || [])[1] || null;
  const blocked = /not available|indispon|bloque|blocked/i.test(e.summary) && !code;
  return { code: code ? code.toUpperCase() : null, kind: blocked ? 'BLOQUEIO' : 'RESERVA' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Variáveis do Supabase ausentes na função' }, 500);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sessão ausente' }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401);
  const { data: me } = await service.from('users').select('role,active').eq('id', authData.user.id).single();
  if (!me?.active || me.role !== 'admin') return json({ error: 'Apenas administradores' }, 403);

  const payload = await req.json().catch(() => ({}));
  const propertyName = String(payload.property_name || '').trim();
  if (!propertyName) return json({ error: 'Informe o imóvel' }, 400);

  const { data: cal } = await service.from('property_calendars').select('*').eq('property_name', propertyName).maybeSingle();
  if (!cal?.ical_url) return json({ error: 'Este imóvel ainda não tem link do calendário do Airbnb.' }, 400);
  if (!ICAL_RE.test(cal.ical_url)) return json({ error: 'Link do calendário inválido (precisa ser o link .ics do Airbnb).' }, 400);

  const finish = async (status: 'OK' | 'ERRO', message: string, counts: Record<string, number> | null) => {
    await service.from('property_calendars').update({ last_sync_at: new Date().toISOString(), last_sync_status: status, last_sync_message: message, last_sync_counts: counts, updated_at: new Date().toISOString() }).eq('id', cal.id);
  };

  let text = '';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(cal.ical_url, { method: 'GET', signal: ctrl.signal, headers: { 'User-Agent': 'CDEV-calendar-reader/1.0', Accept: 'text/calendar' } });
    clearTimeout(t);
    if (!res.ok) throw new Error(`O Airbnb respondeu ${res.status}. Confira se o link ainda é válido.`);
    text = await res.text();
    if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('A resposta do link não é um calendário .ics.');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao ler o calendário';
    await finish('ERRO', msg, null);
    return json({ error: msg }, 502);
  }

  const events = parseIcs(text);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const counts = { events: events.length, reservations: 0, blocks: 0, created: 0, updated: 0, removed: 0 };

  const { data: existing, error: exErr } = await service.from('property_bookings').select('id,ical_uid,code,source,status,check_in,check_out').eq('property_name', propertyName);
  if (exErr) { await finish('ERRO', exErr.message, null); return json({ error: exErr.message }, 500); }
  const byUid = new Map((existing || []).filter((b) => b.ical_uid).map((b) => [b.ical_uid, b]));
  const byCode = new Map((existing || []).filter((b) => b.code).map((b) => [b.code, b]));
  const seen = new Set<string>();

  try {
    for (const e of events) {
      const { code, kind } = classify(e);
      if (kind === 'RESERVA') counts.reservations++; else counts.blocks++;
      const uid = e.uid || `${e.start}_${e.end}_${code || kind}`;
      const rec = { property_name: propertyName, ical_uid: uid, code, kind, summary: e.summary.slice(0, 200), check_in: e.start, check_out: e.end, status: 'ATIVA', last_seen_at: now, updated_at: now };
      const found = byUid.get(uid) || (code ? byCode.get(code) : undefined);
      if (found) {
        const patch = found.status === 'CANCELADA' ? { ...rec, status: 'CANCELADA' } : rec; // cancelamento manual prevalece
        const { error } = await service.from('property_bookings').update(patch).eq('id', found.id);
        if (error) throw error;
        seen.add(found.id); counts.updated++;
      } else {
        const { data, error } = await service.from('property_bookings').insert({ ...rec, source: 'ICAL' }).select('id').single();
        if (error) throw error;
        seen.add(data.id); counts.created++;
      }
    }
    // Reserva futura que sumiu do calendario = cancelada/alterada no Airbnb. Passadas ficam como estao
    // (o Airbnb tira reservas antigas do .ics depois de um tempo).
    const gone = (existing || []).filter((b) => b.source === 'ICAL' && b.status === 'ATIVA' && !seen.has(b.id) && b.check_out >= today);
    for (const b of gone) {
      const { error } = await service.from('property_bookings').update({ status: 'REMOVIDA', updated_at: now }).eq('id', b.id);
      if (error) throw error;
      counts.removed++;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
    await finish('ERRO', msg, counts);
    return json({ error: msg }, 500);
  }

  await finish('OK', `${counts.reservations} reservas e ${counts.blocks} bloqueios no calendário`, counts);
  return json({ ok: true, counts, synced_at: now });
});
