-- دعم أكثر من قناة للمنصة الواحدة (مثال: قناتا يوتيوب لنفس المستخدم).
-- كان النشر يأخذ «أحدث صف مربوط» بلا اختيار، فربط قناة ثانية يحوّل النشر
-- إليها بصمت. الآن: قناة افتراضية واحدة لكل منصة، ويمكن توجيه مهمة نشر
-- بعينها إلى قناة محددة عبر publish_queue.connection_id.
alter table public.social_connections
  add column if not exists is_default boolean not null default false;

-- قناة افتراضية واحدة فقط لكل (مستخدم، منصة)
create unique index if not exists social_connections_one_default
  on public.social_connections (user_id, platform)
  where is_default;

alter table public.publish_queue
  add column if not exists connection_id uuid references public.social_connections(id) on delete set null;

create index if not exists publish_queue_connection_idx
  on public.publish_queue (connection_id)
  where connection_id is not null;
