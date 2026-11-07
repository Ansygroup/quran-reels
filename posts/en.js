/* English flagship articles — كمل#21 (/en/articles/) */
const A = [
  {
    slug: "quran-video-maker-guide",
    arTwin: "quran-video-maker-guide",
    title: "How to Make a Quran Video in Under5 Minutes: The Complete Guide | Quran Reels",
    desc: "Step-by-step guide to making a vertical Quran video in your browser: pick the verse, reciter, background and text style, then export1080×1920 MP4 with no watermark and no signup.",
    kw: "quran video maker, make quran video, vertical quran video, quran reels",
    short: "Quran video maker",
    lead: "Making a Quran clip no longer needs an editor or a long render queue: choose the verse, the reciter, the background and the text style, preview, then export. {t} runs entirely inside your browser — this guide walks you through every decision before you press export.",
    points: [
      "The verse text comes straight from the Uthmani mushaf — never retype it by hand.",
      "Everything runs in the page: no app to install, no account to confirm.",
      "Output is1080×1920 (9:16), ready for Shorts, Reels and WhatsApp status."
    ],
    sections: [
      {
        h: "Choose the verse before you choose anything else",
        p: [
          "Start with meaning, not with settings. A short, complete verse carries a whole message in thirty seconds; a clipped half changes the meaning and viewers feel it immediately. If you need ideas, the library of short verses is organized by theme.",
          "Work from the Uthmani text as provided. A single spelling mistake in an ayah disqualifies the entire clip — that is why the generator loads verses directly instead of asking you to type them."
        ]
      },
      {
        h: "Reciter, background, style — then preview twice",
        p: [
          "Match the reciter to the mood: murattal for reflection and study, mujawwad for impact, mu'allim for teaching segments. The library contains47 reciters with known classifications, so the choice is a decision, not a gamble.",
          "Keep the background quieter than the text: dark tones with gold accents read well on small screens. Then preview twice — once with sound only (checking the recitation flow) and once reading the ayah letter by letter — before you export."
        ]
      }
    ],
    apply: "Open {t}, pick a short verse, and build one clip end to end. Export it, watch the file on your phone, and publish it even if you are not fully satisfied — your second clip will beat your first, and only practice teaches that.",
    faq: [
      ["Do I need video editing experience?", "No. The controls are laid out in order in one page: verse, reciter, background, style, export. Experience only becomes useful later, when a clip needs more advanced editing."],
      ["Is the export really watermark-free?", "Yes — the MP4 leaves the browser clean: no logo, no outro, no overlay. The only text on screen is the text you chose."],
      ["Does my file get uploaded anywhere?", "No. Recording happens locally with Canvas and MediaRecorder; nothing is sent to a server."]
    ],
    links: [
      ["/en/quran-video-maker/", "Open the maker (EN)"],
      ["/articles/quran-video-maker-guide/", "Arabic version of this guide"],
      ["/en/articles/quran-video-specs/", "Formats and resolutions"]
    ],
    cluster: "video"
  },
  {
    slug: "quran-video-specs",
    arTwin: "quran-video-specs",
    title: "Quran Video Formats and Resolutions:9:16,1:1 and16:9 | Quran Reels",
    desc: "Which aspect ratio to use for Quran videos on TikTok, Reels, Shorts and WhatsApp — and why you should export vertical first and derive the rest.",
    kw: "quran video resolution,9:16 quran video, video formats quran, quran reels",
    short: "Video formats",
    lead: "Aspect ratio is a geographic decision: every platform frames your clip differently. {t} exports vertical first because that orientation preserves everything — the horizontal and square versions are crops of it, never the other way around.",
    points: [
      "9:16 (1080×1920) rules TikTok, Instagram Reels, YouTube Shorts and WhatsApp status.",
      "1:1 suits Facebook and Instagram feed previews.",
      "16:9 belongs to landscape YouTube — never use it for vertical feeds."
    ],
    sections: [
      {
        h: "Export the master vertical, then derive the rest",
        p: [
          "When you export at1080×1920 first, every other ratio becomes a safe crop that keeps the text inside the safe zone. Starting horizontal forces you to rebuild for vertical, which is where most of the audience actually watches.",
          "Resolution matters more than file size here:1080 on the long edge keeps letterforms crisp on phones; smaller masters lose the fine strokes of Arabic script after platform compression."
        ]
      },
      {
        h: "What platform compression really does",
        p: [
          "Every major platform re-encodes uploads. That means your job is to give it the cleanest possible master — correct text, high resolution, no pre-compression — and let the platform do the rest.",
          "MP4 (H.264) is the universal currency; WebM works on the web. Unless you have a specific reason, do not experiment with exotic codecs for short vertical clips."
        ]
      }
    ],
    apply: "Export your next clip from {t} in9:16, then save a1:1 crop for feeds. Keep both files in the same folder named by ratio — future reposting becomes a two-minute job.",
    faq: [
      ["Do all platforms accept9:16?", "Yes for the vertical feeds (TikTok, Reels, Shorts, status). Landscape uploads are accepted but get black bars or aggressive cropping there."],
      ["Is1080 worth the extra size?", "Yes for anything you expect people to read closely. For drafts and rapid daily posts, a lighter export is acceptable."],
      ["Can I upload the same file everywhere?", "Export once, crop once, and tailor only the caption and timing per platform — the pixels do not need to be reinvented for each feed."]
    ],
    links: [
      ["/en/articles/quran-video-maker-guide/", "Maker guide"],
      ["/articles/quran-video-specs/", "Arabic version"],
      ["/en/articles/quran-video-no-watermark/", "Watermark-free export"]
    ],
    cluster: "video"
  },
  {
    slug: "quran-video-no-watermark",
    arTwin: "quran-video-no-watermark",
    title: "Watermark-Free Quran Video Export: The Clean Way | Quran Reels",
    desc: "How to produce Quran MP4s with no watermark at all — export clean from the source instead of removing someone else's logo — plus where your signature really belongs.",
    kw: "quran video no watermark, watermark free quran video, clean export, quran reels",
    short: "No watermark",
    lead: "A watermark on religious content looks like a defect, not branding. The honest solution is not a removal tool — it is a source that exports clean: {t} writes the file with no logo and no outro, and your attribution belongs in the caption where it is actually read.",
    points: [
      "Clean export from the original source is safer than any removal workflow.",
      "Your signature works harder in the description than burned into the frame.",
      "A1080×1920 master without extra re-encoding keeps the script sharp."
    ],
    sections: [
      {
        h: "Check four corners before you publish",
        p: [
          "After export, inspect every corner of the frame: no logo, no leftover caption from a template, nothing crossing into the platform-safe margins. This ten-second habit prevents the classic late discovery.",
          "Then read the ayah letter by letter in the exported file. Watermarks are visible; spelling errors in the Quranic text are the failure nobody forgives."
        ]
      },
      {
        h: "Where your branding actually belongs",
        p: [
          "Put your name and channel in the description and, if you like, in one fixed text element you designed yourself — that is identity, not a watermark borrowed from a tool.",
          "When you reuse someone else's recording, credit the reciter and the source in the same caption line. Clean visuals plus honest attribution is the professional baseline."
        ]
      }
    ],
    apply: "Export from {t}, verify the four corners and the full ayah text, then publish with a caption that names the surah and the reciter. That combination is what builds a trustworthy page.",
    faq: [
      ["Why do other tools add watermarks?", "Free tiers of many products are funded by their own branding. This generator is free without that trade — there is no paid tier to remove a logo from."],
      ["Is removing another tool's watermark allowed?", "Removing someone else's mark from their output raises rights issues. Prefer creating your own clean file from the start."],
      ["Does the caption really matter that much?", "Yes — captions are what search and humans read; the burned-in logo is what they tolerate."]
    ],
    links: [
      ["/articles/quran-video-no-watermark/", "Arabic version"],
      ["/en/articles/quran-video-maker-guide/", "Maker guide"],
      ["/articles/quran-content-licensing/", "Reuse and rights"]
    ],
    cluster: "video"
  },
  {
    slug: "quran-video-no-music",
    arTwin: "quran-video-no-music",
    title: "Quran Videos Without Music: Why Purity Wins and How to Do It | Quran Reels",
    desc: "Why music-free Quran clips are cleaner to watch, share and re-post — and how to build them with recitation alone or a silent background.",
    kw: "quran video no music, no music quran video, silent quran reel, quran reels",
    short: "No music",
    lead: "A Quran clip whose only sound is recitation stands on its own: no music licensing questions, no distraction for someone reciting along, no discomfort for viewers who object. {t} was designed for exactly this — background silent or recitation only, text as the only visual focus.",
    points: [
      "No music means no licensing disputes when the clip is re-shared.",
      "Pure recitation lets the listener focus on the words, not a competing melody.",
      "Silence around the ayah makes the text the single hero of the frame."
    ],
    sections: [
      {
        h: "What to put in the audio track instead",
        p: [
          "The recitation is your audio track. Pick a clean recording, set the level so peaks never clip, and let short pauses between phrases do the work a soundtrack would do.",
          "If you feel the clip needs depth, choose a deeper voice or a slower pace — change the recitation, do not decorate it."
        ]
      },
      {
        h: "What to put on screen instead of music energy",
        p: [
          "Motion can come from the text: word-by-word highlighting, a slow background drift, a single color shift at the end. Each change replaces the role music would have played.",
          "Keep cuts minimal and let the eye rest. Music-free clips are shared more in family groups precisely because they are safe to play anywhere."
        ]
      }
    ],
    apply: "Build one clip in {t} with recitation only, no added audio layer. Compare it with an older music version if you have one — you will usually keep the cleaner file.",
    faq: [
      ["Does removing music hurt reach?", "Reach comes from completion and sharing, not from trending audio. Music-free clips circulate well, especially in religious audiences."],
      ["Can I add soft background sound?", "The safer choice is none. If you must, keep it far below the recitation — but pure recitation is the standard here."],
      ["What about sound effects for transitions?", "Prefer visual transitions; audio effects applied to recitation cross a line we cover in the Arabic article on sound design."]
    ],
    links: [
      ["/articles/quran-video-no-music/", "Arabic version"],
      ["/en/articles/khushoo-quran-video/", "Khushoo in clips"],
      ["/articles/quran-radio/", "Live Quran radio"]
    ],
    cluster: "video"
  },
  {
    slug: "short-quran-verses-video",
    arTwin: "short-quran-verses-video",
    title: "Short Quran Verses for Video: Complete in Thirty Seconds | Quran Reels",
    desc: "How to pick a short ayah that still carries a full meaning for Reels and Shorts — plus the two rules that keep the clip honest and shareable.",
    kw: "short quran verses for video,30 second quran video, short ayah reel, quran reels",
    short: "Short verses",
    lead: "Short does not mean truncated. A complete short ayah delivers a whole message in seconds, which is why it gets watched to the end and forwarded in family groups. {t} helps you pick it — and two rules keep the selection honest.",
    points: [
      "Under sixty seconds, completion rates rise — and completion drives distribution.",
      "A self-contained meaning gets shared; a cut fragment gets reported or ignored.",
      "One theme per clip: reminder, reflection, or greeting — not all three."
    ],
    sections: [
      {
        h: "Complete meaning beats short length",
        p: [
          "Before you admire the word count, check the sense: does the excerpt stand alone without leaving the listener waiting for the second half? If not, widen the range even if the clip grows ten seconds.",
          "Work from a themed list of short verses rather than random browsing — themes give you a month of ideas in one sitting."
        ]
      },
      {
        h: "Copy exactly — never retype",
        p: [
          "Select the verse as it appears in the Uthmani script and paste it into the generator. Retyping invites diacritic errors that viewers will catch before you do.",
          "In the caption, name the surah and verse number. Search — and humans — look for that precision when they re-share."
        ]
      }
    ],
    apply: "Pick three short verses in {t} from different themes and render all three in one session. Notice which theme your own audience finishes — that becomes next week's theme.",
    faq: [
      ["Which surahs work best for very short clips?", "Any surah with self-contained short ayahs. Start from the curated short-verse library, then verify the context before publishing."],
      ["How many ayahs per clip?", "One, or two connected ones at most. Multiple unrelated ayahs split attention in a format built for one idea."],
      ["Should I add English translation?", "For English-facing audiences yes — the built-in translation offers eight languages as a text layer under the Arabic."]
    ],
    links: [
      ["/articles/short-quran-verses-video/", "Arabic version"],
      ["/en/articles/quran-video-maker-guide/", "Maker guide"],
      ["/articles/quran-word-highlight-video/", "Word-by-word style (AR)"]
    ],
    cluster: "video"
  },
  {
    slug: "best-quran-reciters-video",
    arTwin: "best-quran-reciters-video",
    title: "Choosing a Quran Reciter for Your Videos: a Practical Method | Quran Reels",
    desc: "How to choose a reciter from a library of47 voices: match the mission of the clip (reflection, impact, teaching), run a30-second sample test, and stay consistent.",
    kw: "best quran reciter for video, choosing reciter, quran voice for reels, quran reels",
    short: "Choosing a reciter",
    lead: "There is no universally best reciter — there is the right voice for a given clip. Reflection wants calm, impact wants depth, teaching wants measured pauses. {t} exposes47 classified voices, and this guide turns the choice into a method.",
    points: [
      "Decide the mission of the clip first; the voice follows the mission.",
      "A30-second sample from the middle of a long surah reveals breath and precision.",
      "Keep one voice per series — consistency builds recognition."
    ],
    sections: [
      {
        h: "The30-second sample test",
        p: [
          "Do not listen to whole surahs to pick a voice. Take the middle of a long surah: that is where breath control, articulation and steadiness show themselves honestly.",
          "Compare candidates on the same device your audience uses — a phone speaker, not studio monitors. What survives the small speaker will survive the feed."
        ]
      },
      {
        h: "Mission-based selection",
        p: [
          "Murattal suits study and long-form reflection; mujawwad suits one-line impact clips; mu'allim suits teaching. The classifications are already labeled in the library, so you are choosing by function, not by fame.",
          "When a series works with one voice, announce the voice in the caption — reciter credit is both courtesy and how new viewers search for you."
        ]
      }
    ],
    apply: "Pick three candidates in {t}, run the sample test on each, and write one word of description per voice. The winner becomes your voice for the next five clips.",
    faq: [
      ["Should I follow popularity?", "Popularity helps discovery, but clarity and mission fit decide completion. A precise lesser-known voice beats a famous ill-fitting one."],
      ["Can I change voices mid-series?", "Announced guest voices work; silent daily swaps break recognition. Change at series boundaries, not every post."],
      ["Where do I see the full classification?", "In the reciters library — each of the47 profiles lists its styles and prefills the maker with that voice."]
    ],
    links: [
      ["/ar/reciters/", "Reciters library"],
      ["/articles/best-quran-reciters-video/", "Arabic version"],
      ["/en/articles/quran-video-maker-guide/", "Maker guide"]
    ],
    cluster: "reciters"
  },
  {
    slug: "prayer-times-accuracy",
    arTwin: "prayer-times-accuracy",
    title: "Prayer Times Accuracy:13 Calculation Methods Explained | Quran Reels",
    desc: "Why prayer times differ between apps and how to configure yours: pick the method your authority follows, enable DST properly, and re-check when you travel.",
    kw: "prayer times accuracy, calculation methods, salah times, quran reels",
    short: "Prayer times",
    lead: "The gap between apps is not a bug — it is fifteen different scholarly methods computing twilight differently. {t} exposes thirteen of them with timezone and DST handling, so the fix is configuration: choose the method your local authority follows and the times line up.",
    points: [
      "Choose the calculation method your country's authority follows.",
      "Enable automatic DST where applicable so times move with the clock.",
      "After travel, re-check the city first — settings are location-bound."
    ],
    sections: [
      {
        h: "Why two apps disagree by several minutes",
        p: [
          "Methods differ in the sun angles they use for Fajr and Isha. Each is valid in some jurisdiction; none is a math error. Comparing apps without comparing methods only produces anxiety.",
          "When an app and our page disagree, check three things in order: method, city, and DST setting. The misconfiguration is almost always one of those three."
        ]
      },
      {
        h: "Travel and the daily rhythm",
        p: [
          "On a trip, open the page once on arrival and confirm the city. A stale saved location is the classic source of 'why was my alarm ten minutes late'.",
          "For daily use, set alarms from the same source you read — mixing an app's table with another app's notifications recreates the discrepancy you were trying to avoid."
        ]
      }
    ],
    apply: "Open {t} now, set your city and the method your authority uses, and compare tomorrow's Fajr with the official table. If they match, you are configured; if not, change the method, not the app.",
    faq: [
      ["Which method is 'correct'?", "The one your local authority follows. The page presents thirteen documented methods precisely because correctness here is jurisdictional."],
      ["Do times update offline?", "Once the page is open, today's times remain available; a fresh load refreshes them for your current location."],
      ["Why did my alarm fire late after travel?", "Usually a cached city. Open the page and confirm location whenever you move — it takes seconds."]
    ],
    links: [
      ["/en/prayer-times/", "Prayer times (EN)"],
      ["/articles/prayer-times-accuracy/", "Arabic version"],
      ["/en/articles/qibla-direction-guide/", "Qibla direction"]
    ],
    cluster: "prayer"
  },
  {
    slug: "qibla-direction-guide",
    arTwin: "qibla-direction-guide",
    title: "Finding the Qibla Anywhere in Two Steps | Quran Reels",
    desc: "A practical qibla guide: read the angle and distance from your coordinates, align it once in your room, and stop guessing in hotels and new cities.",
    kw: "qibla direction, qibla finder, which way is the qibla, quran reels",
    short: "Qibla direction",
    lead: "The qibla is not a feeling — it is an angle on a sphere. {t} computes the bearing and distance from your coordinates to Mecca, and once you align it in your room, the hotel-lobby panic disappears for the rest of your stay.",
    points: [
      "Results show the bearing from true north plus the distance in kilometers.",
      "Your phone compass follows your body if the sensor is available.",
      "While traveling, compute on arrival night — not at Fajr."
    ],
    sections: [
      {
        h: "Align once, keep the mark",
        p: [
          "Face the displayed angle, then place a fixed reference — a small mark on the wall, the headboard direction, or a note with the number. From then on you do not re-open the calculator for every prayer.",
          "In rooms without a usable compass, save the numeric bearing and use a ruler edge or floor line to transfer the angle."
        ]
      },
      {
        h: "What changes and what never does",
        p: [
          "The qibla depends on your coordinates, not on the city name in a dropdown — dense cities can differ slightly between districts, which is why coordinates matter.",
          "Prayer itself remains flexible when space is tight: do what is available, facing the closest you can manage, and keep the app for exactness when the room allows it."
        ]
      }
    ],
    apply: "Open {t} in your current room, align one reference, and test it tonight with a single prayer. After that, the tool becomes a travel utility, not a daily search.",
    faq: [
      ["Does the qibla change between neighboring countries?", "Slightly, with coordinates. That tiny drift is exactly why the page computes from your position rather than a country default."],
      ["Does it work without internet?", "After the first load, the last computed result remains usable for a while; save the number before a flight."],
      ["What if I cannot face it exactly?", "Make things easy: do what the space allows. The calculator is for precision when precision is possible."]
    ],
    links: [
      ["/en/qibla-direction/", "Qibla tool (EN)"],
      ["/articles/qibla-direction-guide/", "Arabic version"],
      ["/en/articles/prayer-times-accuracy/", "Prayer times"]
    ],
    cluster: "prayer"
  },
  {
    slug: "khushoo-quran-video",
    arTwin: "khushoo-quran-video",
    title: "Khushoo in Short Clips: Making Quran Videos That Linger | Quran Reels",
    desc: "Practical principles of reverent Quran clips: one visual pace, dark calm colors, unadorned recitation, and a text that never competes with effects.",
    kw: "khushoo quran video, reverent quran reel, calm quran clip, quran reels",
    short: "Khushoo clips",
    lead: "Khushoo in video is craft, not mood-talk: slow where it should be slow, silent where it should be silent, and never filling every corner of the frame. Calm clips reach hearts that loud ones miss — and they invite a second watch.",
    points: [
      "One shot rhythm per ayah; avoid music-video cutting speeds.",
      "Dark palettes with gold keep attention on the letterforms.",
      "Let the recitation carry the sound — no effects above it."
    ],
    sections: [
      {
        h: "Movement that serves stillness",
        p: [
          "Allow exactly one gentle change every few seconds — a text move, a slow pan, a color shift — enough for the eye to stay, not enough to entertain it away from the words.",
          "Avoid flashing accents, rapid zooms, and decorative particles. They raise the pulse when the clip should lower it."
        ]
      },
      {
        h: "Silence as a design element",
        p: [
          "Pauses between phrases are part of the recitation; do not fill them with sound effects. The breath of the reciter is the soundtrack.",
          "Endings matter: hold the last word a beat longer than comfortable, then fade — a respectful close is more memorable than a hard cut."
        ]
      }
    ],
    apply: "Render the same ayah twice in {t}: one energetic, one restrained. Watch both a day later — the restrained one is usually the file you keep.",
    faq: [
      ["Does calm content bore viewers?", "Static content bores; calm-but-moving content completes. The variable is change over time, not noise."],
      ["What length works for khushoo clips?", "Thirty to fifty seconds suits a mid-length ayah; shorter for reminders, longer only if the visual stays alive."],
      ["Which reciter suits this style?", "A steady murattal voice — the reciters library lets you filter and test before rendering."]
    ],
    links: [
      ["/ar/khushoo-quran-video/", "Khushoo filter (AR)"],
      ["/articles/khushoo-quran-video/", "Arabic version"],
      ["/en/articles/quran-video-no-music/", "Music-free clips"]
    ],
    cluster: "video"
  },
  {
    slug: "adhkar-sabah-guide",
    arTwin: "adhkar-sabah-guide",
    title: "Morning Adhkar: A Habit That Starts Before the Phone | Quran Reels",
    desc: "How to build a morning adhkar routine that survives real mornings: a fixed anchor, a clean counter, three starters instead of twenty, and a place you never change.",
    kw: "morning adhkar, morning dhikr routine, adhkar habit, quran reels",
    short: "Morning adhkar",
    lead: "Morning adhkar fail for one reason: they float free of any anchor. Tie them to waking, keep them near your water or mirror, start with three mastered items, and let the counter show what is done instead of what is forgotten.",
    points: [
      "Anchor to waking or to the first sip of the day — not to an alarm you dismiss.",
      "Begin with three items you truly master; add progressively, not ambitiously.",
      "The clean counter reveals what was skipped — use it, do not fear it."
    ],
    sections: [
      {
        h: "Choose the anchor before the list",
        p: [
          "Pick the moment you never skip — sitting on the bed edge, before standing, before checking your phone. The action must precede the first scroll of the day, or the phone will take the slot first.",
          "Keep the place fixed too: the same pillow, the same corner. Locations remember for you when your willpower does not."
        ]
      },
      {
        h: "Three, then six, then the full gate",
        p: [
          "Start with three well-known items and repeat them for a week until they feel automatic. Then open the full bank (morning gate) and add a group at a time.",
          "Use the counter for exact repetition counts; anything unfinished stays visible for later — it is a to-do, not a verdict."
        ]
      }
    ],
    apply: "Open {t} tomorrow before your first screen of the day, do only the three starters, and repeat for seven days. After a week, decide whether to add the next group — the habit decides the scale.",
    faq: [
      ["What if I wake up late?", "Say the adhkar when you remember; they remain valid throughout the day. Do not skip entirely because the perfect morning vanished."],
      ["How long should the full set take?", "Five to ten minutes with the counter. Longer only if you are reading from memory and unhurried."],
      ["Should children do the same routine?", "Shorten it: three favorites with a game-style counter — see the kids' adhkar game article."]
    ],
    links: [
      ["/ar/adhkar/", "Adhkar (AR)"],
      ["/articles/adhkar-sabah-guide/", "Arabic version"],
      ["/en/articles/quran-khatma-plan/", "Khatma planning"]
    ],
    cluster: "azkar"
  },
  {
    slug: "quran-khatma-plan",
    arTwin: "quran-khatma-plan",
    title: "Khatma Plan: From Thirty Juz to Thirty Days | Quran Reels",
    desc: "How to schedule a complete Quran reading: fix the completion date first, let the plan distribute daily portions, and track progress visibly instead of vaguely.",
    kw: "quran khatma plan, khatma schedule, complete quran plan, quran reels",
    short: "Khatma plan",
    lead: "Khatma plans fail when they start from intention instead of a date. Choose the night you want to finish, let the calculator spread the pages across the days that remain, then follow one small daily portion — the date does the motivating.",
    points: [
      "Pick the completion date first; the daily portion derives from it.",
      "Small daily readings beat heroic weekends that collapse.",
      "Log each day — a visible streak outlasts a noble intention."
    ],
    sections: [
      {
        h: "Fix the end date, then work backward",
        p: [
          "A target date (a Ramadan, a blessed night, a personal milestone) turns 'sometime this year' into a distributed daily number. The plan updates as you go, so a missed day is recalculated, not guilted over.",
          "Choose a pace your ordinary week can hold. The plan should feel light on your busiest weekday, not only on your calmest."
        ]
      },
      {
        h: "Track in public, not in memory",
        p: [
          "Keep the tracker visible — a family board or the shared group link. Progress that others can see becomes a quiet obligation you enjoy keeping.",
          "End each week with a two-minute review: ahead, on track, or behind. The answer adjusts next week's portion, nothing more dramatic than that."
        ]
      }
    ],
    apply: "Open {t}, set your completion date, and read today's portion tonight. Repeat for one week before changing anything — the plan works on consistency, not on inspection daily.",
    faq: [
      ["What if I fall behind?", "Let the plan redistribute over the remaining days instead of doubling portions overnight. Catch-up should stay sustainable."],
      ["Is a family khatma better?", "Often — shared links keep everyone visible without accounts. Create one and send the link to your household."],
      ["Reading or memorization first?", "Khatma is reading; memorization runs on its own parallel plan with spaced review."]
    ],
    links: [
      ["/ar/quran-khatma/", "Khatma calculator (AR)"],
      ["/articles/quran-khatma-plan/", "Arabic version"],
      ["/en/articles/adhkar-sabah-guide/", "Morning adhkar"]
    ],
    cluster: "hifz"
  },
  {
    slug: "ethical-quran-content",
    arTwin: "ethical-quran-content",
    title: "Ethics of Quran Content: Three Red Lines | Quran Reels",
    desc: "Three non-negotiable rules for publishing Quran content: preserve the text exactly, credit reciters and sources, and never claim what you cannot verify.",
    kw: "quran content ethics, publishing quran, responsible quran videos, quran reels",
    short: "Ethical boundaries",
    lead: "A Quran clip is not ordinary content: errors multiply silently and claims stick to your name. Three red lines hold the whole practice — exact text, honest credit, verified claims — and everything else is craft built on top of them.",
    points: [
      "Never alter, illustrate over, or re-letter the ayah itself.",
      "Credit reciter, surah and source in every publication — no exceptions.",
      "Make no claim (fatwa, guarantee, discovery) you cannot back."
    ],
    sections: [
      {
        h: "Line one: the text is untouchable",
        p: [
          "Copy the Uthmani text directly; never retype or 'improve' it. If an error reaches the feed, correct it visibly — hiding a textual error costs more trust than fixing it publicly.",
          "Design around the text, never through it: no effects that distort letterforms, no cropping that cuts a word."
        ]
      },
      {
        h: "Lines two and three: credit and verification",
        p: [
          "Every publication names the surah and reciter; re-used recordings also name their source. Attribution is a duty, not a courtesy.",
          "As for claims: if your evidence is a forwarded message, it is not content yet. Use official calendars, documented sources — or stay silent until they speak."
        ]
      }
    ],
    apply: "Audit your last three posts in {t}'s framework: text exact? credit present? claims verified? Fix anything that fails before you publish the next clip.",
    faq: [
      ["What if I published a textual error?", "Correct it immediately with a clear note. Audiences forgive swift fixes; they remember cover-ups."],
      ["Can I use the Quran in promotional copy?", "Publish it as guidance and recitation, not as a slogan pushing a sale — dignity is the operating standard."],
      ["Is credit alone enough for reused audio?", "Credit is required; check the recording's license too. Both, not either."]
    ],
    links: [
      ["/articles/ethical-quran-content/", "Arabic version"],
      ["/articles/reciter-voice-rights/", "Voice rights"],
      ["/en/articles/quran-video-maker-guide/", "Maker guide"]
    ],
    cluster: "publishing"
  },
  {
    slug: "ramadan-reels-plan",
    arTwin: "ramadan-reels-plan",
    title: "Ramadan Reels: a Thirty-Day Publishing Plan | Quran Reels",
    desc: "A practical Ramadan content plan: one clip type per day, two posting windows (after iftar and before suhoor), and a batch prepared during Sha'ban.",
    kw: "ramadan reels plan, ramadan content plan, ramadan quran videos, quran reels",
    short: "Ramadan plan",
    lead: "Ramadan rewards preparation: those who batch twenty clips in Sha'ban publish daily calmly, while others hunt for ideas every night. This plan fixes the daily clip type, the two posting windows, and one preparation session before the month.",
    points: [
      "Post windows: right after iftar, and mid-suhoor — not midday.",
      "One fixed type per day removes decision fatigue.",
      "Batch production in Sha'ban: the month becomes publishing, not creating."
    ],
    sections: [
      {
        h: "The two windows that actually move",
        p: [
          "Screens are busy after iftar and during suhoor; they are polite at midday. Schedule your two strongest clips for those windows and keep midday for lighter reminders.",
          "Ten or twenty prepared clips beat daily improvisation. Render them in batches, keep captions ready, and leave only the final touch per day."
        ]
      },
      {
        h: "Types that rotate without confusion",
        p: [
          "Fix a simple rotation: reminder, ayah, adhkar, family — four types on repeat. Viewers learn the rhythm, and you stop negotiating with yourself every evening.",
          "In the last ten nights, shorten further and let the content breathe with worship — impact comes from presence, not volume."
        ]
      }
    ],
    apply: "In {t}, schedule a Sha'ban preparation weekend: pick twenty verses, render in batches, and write captions in advance. During Ramadan, your only daily job is publishing.",
    faq: [
      ["How many clips per day?", "One excellent clip beats two average ones; two windows exist if your capacity supports them consistently."],
      ["I started late — now what?", "Begin with a light three-per-week plan and grow; do not attempt to catch up with a schedule you never had."],
      ["Can I repost last year's clips?", "Yes, with refreshed captions and an updated thumbnail — seasonal content has a natural yearly return."]
    ],
    links: [
      ["/ar/quran-video-ramadan/", "Ramadan filter (AR)"],
      ["/articles/ramadan-reels-plan/", "Arabic version"],
      ["/blog/quran-video-ideas/", "Daily video ideas (AR)"]
    ],
    cluster: "seasons"
  },
  {
    slug: "seo-for-quran-videos",
    arTwin: "seo-for-quran-videos",
    title: "SEO for Quran Videos: Titles and Descriptions Search Understands | Quran Reels",
    desc: "How to write Quran video metadata so platforms and search engines find it: the request in the first line, full surah and reciter names, and three honest tags.",
    kw: "seo for quran videos, quran video description, discoverability, quran reels",
    short: "Video SEO",
    lead: "In-platform search reads text, not pixels. Whoever writes 'Full Surah Al-Mulk by Al-Dosari' gets found; whoever writes 'beautiful words' does not. Three components do the work: a title carrying the request, a caption carrying the details, and a few honest tags.",
    points: [
      "First caption line: request language — surah, reciter, format.",
      "Full official names are how humans and search both match you.",
      "Three to five truthful tags beat twenty drifting ones."
    ],
    sections: [
      {
        h: "The first line carries the search",
        p: [
          "Search boxes and previews read the beginning. Put the surah and the intent there ('full recitation', 'morning adhkar', 'short reminder') before any greeting.",
          "Use the exact names people type: the reciter's known spelling, the surah's common title, and the format word (Reels, Shorts)."
        ]
      },
      {
        h: "Tags are secondary — accuracy is primary",
        p: [
          "Tags help classification; they never rescue an inaccurate caption. Get the three facts right first (what, who, which format), then add a small tag set.",
          "Revisit older clips with weak captions: updating them is one of the cheapest visibility wins available."
        ]
      }
    ],
    apply: "Open your last three uploads and rewrite their first line to carry request language. This ten-minute edit is the highest-yield SEO work for short video.",
    faq: [
      ["Arabic or English captions?", "The language of your primary audience; add a translated line when you target another market deliberately."],
      ["How many tags?", "Three to five relevant ones. More invites misclassification rather than reach."],
      ["Do long descriptions help?", "Clear and moderate wins; the first two lines are what get read before truncation."]
    ],
    links: [
      ["/articles/seo-for-quran-videos/", "Arabic version"],
      ["/en/articles/quran-video-specs/", "Formats"],
      ["/en/articles/ethical-quran-content/", "Ethical boundaries"]
    ],
    cluster: "publishing"
  },
  {
    slug: "faceless-quran-channel",
    arTwin: "faceless-quran-channel",
    title: "Building a Faceless Quran Channel: Identity Without Showing Your Face | Quran Reels",
    desc: "How a Quran channel succeeds without on-camera presence: a fixed visual system, a signature reciter, interaction in comments, and where appearance still matters.",
    kw: "faceless quran channel, anonymous quran channel, youtube without face, quran reels",
    short: "Faceless channel",
    lead: "A faceless channel concentrates attention on the text — and pays for it with a visual identity that must be recognizable from one frame. The formula: fixed template, signature voice, engagement in comments, and honest ownership even without a face.",
    points: [
      "One template (background, font, accent) reused until it is your signature.",
      "The reciter becomes the audible face — choose and keep.",
      "Interaction in comments supplies the closeness the camera would."
    ],
    sections: [
      {
        h: "Design a system, not one-off looks",
        p: [
          "Write your template down: palette, text position, safe margins, ending frame. Every clip obeys it. Recognition compounds faster than novelty.",
          "Change the system only at brand milestones — mid-season redesigns erase the little recognition you have built."
        ]
      },
      {
        h: "Closeness without the camera",
        p: [
          "Reply to comments in text with your voice; pin answers; let regulars know the schedule. Proximity is built through reliability more than through a face.",
          "Disclose ownership when asked or required — a faceless channel is not an anonymous responsibility-free channel."
        ]
      }
    ],
    apply: "Lock your template in {t}, produce three consecutive clips with it, and show them to someone who does not follow you: if they recognize the style, the system works.",
    faq: [
      ["Do faceless channels get monetized?", "Platforms care about originality and policy compliance, not faces. Keep your content original and your disclosures honest."],
      ["Which reciter becomes my 'face'?", "One steady voice per series, credited in every caption — the voice people search for by name."],
      ["Should I ever appear?", "On your terms — special episodes or community posts. Optional appearance keeps its impact; forced appearance removes it."]
    ],
    links: [
      ["/articles/faceless-quran-channel/", "Arabic version"],
      ["/en/articles/best-quran-reciters-video/", "Choosing a reciter"],
      ["/en/articles/ethical-quran-content/", "Ethical boundaries"]
    ],
    cluster: "video"
  }
];

module.exports = A.concat(require("./en_b.js"), require("./en_c.js"), require("./en_d.js"));
