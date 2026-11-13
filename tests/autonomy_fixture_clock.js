/* تثبيت تاريخ عينات الاختبار القديمة مع استمرار تقدم الساعة للمهلات. */
const RealDate = Date;
const delta = RealDate.now() - RealDate.parse('2026-11-12T12:00:00Z');
global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [RealDate.now() - delta])); } static now() { return RealDate.now() - delta; } };
