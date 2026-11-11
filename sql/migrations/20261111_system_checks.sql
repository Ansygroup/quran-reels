-- نتائج فحص محرّك التوليد (render_selftest / render_selftest_deep).
-- زر «🎬 اختبار توليد فيديو» كان يرمي النتيجة في المتصفح فتضيع بعد إغلاق اللوحة؛
-- الآن تُخزَّن هنا ليُقرأ آخر فحص وتاريخه بدل سؤال المستخدم «ماذا ظهر لك؟».
-- الجدول خاص بالخدمة فقط: لا anon ولا authenticated (يُقرأ بمفتاح service role).
create table if not exists public.system_checks (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  ok boolean not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_checks_kind_created_idx
  on public.system_checks (kind, created_at desc);

alter table public.system_checks enable row level security;

revoke all on public.system_checks from anon, authenticated;
-- ملاحظة: service_role يتجاوز RLS، لذا يكتب/يقرأ بلا سياسات إضافية.
