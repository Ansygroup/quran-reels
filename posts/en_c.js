// كمل#23 — EN batch c: +30 specs (video10 · reciters10 · prayer10) — slug == arTwin
const A = [

// ---------- video ----------
{
  slug: "quran-hook-formulas",
  arTwin: "quran-hook-formulas",
  title: "Hook Formulas That Keep Viewers on a Quran Reel | Quran Reels",
  desc: "Practical opening formulas for Quran reels: a question the viewer already asks, a verse left hanging, and a promised takeaway — ready to test in the first three seconds.",
  kw: "quran reel hook, video opening, quran shorts, first line",
  short: "the three-second Quran reel hook",
  lead: "The opening is the viewer's decision point: stay or scroll. A strong Quran reel opens with a line that touches real life, then delivers the value fast.",
  points: ["Start from a question they already ask", "Leave the verse hanging until they watch on", "Skip long intros — enter the content immediately"],
  apply: "Before exporting {t}, draft three different openings and test them as short variants.",
  faq: [
    ["Does the opening really change performance?", "Viewers decide in the first moments; a clear opening raises completion and sharing."],
    ["How long should it be?", "The shortest sentence that carries the meaning — usually two to three seconds."]
  ],
  links: [["/en/articles/quran-reel-hooks/", "More hook patterns"], ["/en/quran-video-maker/", "Free video maker"]],
  sections: [
    { h: "Why the first line decides everything", p: ["Feeds move fast. The opening line is not decoration — it is the permission you ask for the rest of the reel. A line that names the viewer's situation buys that permission.", "Keep it honest: promise only what the next seconds actually deliver."] },
    { h: "Formulas that work", p: ["Question: 'Do you pause at this verse?' Context: 'This surah most people rush.' Promise: 'One tip to fix your export.'", "Write three variants, read them aloud, and keep the one a stranger would understand instantly."] }
  ],
  cluster: "video"
},
{
  slug: "first-3-seconds-quran",
  arTwin: "first-3-seconds-quran",
  title: "The First Three Seconds of a Quran Reel: A Checklist | Quran Reels",
  desc: "A pre-publish checklist for the opening three seconds: clean audio, readable on-screen text, visible identity, and a clear promised value before you hit upload.",
  kw: "first seconds quran reel, video checklist, opening frame, retention",
  short: "the three-second pre-publish check",
  lead: "Three seconds decide the viewer's next move; a short checklist before publishing saves you from re-uploading later.",
  points: ["Recitation audio starts clean with no hesitation", "The first-frame text reads without effort", "The cover frame matches the promised value"],
  apply: "Play {t} from the start and judge it in exactly three seconds — if it stumbles, fix it before publishing.",
  faq: [
    ["Check before export or after?", "Always before — checking is cheaper than re-uploading."],
    ["What if the frame feels crowded?", "Reduce elements: one line of text, one background."]
  ],
  links: [["/en/articles/quran-hook-formulas/", "Opening formulas"], ["/articles/export-checklist/", "Pre-export checklist (AR)"]],
  sections: [
    { h: "What viewers process instantly", p: ["In the opening moment a viewer reads three things: the text, the mood, and whether this is worth their time. Your job is to make all three effortless.", "If any of them needs decoding, the scroll wins."] },
    { h: "Run the checklist every time", p: ["Audio clean? Text readable? Cover frame honest? Promised value obvious? Four questions, ten seconds — then publish with confidence.", "Print the checklist next to your export button until it becomes instinct."] }
  ],
  cluster: "video"
},
{
  slug: "quran-reel-pacing",
  arTwin: "quran-reel-pacing",
  title: "Pacing a Quran Reel: When to Speed Up and When to Hold | Quran Reels",
  desc: "Tuning reel pacing: a comfortable recitation speed, a beat of silence before the key word, and scene lengths that fit the message instead of a template.",
  kw: "reel pacing, recitation speed, video timing, quran shorts editing",
  short: "balanced pacing for the Quran reel",
  lead: "Good pacing carries viewers to the end; rushing confuses and dragging bores. The middle ground gives each word its weight.",
  points: ["Leave a short silence before the key word", "Match speed to articulation, not to a counter", "Scene length of three to five seconds fits most messages"],
  apply: "Listen to {t} with your eyes closed: where did you feel at ease, where distracted? Adjust exactly there.",
  faq: [
    ["Is pacing different from normal reels?", "Quranic text tolerates silence well — use it instead of cutting it away."],
    ["What is the ideal length?", "Choose length for the message, not for the format."]
  ],
  links: [["/en/articles/quran-reel-length-truth/", "The truth about length"], ["/en/articles/silent-watchers-quran/", "Silent viewers"]],
  sections: [
    { h: "Pacing as respect for the text", p: ["Rushed recitation feels careless; measured pacing feels attentive. Viewers may not name the difference, but they feel it as trust.", "Silence is a tool: one beat before the key word sharpens it."] },
    { h: "How to tune your edit", p: ["Watch once for flow only, marking every moment your attention drifts. Those marks are your edits.", "Keep scenes short and let the audio, not the visuals, set the rhythm."] }
  ],
  cluster: "video"
},
{
  slug: "series-vs-standalone-reels",
  arTwin: "series-vs-standalone-reels",
  title: "Followed Series or Standalone Reel? A Channel Decision | Quran Reels",
  desc: "A practical comparison of Quran series versus standalone reels: when numbering and pinning help, and when a self-contained message wins new viewers.",
  short: "series or standalone reels?",
  kw: "quran series, standalone content, content strategy, channel plan",
  lead: "A series builds returning habits; standalone reels reach new people. Healthy channels mix both with a clear order.",
  points: ["Test three parts before committing to a long series", "Make every part understandable without the previous one", "Pin the strongest part for new visitors"],
  apply: "Plan {t} as a three-episode series with matching titles and internal links between parts.",
  faq: [
    ["Should the schedule be strict?", "A sustainable rhythm beats a schedule you will break."],
    ["What if one part underperforms?", "Fix or drop it — a series is judged by its weakest episode."]
  ],
  links: [["/articles/quran-content-calendar/", "Content calendar"], ["/articles/quran-reel-batch-day/", "Batch day"]],
  sections: [
    { h: "What a series buys you", p: ["Numbered parts create an open loop: viewers return to complete the set. The habit compounds across weeks.", "The cost is discipline — missed parts break the loop faster than weak parts do."] },
    { h: "When standalone wins", p: ["A self-contained value piece travels further because it needs no context. Use standalone reels to welcome new audiences into the channel.", "Rule of thumb: teach in standalone, deepen in series, mix one of each per week."] }
  ],
  cluster: "video"
},
{
  slug: "quran-reel-batch-day",
  arTwin: "quran-reel-batch-day",
  title: "The Quran Reel Batch Day: A Morning-to-Evening Routine | Quran Reels",
  desc: "One day to produce a week of Quran reels: picking clips, exporting, reviewing, and scheduling — small techniques that protect your energy.",
  kw: "batch production, content day, reel workflow, weekly output",
  short: "one batch day for the whole week",
  lead: "Batching lowers the cost per video: you enter the creative mood once and leave with a week of ready clips.",
  points: ["Prepare the clip list before the day, not during it", "Filter one batch, then export one batch", "Save the final review for the end of the session"],
  apply: "Block a day for {t} with three stages: pick → export → review → schedule.",
  faq: [
    ["How many reels per batch?", "Four to six is a healthy start; adjust to your pace."],
    ["What about creative fatigue?", "Stage-based work reduces it because each stage stays simple."]
  ],
  links: [["/articles/daily-video-schedule/", "Daily scheduling"], ["/articles/quran-content-calendar/", "Content calendar"]],
  sections: [
    { h: "Why one day beats seven days", p: ["Switching contexts daily taxes your attention; a single-purpose day keeps the setup, tools, and mindset warm all at once.", "The result is not just speed — consistency of style improves too."] },
    { h: "Design the day in stages", p: ["Morning: selection only. Midday: exports. Evening: review and schedule. Never mix stages — a crowded desk makes crowded videos.", "End by writing tomorrow's first task so the next session starts instantly."] }
  ],
  cluster: "video"
},
{
  slug: "silent-watchers-quran",
  arTwin: "silent-watchers-quran",
  title: "Silent Viewers: Why People Watch Quran Reels Without Sound | Quran Reels",
  desc: "Understanding sound-off viewing: where those viewers are, and how to prepare a Quran reel with readable text without betraying the listeners.",
  kw: "sound off viewing, muted reels, on screen text, accessibility",
  short: "preparing reels for silent viewers",
  lead: "Many watch in quiet places; clear text gives them the message while the recitation gives listeners their atmosphere — the two do not conflict.",
  points: ["Large, high-contrast text that reads silently", "Place the key word near the center where UI does not cover it", "Never rely on sound alone to carry meaning"],
  apply: "Play {t} muted: can you follow the full message in seconds? If not, strengthen the text.",
  faq: [
    ["Should I duplicate the full verse text?", "No constant captions — highlight only the key phrase."],
    ["Where should verse text sit?", "Slightly above center, clear of platform buttons."]
  ],
  links: [["/en/articles/quran-reel-pacing/", "Pacing"], ["/articles/quran-reel-cover-frame/", "Cover frame (AR)"]],
  sections: [
    { h: "The sound-off majority", p: ["A large share of feed watching happens muted — in transit, in bed, in public. Silent viewers do not dislike audio; their context forbids it.", "Text that reads at a glance converts that context into attention instead of lost views."] },
    { h: "Designing for both audiences", p: ["Give silent viewers the structure through text and give listeners the atmosphere through recitation. Each audience gets a complete experience.", "Test both modes before publishing — sound on, then sound off."] }
  ],
  cluster: "video"
},
{
  slug: "evergreen-quran-reels",
  arTwin: "evergreen-quran-reels",
  title: "Evergreen Quran Reels: What Keeps Watching After the Season | Quran Reels",
  desc: "Separating evergreen from seasonal reels: topics people return to for years, and how to build a library that works without an expiry date.",
  kw: "evergreen content, lasting reels, content library, quran video ideas",
  short: "evergreen Quran reels that keep working",
  lead: "Evergreen reels bring views for months; seasonal ones bring spikes. A healthy channel needs both in balance.",
  points: ["Pick topics that recur in weekly life", "Avoid numbers and dates that age quickly", "Link every evergreen reel to a permanent article"],
  apply: "Sort your last twenty ideas for {t}: evergreen or seasonal? Keep evergreen at a third or more.",
  faq: [
    ["Is Ramadan content evergreen?", "Seasonal and strong — plan it early and keep the rest of the library green."],
    ["How do I find green topics?", "From recurring viewer questions and your older articles."]
  ],
  links: [["/articles/archive-republish-6m/", "Republishing after six months"], ["/articles/quran-content-calendar/", "Calendar"]],
  sections: [
    { h: "What makes content evergreen", p: ["Evergreen content answers needs that never expire: how to pray on time, how to start memorizing, how to read with tajweed. The question next year is the same question.", "Dates, trends, and one-off news do the opposite — they die the day after."] },
    { h: "Building the green library", p: ["Balance each seasonal burst with evergreen pieces that will still be found next year. Search and recommendations reward permanence.", "Every evergreen reel should point to a deeper article so short attention can become long value."] }
  ],
  cluster: "video"
},
{
  slug: "quran-reel-length-truth",
  arTwin: "quran-reel-length-truth",
  title: "The Truth About Quran Reel Length: Seconds, Not Perfection | Quran Reels",
  desc: "Long or short? A practical read on Quran reel length by message type: one verse can suffice, an explanation needs time — and completion is the real measure.",
  kw: "reel length, video duration, shorts length, completion rate",
  short: "reel length without fear",
  lead: "There is no magic number: the message sets the length and completion sets the success. A three-second reel fails if it says nothing.",
  points: ["A verse and a reflection = short is enough", "A step-by-step explanation earns its minutes", "The end test: did the message land?"],
  apply: "Judge {t} by deletion: remove everything that does not serve the message — if the message survives, you are ready.",
  faq: [
    ["Do longer reels get fewer views?", "If self-contained, they hold to the end; if dull, viewers leave at once."],
    ["What about the feed race?", "Do not chase a metric — keep your standard."]
  ],
  links: [["/en/articles/quran-reel-pacing/", "Pacing"], ["/articles/frequency-versus-quality/", "Frequency vs quality"]],
  sections: [
    { h: "Length follows meaning", p: ["A viewer does not check the clock first — they check whether they care. Meaningful seconds stretch; filler seconds drag.", "The practical consequence: decide the message first, then let it cut the video."] },
    { h: "Measuring honestly", p: ["Completion tells the truth: high completion on a short reel means the value landed; low completion anywhere means the opening or the middle failed.", "Re-run the same message at two lengths and let your own data decide."] }
  ],
  cluster: "video"
},
{
  slug: "save-worthy-quran-reels",
  arTwin: "save-worthy-quran-reels",
  title: "The Save-Worthy Quran Reel: What Makes Viewers Keep It | Quran Reels",
  desc: "Elements of a keepable Quran reel: value to return to, clear organization, and a reference quality — saves being among the strongest signals platforms read.",
  kw: "saves, reference content, valuable reel, keep this",
  short: "the Quran reel people save",
  lead: "A save means 'I will come back' — the strongest quiet compliment a viewer can pay. Build things worth returning to.",
  points: ["Organized value that can be retrieved fast", "Text viewers can copy or recall later", "An explicit reason to revisit in the opening"],
  apply: "Ask of {t}: why would someone return in a week? Put that reason in the first frame.",
  faq: [
    ["Do saves really help distribution?", "They are a deliberate signal — stronger than a passive like."],
    ["What rarely gets saved?", "The generic piece with no tangible value."]
  ],
  links: [["/articles/quran-reel-cta-soft/", "Gentle calls to action (AR)"], ["/en/articles/first-3-seconds-quran/", "The first three seconds"]],
  sections: [
    { h: "The psychology of saving", p: ["Liking costs nothing; saving costs a slot in the viewer's personal library. People save only what they believe will be useful later.", "That belief comes from structure: lists, steps, and wording worth keeping."] },
    { h: "Designing for the second view", p: ["Open with a promise of future use: 'save this for your next khatma planning.' Deliver it in an order that can be re-read in ten seconds.", "Include a stable title line so the reel is recognizable when found again."] }
  ],
  cluster: "video"
},
{
  slug: "weekly-quran-reel-theme",
  arTwin: "weekly-quran-reel-theme",
  title: "A Weekly Quran Reel Theme: One Axis for Every Output | Quran Reels",
  desc: "Choosing a weekly theme for your Quran reels: it simplifies planning, deepens the message, and makes your channel legible to first-time visitors.",
  kw: "weekly theme, content pillars, planning axis, channel identity",
  short: "one weekly theme that gathers your reels",
  lead: "A theme turns twenty scattered reels into one focused message that viewers can remember and expect.",
  points: ["One theme per week: mercy, patience, adhkar…", "Five reels from different angles on it", "Summarize the week in your article or description"],
  apply: "Pick {t}'s theme for next week and draft five sub-titles before Sunday.",
  faq: [
    ["Should I repeat themes?", "Rotate every two to four weeks to avoid fatigue."],
    ["What if the theme does not excite me?", "Choose what you believe in — enthusiasm transfers."]
  ],
  links: [["/articles/quran-content-calendar/", "Content calendar"], ["/en/articles/series-vs-standalone-reels/", "Series vs standalone"]],
  sections: [
    { h: "Why one axis beats random ideas", p: ["Themes reduce decision fatigue: the week's titles practically write themselves once the axis is set. Your archive also gains coherence.", "Viewers who sample three reels from one theme understand your channel faster."] },
    { h: "Choosing and rotating themes", p: ["Themes should serve your audience's recurring needs and your own conviction. Write the axis in one sentence before planning any clip.", "Rotate before exhaustion — freshness matters more than consistency of topic, but not consistency of quality."] }
  ],
  cluster: "video"
},

// ---------- reciters ----------
{
  slug: "reciter-rotation-benefit",
  arTwin: "reciter-rotation-benefit",
  title: "Rotating Reciters in Your Library: Why Not Stick to One | Quran Reels",
  desc: "Benefits of diversifying reciters: sharper ears for articulation, broader knowledge of styles, and listening that stays alive — plus a simple rotation rule.",
  kw: "reciter rotation, varied recitation, audio library, quran reciters",
  short: "rotating reciters enriches listening",
  lead: "Loyalty to one reciter goes deep; rotation widens the ear. Combining both keeps listening familiar and attentive at once.",
  points: ["A primary reciter for memorization, a second for review", "One new reciter each week for discovery", "Return to favorites in sensitive moments"],
  apply: "Add two contrasting reciters to {t}'s week and compare how each changes your focus.",
  faq: [
    ["Does variety disturb memorization?", "Keep a uniform voice for active memorization; rotate for review and general listening."],
    ["Where do I start?", "From the reciters directory and a short sample of each."]
  ],
  links: [["/ar/reciters/", "Reciters directory"], ["/articles/compare-reciters-fairly/", "Fair comparison (AR)"]],
  sections: [
    { h: "What rotation trains", p: ["Different reciters expose you to different solutions for the same letters — where one holds, another glides. Your ear learns the range.", "That range later helps you hear your own recitation more critically."] },
    { h: "A simple rotation rule", p: ["One primary, one secondary, one newcomer — reviewed weekly. Nothing complicated; the discipline is in the review, not the list.", "Drop any newcomer whose style you dislike without guilt; rotation is exposure, not obligation."] }
  ],
  cluster: "reciters"
},
{
  slug: "which-reciter-to-follow",
  arTwin: "which-reciter-to-follow",
  title: "Which Reciter Should You Start With? A Style Fit Guide | Quran Reels",
  desc: "Criteria for choosing a reciter for listening and memorization: articulation clarity, pace, tone, and context — then decide with a one-week test.",
  kw: "choose reciter, best reciter, listening guide, recitation style",
  short: "choosing the right reciter for you",
  lead: "There is no absolute 'best reciter' — the best for someone else may strain your ear. Clear criteria spare you years of hesitation.",
  points: ["Articulation before tone", "A pace that matches your current level", "Test a full week before committing"],
  apply: "Trial two candidates from {t} for seven days: which voice stays in your head? Make that one primary.",
  faq: [
    ["Should I switch constantly?", "Endless switching scatters; planned rotation serves."],
    ["What about older recordings?", "Older quality can be clearer for memorization — test it."]
  ],
  links: [["/ar/reciters/", "Reciters directory"], ["/articles/listen-before-choose/", "Listen before you choose (AR)"]],
  sections: [
    { h: "Criteria that matter", p: ["Articulation determines whether you learn the letters correctly; pace determines whether you can sustain daily listening; tone determines whether you return tomorrow.", "Rank them in that order and many dilemmas dissolve."] },
    { h: "Run the one-week test", p: ["A week is long enough for novelty to wear off and real preference to show. Listen daily, memorize a short passage, then compare.", "Commit to the winner for a month before reconsidering — depth beats sampling."] }
  ],
  cluster: "reciters"
},
{
  slug: "reciters-by-mood",
  arTwin: "reciters-by-mood",
  title: "A Reciter for Every Mood: Matching Voice to Your State | Quran Reels",
  desc: "Organizing listening by state: energetic mornings, calming nights, focused memorization hours — alignment raises receptivity without changing the recitation itself.",
  kw: "listening mood, voice match, state of heart, comfortable recitation",
  short: "matching the reciter to your state",
  lead: "The voice that suits your morning may not suit your night; simple alignment turns listening into a self-sustaining habit.",
  points: ["Morning: measured, uplifting pace", "Night: softer, slower tone", "Memorization: the clearest articulation you know"],
  apply: "Build three lists in {t} by time of day and use each in its slot for a week.",
  faq: [
    ["Does alignment change the ruling on recitation?", "No — quality standards are fixed; comfort is personal preference."],
    ["What if my state changes suddenly?", "A short favorites list on your phone is enough."]
  ],
  links: [["/en/articles/reciter-rotation-benefit/", "Rotation"], ["/articles/recitation-before-sleep/", "Recitation before sleep (AR)"]],
  sections: [
    { h: "Why state matters", p: ["Receptivity shifts with energy and hour. Matching the voice to your state removes friction — you start listening without negotiating with yourself.", "The recitation itself stays honored; only the delivery you seek changes."] },
    { h: "Building the three lists", p: ["Keep them short: five to ten tracks each. The point is instant choice, not exhaustive curation.", "Revisit monthly so the lists stay loved rather than merely stored."] }
  ],
  cluster: "reciters"
},
{
  slug: "recitation-speed-levels",
  arTwin: "recitation-speed-levels",
  title: "Recitation Speed Levels: Start Calm, Then Climb | Quran Reels",
  desc: "Understanding speed levels in recitation: beginner-friendly, moderate, and advanced — and how to choose without loading your ear with speed you cannot follow.",
  kw: "recitation speed, listening levels, tajweed pace, gradual progress",
  short: "recitation speed levels",
  lead: "Speed is trained, not bought; the level at which you follow every word is your real level today.",
  points: ["Beginner pace while words still lag behind", "Move up when listening needs no inner repetition", "Do not jump ahead to look serious"],
  apply: "Play {t} slower first, then moderate — adjust weekly based on comfort, not ambition.",
  faq: [
    ["Is slower recitation inferior?", "For learners it is wiser; your suitable pace matters most."],
    ["Do I change reciter with speed?", "Test the same reciter's pace options before switching voices."]
  ],
  links: [["/articles/tarteel-basics/", "Tarteel basics"], ["/articles/listen-before-choose/", "Listen before choosing"]],
  sections: [
    { h: "Reading your own level", p: ["If you miss words, the pace is above you; if you drift, it may be below you. The right level keeps attention easy and full.", "Levels are not ranks — advanced speed means nothing without comprehension."] },
    { h: "Climbing deliberately", p: ["Raise speed only after a week of effortless listening at the current level. Small increments preserve accuracy.", "Pair each speed change with a short dictation check to confirm nothing was lost."] }
  ],
  cluster: "reciters"
},
{
  slug: "tarteel-basics",
  arTwin: "tarteel-basics",
  title: "Tarteel Basics: Recitation You Can Hear and Keep | Quran Reels",
  desc: "A practical entry to tarteel: breath control, clear madd within reason, and measured pauses — three rules applied to one short passage every day.",
  kw: "tarteel, recitation rules, clear pronunciation, beautiful reading",
  short: "practical tarteel basics",
  lead: "Tarteel is not artificial slowness — it is craftsmanship that can be heard. Three small rules take you there without a private teacher.",
  points: ["Breathe before the verse, not inside it", "Prioritize what you already recite well over speed", "A short pause at the stops"],
  apply: "Take one passage from {t}: read it twice — once for meaning, once for careful tarteel.",
  faq: [
    ["Do I need equipment?", "No — listen, imitate, record, compare."],
    ["When do I move to a full surah?", "When the short passage is effortless."]
  ],
  links: [["/ar/makharij-al-huruf/", "Articulation points"], ["/en/articles/recitation-speed-levels/", "Speed levels"]],
  sections: [
    { h: "The three audible basics", p: ["Breath, clarity, and stopping: get these right and any passage sounds composed. They are checkable by ear within a week.", "Mastery of a short piece transfers to every new piece you meet."] },
    { h: "Daily practice structure", p: ["Five minutes: one passage, three careful readings, one recorded comparison. Consistency does what long irregular sessions cannot.", "Keep a single passage under your hand for a week before moving on."] }
  ],
  cluster: "reciters"
},
{
  slug: "hear-then-repeat-method",
  arTwin: "hear-then-repeat-method",
  title: "Hear Then Repeat: Active Listening for Memorization | Quran Reels",
  desc: "The hear-repeat method: a sentence the reciter delivers, then immediate focused imitation of its letters — a ladder from sentence to verse to paragraph.",
  kw: "active listening, listen and repeat, memorization method, imitation",
  short: "the hear-then-repeat method",
  lead: "Active listening builds correct pronunciation before memorization: fix the ear, then the tongue, then the memory follows.",
  points: ["Full sentence, then immediate repetition", "Focus on the exact word you missed", "Raise the reps until you repeat unaided"],
  apply: "Apply to one verse from {t}: four listens, three extended repeats.",
  faq: [
    ["Can I do this with just my phone?", "Yes — verse text plus any recording works."],
    ["How many verses per session?", "Quality of repetition beats quantity — five clean verses beat a rushed page."]
  ],
  links: [["/articles/tarteel-basics/", "Tarteel"], ["/en/articles/two-lines-a-day/", "Two lines a day"]],
  sections: [
    { h: "Why the order is ear-first", p: ["What you hear incorrectly you memorize incorrectly and pay for later in correction. Hear-then-repeat front-loads accuracy.", "The method is also kind to beginners: no theory, only guided imitation."] },
    { h: "Running the ladder", p: ["Sentence → verse → paragraph, repeating each rung until clean. Only climb when the current rung needs no effort.", "Record one rung per session so progress is audible, not imagined."] }
  ],
  cluster: "reciters"
},
{
  slug: "reciter-playlist-order",
  arTwin: "reciter-playlist-order",
  title: "Playlist Order: Structuring Listening Around a Goal | Quran Reels",
  desc: "Ordering Quran playlists by purpose: memorization, review, reflection, or calm — the sequence guides ear and heart before you press play.",
  kw: "playlist order, listening structure, organized library, purposeful listening",
  short: "ordering playlists with intent",
  lead: "A scattered playlist produces scattered listening; purpose-ordered lists make every session serve the last one.",
  points: ["Separate lists by purpose — never mix them", "Shorter items first when starting a new list", "Name lists clearly by aim, not by number"],
  apply: "Reorganize {t} into four lists: memorize · review · reflect · calm.",
  faq: [
    ["What about casual listening?", "Keep a fifth 'free' list — do not blend it with disciplined ones."],
    ["How often do I reorder?", "A monthly review is enough."]
  ],
  links: [["/en/articles/which-reciter-to-follow/", "Choosing a reciter"], ["/en/articles/memorize-reciter-names/", "Remembering reciter names"]],
  sections: [
    { h: "Purpose before play", p: ["Every session has an aim even if you never write it down; explicit lists make the aim visible and the session shorter to start.", "Mixed lists quietly waste attention deciding what to play."] },
    { h: "A four-list system", p: ["Memorization needs clarity, review needs familiarity, reflection needs space, calm needs softness. One list per need keeps each session coherent.", "Keep names obvious so choosing takes one glance."] }
  ],
  cluster: "reciters"
},
{
  slug: "headphone-listening-quran",
  arTwin: "headphone-listening-quran",
  title: "Headphone Listening: When It Helps Quran Recitation | Quran Reels",
  desc: "Using headphones for Quran listening: isolation reveals articulation in noisy places, and sane volume habits keep long sessions comfortable for your ears.",
  kw: "headphones quran, clear listening, safe volume, review audio",
  short: "headphones for Quran listening",
  lead: "Headphones surface letter details that room speakers blur — at a moderate volume and with breaks, they become a serious review tool.",
  points: ["Comfortable volume, never maximum", "Headphones for long review sessions", "High clarity for the final comparison pass"],
  apply: "Listen to {t} with headphones and notice letter details you never heard on speakers.",
  faq: [
    ["Does it replace listening in the mosque?", "No — each setting has its purpose."],
    ["Is loud volume harmful?", "Sustained high volume tires the ear — keep it moderate."]
  ],
  links: [["/en/articles/quran-audio-troubleshoot/", "Audio troubleshooting"], ["/articles/quran-audio-quality-check/", "Audio quality check (AR)"]],
  sections: [
    { h: "What headphones reveal", p: ["Isolation exposes consonants, stops, and breaths that speakers smooth over — exactly the details pronunciation training needs.", "They also let you review anywhere without losing fidelity."] },
    { h: "Healthy habits", p: ["Moderate volume, regular breaks, and one clean pair dedicated to listening keep the tool pleasant long-term.", "Use speakers for casual atmosphere and headphones for focused review."] }
  ],
  cluster: "reciters"
},
{
  slug: "memorize-reciter-names",
  arTwin: "memorize-reciter-names",
  title: "Remembering Reciter Names: The Base of Following Along | Quran Reels",
  desc: "A fast way to anchor reciter names to their voices: link each name to its signature sound, keep a small card per reciter, and visit the profile page.",
  kw: "reciter names, knowing reciters, reciter cards, introduction",
  short: "tying reciter names to voices",
  lead: "A name tied to a distinctive voice stays after the first listen; a bare name slips away immediately.",
  points: ["Bind each name to a sound you already know", "One small card: name · style · reference", "Repeat names while listening, not in a separate cram"],
  apply: "Open {t} and tag each reciter with one phrase that links name to voice.",
  faq: [
    ["How many names per session?", "Five you own beat twenty you forget."],
    ["Do I memorize their biographies too?", "Name and style suffice for daily following."]
  ],
  links: [["/ar/reciters/", "Reciters directory"], ["/articles/known-reciters-map/", "Map of known reciters (AR)"]],
  sections: [
    { h: "Names need hooks", p: ["Memory keeps images and sounds better than strings of letters. Attach the name to the first striking feature of that reciter's voice.", "Over days, the hook becomes automatic and the name surfaces on hearing the voice alone."] },
    { h: "Building the mini-deck", p: ["Cards can live in a notes app: name, style, one famous recitation. Review them inside listening sessions for free spaced repetition.", "Cap the deck at a size you actually revisit — a living deck beats a complete one."] }
  ],
  cluster: "reciters"
},
{
  slug: "tilawah-streak",
  arTwin: "tilawah-streak",
  title: "The Daily Tilawah Streak: How to Keep It Unbroken | Quran Reels",
  desc: "Building a durable daily recitation streak: a volume that never tires, a time tied to an existing habit, and a 'never miss twice' rule for rough days.",
  kw: "daily recitation streak, consistency habit, quran routine, keep going",
  short: "the streak that does not break",
  lead: "A streak is not a scoreboard but an identity: completing the smallest portion on a hard day beats grand intentions that skip.",
  points: ["A minimum so small it survives any day", "Attach recitation after a fixed anchor", "Rule: one miss is a delay, never two"],
  apply: "Define {t}'s unchangeable minimum for chaotic days and start it today.",
  faq: [
    ["What if I miss a week?", "Restart immediately with the minimum — resuming beats remorse."],
    ["Do I count past days?", "Count the clean current streak; keep history separately."]
  ],
  links: [["/en/articles/two-lines-a-day/", "Two lines a day"], ["/articles/hifz-morning-block/", "Morning block (AR)"]],
  sections: [
    { h: "Why small streaks win", p: ["A streak survives on feasibility: any day, any place, any energy. The moment the minimum becomes negotiable, the streak becomes negotiable.", "Identity follows evidence — days of proof rewrite how you see yourself."] },
    { h: "Protecting the chain", p: ["Anchor the habit, pre-commit the minimum, and treat misses as data: find the cause the same day.", "Celebrate resumption loudly and punishment never — shame accelerates quitting."] }
  ],
  cluster: "reciters"
},

// ---------- prayer ----------
{
  slug: "salah-habit-stacking",
  arTwin: "salah-habit-stacking",
  title: "Stacking Salah Habits Onto Your Daily Routine | Quran Reels",
  desc: "Linking prayers to habits you already have: wudu with the first glass of water, a prayer mat beside the desk, a fixed reminder — anchoring beats willpower.",
  kw: "salah habit, routine stacking, prayer consistency, daily anchors",
  short: "stacking salah onto your routines",
  lead: "Existing habits carry new ones; attaching prayer to fixed moments in your day outperforms depending on motivation.",
  points: ["Attach each prayer to a preceding fixed event", "Remove the physical friction (water, mat, alert)", "Start with the prayer closest to now"],
  apply: "Pick one prayer from {t} and bind it to a daily action you never skip.",
  faq: [
    ["What if my schedule changes?", "The anchor moves with it — the attachment is what stays."],
    ["How many anchors at once?", "One until stable, then add the next."]
  ],
  links: [["/articles/prayer-time-buffer/", "Time buffer for salah"], ["/ar/how-to-pray/", "How to pray"]],
  sections: [
    { h: "Anchors beat resolutions", p: ["Resolutions live in feelings; anchors live in events. The kettle boiling, the laptop closing, the door entering — reliable signals trigger reliable action.", "Design the environment once and let it remind you daily."] },
    { h: "Stacking in practice", p: ["Choose the target prayer, name its anchor, remove one obstacle, and rehearse the pair for a week. Then extend to the next prayer.", "If the stack keeps failing, shrink it — the attachment must be easier than forgetting."] }
  ],
  cluster: "prayer"
},
{
  slug: "travel-salah-basics",
  arTwin: "travel-salah-basics",
  title: "Salah While Traveling: Facilitation Without Excess | Quran Reels",
  desc: "Travel salah essentials without extremes: shortening and combining within their limits, praying on the road, and facing the qibla with a simple signal — and asking scholars for special cases.",
  kw: "travel prayer, qasr, combining prayers, journey salah",
  short: "travel salah essentials",
  lead: "Travel changes details, not pillars; facilitation is sanctioned with conditions — and your unusual case deserves a qualified scholar, not forums.",
  points: ["Qasr has distance and duration conditions", "Combination within its conditions, without complication", "Use an app or the sun's direction for the qibla"],
  apply: "Before {t}, check the distance rule and your stay's duration, then fix your plan.",
  faq: [
    ["Is qasr for every trip?", "Conditions vary — rely on a trusted reference for your case."],
    ["No qibla tools?", "A signal from your phone or approximate direction suffices for a traveler."]
  ],
  links: [["/ar/qibla/", "Qibla direction"], ["/articles/prayer-time-buffer/", "Time management"]],
  sections: [
    { h: "What travel permits", p: ["Shortening and combining are reliefs with recognized boundaries — using them as given is right; inventing new boundaries is not.", "Keeping the plan simple prevents both anxiety and improvisation on the road."] },
    { h: "Practical setup", p: ["Set the app to your city, note prayer windows in the itinerary, and choose a clean spot in advance where possible.", "Special circumstances — chronic illness, flights across many zones — go to a knowledgeable scholar."] }
  ],
  cluster: "prayer"
},
{
  slug: "prayer-time-buffer",
  arTwin: "prayer-time-buffer",
  title: "A Time Buffer Around Salah: Never Pray in a Rush | Quran Reels",
  desc: "Building safe margins around prayer times: five minutes for wudu, ten to prepare, and a calendar that stops meetings from colliding with the adhan.",
  kw: "prayer time, schedule buffer, adhan prep, time management",
  short: "the buffer around every prayer",
  lead: "Rush strips salah of its presence; small margins around each time turn the adhan from a stressor into a welcome.",
  points: ["Five-minute wudu window before the adhan", "No meetings inside the adhan window", "Prepare clothes and space early"],
  apply: "Add two reminders to {t}: 'prepare for wudu' and 'adhan', five minutes apart.",
  faq: [
    ["What if I miss the moment?", "Pray immediately — delay is the greater harm."],
    ["Do I need an app?", "Two calendar alerts are enough."]
  ],
  links: [["/en/articles/salah-habit-stacking/", "Habit stacking"], ["/ar/prayer-times/", "Prayer times"]],
  sections: [
    { h: "Margins create presence", p: ["The gap between activity and prayer is where your heart arrives before your body. Even five quiet minutes change the prayer you end up praying.", "Corners of buffer also absorb the day's overruns without sacrificing salah."] },
    { h: "Building the buffer", p: ["Map your day against the five adhans and mark no-go windows. Add a pre-alert for wudu and keep clothes ready the night before.", "Treat the buffer as an appointment with God that others can see on your calendar."] }
  ],
  cluster: "prayer"
},
{
  slug: "wudu-in-minutes",
  arTwin: "wudu-in-minutes",
  title: "Wudu in Two Minutes: A Calm, Not Hasty Routine | Quran Reels",
  desc: "Trimming your wudu routine: fixed order, sufficient water without waste, and a prepared place — so it settles into two unhurried minutes every time.",
  kw: "quick wudu, wudu routine, water conservation, prayer prep",
  short: "a two-minute wudu routine",
  lead: "Hasty wudu breeds hasty prayer; a compact ordered routine gives every time the same calm start.",
  points: ["Fix the order so you stop re-deciding", "Use enough water, not running excess", "Prepare the place before pouring"],
  apply: "Repeat {t}'s fixed order three times this week — by next week it runs itself.",
  faq: [
    ["Does compacting invalidate it?", "Keeping completeness and order intact — no."],
    ["Public place?", "Plan wudu before leaving — that is simpler than improvising."]
  ],
  links: [["/en/articles/salah-habit-stacking/", "Habit stacking"], ["/ar/how-to-pray/", "How to pray"]],
  sections: [
    { h: "From decision to automation", p: ["Every unnecessary decision costs attention. A fixed sequence turns wudu from a small project into a moving prayer.", "Speed then comes from automation, not from rushing water."] },
    { h: "Doing it well and wisely", p: ["Complete the acts, moderate the water, and keep the place ready — the routine stays both valid and pleasant.", "A towel within reach and shoes off save seconds without touching the act itself."] }
  ],
  cluster: "prayer"
},
{
  slug: "minutes-before-adhan",
  arTwin: "minutes-before-adhan",
  title: "Minutes Before the Adhan: Preparation That Builds Presence | Quran Reels",
  desc: "What to do in the minutes before the adhan: finish wudu, settle the mind, straighten the rows, and close screens quietly — preparation preceding the call.",
  kw: "before adhan, prayer readiness, calm prep, presence",
  short: "the minutes before the adhan",
  lead: "Khushuu starts before you bow: who steadies five minutes before the adhan enters prayer with a present heart.",
  points: ["Finish wudu before the critical minutes", "Close screens as the adhan approaches", "Gather intention in one sentence"],
  apply: "Set an alert five minutes before {t} for quiet preparation.",
  faq: [
    ["What if I am swamped until the call?", "Shut the device quickly and join the row — presence can still be chosen."],
    ["A specific phrase?", "The welcome du'a for the adhan is enough."]
  ],
  links: [["/en/articles/prayer-time-buffer/", "Time buffer"], ["/en/articles/salah-and-phone-silence/", "Phone silence during salah"]],
  sections: [
    { h: "Arriving before the call", p: ["The adhan announces a meeting already prepared for. Wudu done, phone down, mind collected — the first rak'ah benefits immediately.", "Preparation is also practical: rows fill calmly when no one arrives mid-sprint."] },
    { h: "A three-minute sequence", p: ["Wudu check, screen off, intention sentence, join. Repeat identically every day so the sequence itself induces calm.", "Anything longer can wait — depth belongs inside the prayer, not in elaborate pre-games."] }
  ],
  cluster: "prayer"
},
{
  slug: "salah-and-phone-silence",
  arTwin: "salah-and-phone-silence",
  title: "Silencing the Phone Around Salah: Practical Guardrails | Quran Reels",
  desc: "Separating your phone from prayer: scheduled silent mode, keeping essential calls reachable, and moving the device away from the mat — presence without anxiety.",
  kw: "phone and prayer, distraction free, focus salah, silent mode",
  short: "silencing the phone around salah",
  lead: "A nearby phone steals presence even untouched; physical distance works better than any good intention.",
  points: ["Scheduled silent around each prayer", "Keep the phone out of the prayer room", "Allow genuine emergencies through priority calls only"],
  apply: "Add to {t}: phone on silent and face-down three minutes before the adhan.",
  faq: [
    ["Awaiting an important call?", "Priority-only mode lets it through without scattered notifications."],
    ["Always another room?", "If possible — yes, the effect is immediate."]
  ],
  links: [["/en/articles/minutes-before-adhan/", "Before the adhan"], ["/articles/salah-journaling/", "Salah journal"]],
  sections: [
    { h: "Why distance beats discipline", p: ["The phone's mere presence activates background alertness. Removing it from the room removes the need to resist at all.", "The prayer mat and the feed should never share the same square meter."] },
    { h: "Guardrails that stick", p: ["Schedule silent mode against prayer times, whitelist real contacts, and park the phone in another room during prayers.", "Tell family about the whitelist so silence never means unreachable."] }
  ],
  cluster: "prayer"
},
{
  slug: "friday-weekly-routine",
  arTwin: "friday-weekly-routine",
  title: "The Friday Routine: A Day You Look Forward To | Quran Reels",
  desc: "Building a simple family Friday: a steady meal, an hour of story or dhikr, and a short collective du'a — repetition that becomes memory for the children.",
  kw: "friday routine, weekly ritual, family dhikr, jumuah habits",
  short: "the family Friday rhythm",
  lead: "A home with a steady Friday habit gives children something kind to expect every week — dhikr becomes identity, not homework.",
  points: ["Fixed time after Jumuah prayer", "One child-friendly element (story or question)", "A du'a the children request each week"],
  apply: "Start {t} this week with one fixed Friday element and keep it steady.",
  faq: [
    ["What if the parents are busy?", "One parent begins — starting matters more than polish."],
    ["Will long sessions bore them?", "Ten delightful minutes recur; an hour they escape does not."]
  ],
  links: [["/blog/friday-content/", "Friday content (blog)"], ["/en/articles/family-friday-ritual/", "Family Friday ritual"]],
  sections: [
    { h: "Repetition builds memory", p: ["Children remember what recurs: the same meal, the same du'a, the same hour. Repetition converts ritual into belonging.", "Adults benefit too — the week gains a soft landmark worth protecting."] },
    { h: "Keeping it light", p: ["Cap the session so it ends before attention does; expand only when asked, not when planned.", "Write the three elements of your Friday on paper and place it where the family gathers."] }
  ],
  cluster: "prayer"
},
{
  slug: "salah-journaling",
  arTwin: "salah-journaling",
  title: "The Salah Journal: A Light Measure That Builds Awareness | Quran Reels",
  desc: "A simple salah journal: one daily mark per prayer without heavy accounting, plus a note on causes of misses so the fix targets the real problem.",
  kw: "salah journal, daily tracking, awareness, review habits",
  short: "the light salah journal",
  lead: "Light logging reveals patterns behind missed prayers — an hour, a place, a pressure — and patterns can be treated; guilt cannot.",
  points: ["Quick mark per prayer, no long narration", "Note the cause when something was missed", "Review patterns weekly, not nightly"],
  apply: "Log {t} for one week, then extract exactly one pattern to fix.",
  faq: [
    ["Is logging required?", "No — a discipline aid; abandon the pen, keep the habit."],
    ["Recurring misses found?", "Treat the physical cause first (time, place, alert)."]
  ],
  links: [["/en/articles/missed-prayers-roadmap/", "Roadmap for missed prayers"], ["/en/articles/salah-habit-stacking/", "Habit stacking"]],
  sections: [
    { h: "What the journal actually shows", p: ["Misses rarely distribute randomly — they cluster around specific conditions. Two weeks of marks make those conditions obvious.", "Awareness alone often halves the problem before any new discipline."] },
    { h: "Keeping it light", p: ["Marks take seconds; descriptions only when a miss surprises you. Weekly review extracts one adjustment for the coming week.", "The journal serves you — the moment it becomes a burden, simplify it."] }
  ],
  cluster: "prayer"
},
{
  slug: "missed-prayers-roadmap",
  arTwin: "missed-prayers-roadmap",
  title: "A Roadmap for Missed Prayers: Steady Without Overwhelm | Quran Reels",
  desc: "Practical planning for making up missed prayers: estimate the amount, set a small daily installment, anchor it after a fixed prayer — no crushing guilt.",
  kw: "make up prayers, qada, missed salah, repayment plan",
  short: "the roadmap for making up prayers",
  lead: "Outstanding prayers are a debt settled by a modest steady installment — not by postponed regret nor by an exhausting sprint.",
  points: ["Estimate the amount with a clear table", "Divide it into a small daily installment", "Anchor the installment after a fixed prayer"],
  apply: "Write in {t} your estimate, your daily installment, and its weekly check-in.",
  faq: [
    ["A voluntary prayer arises mid-qada?", "Finish the current prayer first, then continue."],
    ["How long will it take?", "Depends on the amount — steadiness beats speed."]
  ],
  links: [["/ar/qada-salah/", "Qada calculator"], ["/articles/salah-journaling/", "Journal"]],
  sections: [
    { h: "Turning a weight into a plan", p: ["Vague burdens grow in the dark; a written number with a schedule becomes workable. Estimate honestly and divide without heroics.", "A daily installment keeps the debt visible without dominating your day."] },
    { h: "Anchoring the installment", p: ["Place it right after a prayer you never miss so it inherits that prayer's stability. Review the pace weekly and adjust once if needed.", "Slower steady repayment still beats fast abandoned attempts."] }
  ],
  cluster: "prayer"
},
{
  slug: "short-prayer-moments",
  arTwin: "short-prayer-moments",
  title: "Short Moments for Du'a: No Gathering Required | Quran Reels",
  desc: "Using small daily moments for remembrance: after the adhan, before eating, whenever focus breaks — short authentic phrases said in seconds, kept for years.",
  kw: "short dua, daily remembrance, brief supplication, small moments",
  short: "short du'a moments",
  lead: "You do not need a long assembly: repeated small moments build a constant remembrance and a present heart.",
  points: ["A fixed du'a after each adhan", "A known phrase before eating and drinking", "Two steady phrases beat ten neglected"],
  apply: "Take two phrases from {t} and bind them to daily triggers until they stick.",
  faq: [
    ["Do selected du'as burden?", "Short and steady is lighter and longer-lasting."],
    ["Where do I source them?", "The site's adhkar pages carry the references."]
  ],
  links: [["/ar/adhkar/sabah/", "Morning adhkar"], ["/en/articles/minutes-before-adhan/", "Before the adhan"]],
  sections: [
    { h: "Seconds that accumulate", p: ["Thirty seconds repeated daily across a year outnumbers a beautiful hour you attempt monthly. The math of small moments favors the consistent.", "Triggers — the adhan, food, the desk — carry the phrases without memory tax."] },
    { h: "Choosing your phrases", p: ["Pick two you already hear often enough to feel natural, and keep them until saying them is automatic.", "Only then add a third — growth by accretion, not by overhaul."] }
  ],
  cluster: "prayer"
}

];
module.exports = A;
