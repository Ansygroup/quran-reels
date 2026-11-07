-- أعمدة المقالات لتاريخ التشغيل (كانت الواجهة تقرأها ويكتبها الكود بلا وجودها في القاعدة،
-- فتفشل قراءة لوحة الحساب بـ«column does not exist» ويتعطّل التوليد من المقالات).
alter table public.autopilot_runs add column if not exists article_id text;
alter table public.autopilot_runs add column if not exists article_title text;
