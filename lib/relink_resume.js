/* Fail-closed legacy entry point: this module used to re-upload after OAuth.
 * A stored error string, a current default or a timestamp do not prove an
 * old attempt was never published or identify its original destination. Keep
 * the entry point safe for any callers while a durable review flow is designed.
 * No database, provider request, or state mutation occurs here.
 */
async function resumeAfterRelink() {
  return { status: "review_required" };
}
module.exports = { resumeAfterRelink };
