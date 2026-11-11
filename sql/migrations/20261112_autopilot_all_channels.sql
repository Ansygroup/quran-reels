-- خيار «انشر على كل القنوات المرتبطة» في الأتمتة اليومية.
-- الافتراضي false = قناة واحدة (الافتراضية ⭐) لكل منصة كما هو الآن.
-- عند true: يولّد التشغيل الآلي صفّ نشر لكل قناة مرتبطة (connection_id) بدل واحدة.
alter table public.autopilot
  add column if not exists all_channels boolean not null default false;
