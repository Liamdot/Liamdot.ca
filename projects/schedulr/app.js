// Schedulr
// Enter the courses you might take and every section they're offered in.
// Schedulr finds every combination that doesn't clash, draws them as weekly
// calendars, and checks your requirements and prerequisites.
//
// This file is split into parts:
//   1. Settings      - days, terms, colours, the example data
//   2. State         - your courses, busy times and requirements
//   3. Helpers       - times, codes, building page elements
//   4. Timetables    - finding every combination that fits, and ranking them
//   5. Requirements  - checking requirements and prerequisites
//   6. Drawing       - the three tabs
//   7. Input         - tabs, buttons, import/export
//   8. Saving

// ===========================================================================
// 1. Settings
// ===========================================================================

const SAVE_KEY = "schedulr-save";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The terms in a school year. "Both" is for full-year courses.
const TERMS = { T1: "Term 1", T2: "Term 2", Both: "Full year" };

// Kinds of section. A course needs one section of each kind it has
// (e.g. one LEC and one LAB).
const SECTION_TYPES = ["LEC", "LAB", "TUT", "SEM"];

// Stop looking after this many timetables, so huge course lists stay fast.
const MAX_TIMETABLES = 2000;

// How tall one hour is in the calendar, in pixels.
const HOUR_PX = 50;

// One colour per course, in order.
const COLORS = ["#ffd6a5", "#caffbf", "#9bf6ff", "#bdb2ff", "#ffc6ff", "#fdffb6", "#a0c4ff", "#ffadad", "#d0f4de", "#e4c1f9"];

// Example data, shown the first time and by "load example".
const EXAMPLE = {
  courses: [
    {
      code: "CPSC 110", name: "Computation, Programs, and Programming", credits: 4,
      sections: [
        { type: "LEC", label: "101", term: "T1", meetings: [{ days: ["Mon", "Wed", "Fri"], start: "10:00", end: "11:00" }] },
        { type: "LEC", label: "201", term: "T2", meetings: [{ days: ["Tue", "Thu"], start: "11:00", end: "12:30" }] },
        { type: "LAB", label: "L1A", term: "T1", meetings: [{ days: ["Tue"], start: "14:00", end: "16:00" }] },
        { type: "LAB", label: "L1B", term: "T1", meetings: [{ days: ["Thu"], start: "09:00", end: "11:00" }] },
        { type: "LAB", label: "L2A", term: "T2", meetings: [{ days: ["Wed"], start: "13:00", end: "15:00" }] },
      ],
    },
    {
      code: "MATH 100", name: "Differential Calculus", credits: 3,
      sections: [
        { type: "LEC", label: "101", term: "T1", meetings: [{ days: ["Mon", "Wed", "Fri"], start: "09:00", end: "10:00" }] },
        { type: "LEC", label: "102", term: "T1", meetings: [{ days: ["Tue", "Thu"], start: "12:30", end: "14:00" }] },
        { type: "LEC", label: "201", term: "T2", meetings: [{ days: ["Mon", "Wed", "Fri"], start: "11:00", end: "12:00" }] },
      ],
    },
    {
      code: "ENGL 110", name: "Approaches to Literature", credits: 3,
      sections: [
        { type: "LEC", label: "001", term: "T1", meetings: [{ days: ["Tue", "Thu"], start: "09:30", end: "11:00" }] },
        { type: "LEC", label: "002", term: "T2", meetings: [{ days: ["Mon", "Wed"], start: "14:00", end: "15:30" }] },
      ],
    },
    {
      code: "PHYS 117", name: "Dynamics and Waves", credits: 3,
      sections: [
        { type: "LEC", label: "101", term: "T1", meetings: [{ days: ["Tue", "Thu"], start: "14:00", end: "15:30" }] },
        { type: "LEC", label: "201", term: "T2", meetings: [{ days: ["Mon", "Wed"], start: "09:00", end: "10:30" }] },
        { type: "LAB", label: "L01", term: "T1", meetings: [{ days: ["Fri"], start: "13:00", end: "16:00" }] },
        { type: "LAB", label: "L02", term: "T2", meetings: [{ days: ["Thu"], start: "13:00", end: "16:00" }] },
      ],
    },
    {
      code: "CPSC 210", name: "Software Construction", credits: 4, prereqs: "CPSC 110",
      sections: [
        { type: "LEC", label: "201", term: "T2", meetings: [{ days: ["Mon", "Wed", "Fri"], start: "15:00", end: "16:00" }] },
        { type: "LAB", label: "L2B", term: "T2", meetings: [{ days: ["Fri"], start: "10:00", end: "12:00" }] },
      ],
    },
  ],
  busy: [
    { label: "Soccer practice", term: "Both", days: ["Tue", "Thu"], start: "17:00", end: "19:00" },
  ],
  completed: "MATH 12, PHYS 12",
  requirements: [
    { type: "credits", credits: 15 },
    { type: "course", code: "MATH 100" },
    { type: "choose", count: 1, codes: "ENGL 110, ENGL 112, WRDS 150" },
  ],
};

// ===========================================================================
// 2. State
// ===========================================================================

let data;               // everything you've entered (see normalize() for its shape)
let currentTab = "courses";

let found = null;       // the last search: { timetables, messages, cutOff }, or null if out of date
let showing = 0;        // which timetable is on screen

// ===========================================================================
// 3. Helpers
// ===========================================================================

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// "cpsc110", "CPSC 110" and " Cpsc  110 " all count as the same course.
function sameCode(code) {
  return String(code || "").toUpperCase().replace(/\s+/g, "");
}

// Splits "MATH 12, PHYS 12" into ["MATH 12", "PHYS 12"], as you typed them.
function listItems(text) {
  return String(text || "").split(/[,\n;]+/).map((item) => item.trim()).filter(Boolean);
}

// Same, but ready for comparing: ["MATH12", "PHYS12"].
function codeList(text) {
  return listItems(text).map(sameCode);
}

// "09:30" -> 570 (minutes after midnight). Blank or broken -> NaN.
function toMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})/.exec(time || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

// 570 -> "9:30am"
function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  return `${((h + 11) % 12) + 1}:${m}${h < 12 ? "am" : "pm"}`;
}

// A short time range for calendar blocks: "10–11am", "9:30–11am", "11am–12:30pm"
function formatRange(start, end) {
  const short = (minutes) => formatTime(minutes).replace(":00", "");
  const sameHalf = (start < 720) === (end < 720);
  return sameHalf
    ? `${short(start).replace(/am|pm/, "")}–${short(end)}`
    : `${short(start)}–${short(end)}`;
}

// 90 -> "1h 30m"
function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

// Which terms something runs in: "T1" -> ["T1"], "Both" -> ["T1", "T2"]
function termsOf(term) {
  return term === "Both" ? ["T1", "T2"] : [term];
}

function sharesTerm(a, b) {
  return a.some((term) => b.includes(term));
}

// A meeting is usable if it has at least one day and ends after it starts.
function isValidMeeting(meeting) {
  const start = toMinutes(meeting.start);
  const end = toMinutes(meeting.end);
  return meeting.days.length > 0 && start < end;
}

function courseColor(course) {
  return COLORS[data.courses.indexOf(course) % COLORS.length];
}

function courseName(course) {
  return course.code || course.name || "Untitled course";
}

// Makes a page element. For example:
//   el("button", { class: "pill", onclick: doThing }, "Click me")
// makes <button class="pill">Click me</button> that calls doThing when clicked.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  let value;
  for (const [key, val] of Object.entries(props)) {
    if (key === "class") node.className = val;
    else if (key === "style") node.setAttribute("style", val);
    else if (key === "value") value = val; // set after the children, so <select> options exist
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), val);
    else if (key in node) node[key] = val;
    else node.setAttribute(key, val);
  }
  node.append(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false));
  if (value !== undefined) node.value = value;
  return node;
}

// ===========================================================================
// 4. Timetables
// ===========================================================================

// Tries every combination of sections for the given courses, and returns
// the ones where nothing overlaps (up to "limit" of them).
//
// It works like filling in a form one box at a time: pick a section for the
// first slot, then the next, and whenever a pick clashes with something
// already picked, skip it. Backing up and trying the next option like this
// is called "backtracking".
function findTimetables(courses, limit) {
  const earliest = toMinutes(data.prefs.earliest);
  const latest = toMinutes(data.prefs.latest);
  const slots = [];     // one slot per course per section type, e.g. "CPSC 110 LAB"
  const messages = [];
  let impossible = false;

  for (const course of courses) {
    if (course.sections.length === 0) {
      messages.push(`${courseName(course)} has no sections yet, so it was left out.`);
      continue;
    }

    for (const type of SECTION_TYPES) {
      const ofType = course.sections.filter((section) => section.type === type);
      if (ofType.length === 0) continue;

      const options = ofType.filter((section) => {
        if (section.excluded) return false;
        // respect "no classes before/after"
        return section.meetings.filter(isValidMeeting).every((meeting) => {
          if (earliest && toMinutes(meeting.start) < earliest) return false;
          if (latest && toMinutes(meeting.end) > latest) return false;
          return true;
        });
      });

      if (options.length === 0) {
        messages.push(`No ${type} section of ${courseName(course)} is allowed. Tick more sections, or change "no classes before/after".`);
        impossible = true;
      }
      slots.push({ course, options });
    }
  }

  if (impossible) return { timetables: [], messages, cutOff: false };

  // Fill the slots with the fewest options first - it finds clashes sooner.
  slots.sort((a, b) => a.options.length - b.options.length);

  // Busy times count as already taken.
  const taken = [];
  for (const busy of data.busy) {
    if (!isValidMeeting(busy)) continue;
    for (const day of busy.days) {
      taken.push({ terms: termsOf(busy.term), day, start: toMinutes(busy.start), end: toMinutes(busy.end) });
    }
  }

  const timetables = [];
  const picks = [];
  let cutOff = false;

  function fits(course, section) {
    const terms = termsOf(section.term);

    // A course's lecture and lab have to be in the same term.
    for (const pick of picks) {
      if (pick.course === course && !sharesTerm(termsOf(pick.section.term), terms)) return false;
    }

    // Nothing can overlap anything already taken on the same day and term.
    for (const meeting of section.meetings.filter(isValidMeeting)) {
      const start = toMinutes(meeting.start);
      const end = toMinutes(meeting.end);
      for (const day of meeting.days) {
        for (const other of taken) {
          if (other.day === day && start < other.end && other.start < end && sharesTerm(other.terms, terms)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  function search(slotIndex) {
    if (timetables.length >= limit) {
      cutOff = true;
      return;
    }
    if (slotIndex === slots.length) {
      timetables.push(picks.slice());
      return;
    }

    const { course, options } = slots[slotIndex];
    for (const section of options) {
      if (!fits(course, section)) continue;

      // Take this section...
      picks.push({ course, section });
      const before = taken.length;
      for (const meeting of section.meetings.filter(isValidMeeting)) {
        for (const day of meeting.days) {
          taken.push({ terms: termsOf(section.term), day, start: toMinutes(meeting.start), end: toMinutes(meeting.end) });
        }
      }

      // ...fill in the rest...
      search(slotIndex + 1);

      // ...then undo it and try the next option.
      taken.length = before;
      picks.pop();
      if (cutOff) return;
    }
  }

  search(0);
  return { timetables, messages, cutOff };
}

// Numbers used to rank a timetable.
function statsFor(timetable) {
  // Every class, split up by term and day: { "T1 Mon": [[540, 600], ...] }
  const byDay = {};
  const credits = { T1: 0, T2: 0 };

  for (const { course, section } of timetable) {
    for (const meeting of section.meetings.filter(isValidMeeting)) {
      for (const term of termsOf(section.term)) {
        for (const day of meeting.days) {
          const key = `${term} ${day}`;
          (byDay[key] = byDay[key] || []).push([toMinutes(meeting.start), toMinutes(meeting.end)]);
        }
      }
    }
  }

  // Credits per term (a full-year course counts half in each).
  const seen = new Set();
  for (const { course, section } of timetable) {
    if (seen.has(course)) continue;
    seen.add(course);
    const terms = termsOf(section.term);
    for (const term of terms) credits[term] += course.credits / terms.length;
  }

  let gaps = 0;
  let startTotal = 0;
  for (const classes of Object.values(byDay)) {
    classes.sort((a, b) => a[0] - b[0]);
    startTotal += classes[0][0];
    let lastEnd = classes[0][1];
    for (const [start, end] of classes.slice(1)) {
      if (start > lastEnd) gaps += start - lastEnd;
      lastEnd = Math.max(lastEnd, end);
    }
  }

  const days = Object.keys(byDay).length;
  return {
    gaps,
    days,
    averageStart: days ? Math.round(startTotal / days) : 0,
    credits,
    imbalance: Math.abs(credits.T1 - credits.T2),
    warnings: prereqWarnings(timetable).length,
  };
}

// Runs the search (if anything changed since last time) and sorts the results.
function refreshTimetables() {
  if (found) return;

  const courses = data.courses.filter((course) => course.include);
  found = findTimetables(courses, MAX_TIMETABLES);
  showing = 0;

  if (courses.length === 0) {
    found.timetables = []; // otherwise "nothing" would count as one empty timetable
    found.messages.push("No courses are included yet. Add some on the Courses tab.");
  } else if (found.timetables.length === 0 && found.messages.length === 0) {
    // Nothing fits. Find out which single course is the problem.
    const culprits = courses.filter((course) => {
      const others = courses.filter((other) => other !== course);
      return findTimetables(others, 1).timetables.length > 0;
    });
    found.messages.push(
      culprits.length
        ? `These courses can't all fit. Leaving out any one of these would work: ${culprits.map(courseName).join(", ")}.`
        : "These courses can't all fit, even leaving out any single one. Try allowing more sections."
    );
    found.bad = true;
  }

  // Rank them. Timetables with prerequisite problems always go last.
  const sortBy = {
    gaps: (a, b) => a.gaps - b.gaps || a.days - b.days,
    late: (a, b) => b.averageStart - a.averageStart || a.gaps - b.gaps,
    days: (a, b) => a.days - b.days || a.gaps - b.gaps,
    balance: (a, b) => a.imbalance - b.imbalance || a.gaps - b.gaps,
  }[data.prefs.sort] || ((a, b) => a.gaps - b.gaps);

  found.timetables = found.timetables
    .map((picks) => ({ picks, stats: statsFor(picks) }))
    .sort((a, b) => a.stats.warnings - b.stats.warnings || sortBy(a.stats, b.stats));
}

// Call this whenever something that affects timetables changes.
function timetablesOutOfDate() {
  found = null;
}

// ===========================================================================
// 5. Requirements
// ===========================================================================

function completedCodes() {
  return new Set(codeList(data.completed));
}

// Every included course, by its code.
function plannedCodes() {
  return new Set(data.courses.filter((course) => course.include).map((course) => sameCode(course.code)).filter(Boolean));
}

// Is a requirement met? Returns { met, text }.
function checkRequirement(req) {
  const done = completedCodes();
  const planned = plannedCodes();

  if (req.type === "credits") {
    const total = data.courses.filter((course) => course.include).reduce((sum, course) => sum + course.credits, 0);
    return { met: total >= req.credits, text: `${total} of ${req.credits} credits planned` };
  }

  if (req.type === "course") {
    const code = sameCode(req.code);
    if (!code) return { met: false, text: "enter a course code" };
    if (done.has(code)) return { met: true, text: "already taken" };
    if (planned.has(code)) return { met: true, text: "planned" };
    return { met: false, text: "not in your plan" };
  }

  if (req.type === "choose") {
    const matches = codeList(req.codes).filter((code) => done.has(code) || planned.has(code));
    return { met: matches.length >= req.count, text: `${matches.length} of ${req.count}` };
  }

  return { met: false, text: "" };
}

// Prerequisite problems in one timetable, taking terms into account:
// a prerequisite you're taking in Term 1 counts for a course in Term 2.
function prereqWarnings(timetable) {
  const done = completedCodes();
  const termsByCode = {};
  for (const { course, section } of timetable) {
    termsByCode[sameCode(course.code)] = termsOf(section.term);
  }

  const warnings = [];
  const seen = new Set();
  for (const { course, section } of timetable) {
    if (seen.has(course)) continue;
    seen.add(course);

    for (const prereq of listItems(course.prereqs)) {
      if (done.has(sameCode(prereq))) continue;
      const prereqTerms = termsByCode[sameCode(prereq)];
      const courseTerms = termsOf(section.term);
      const earlier = prereqTerms && prereqTerms.every((term) => courseTerms.every((t) => term < t));
      if (!earlier) {
        warnings.push(prereqTerms
          ? `${courseName(course)} needs ${prereq} first, but they're in the same term or the wrong order.`
          : `${courseName(course)} needs ${prereq}, which you haven't taken or planned.`);
      }
    }
  }
  return warnings;
}

// ===========================================================================
// 6. Drawing
// ===========================================================================

const courseListEl = document.getElementById("course-list");
const busyListEl = document.getElementById("busy-list");
const ttMessagesEl = document.getElementById("tt-messages");
const ttViewEl = document.getElementById("tt-view");
const ttCountEl = document.getElementById("tt-count");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const reqListEl = document.getElementById("req-list");
const reqSummaryEl = document.getElementById("req-summary");
const prereqListEl = document.getElementById("prereq-list");
const completedEl = document.getElementById("completed");

// ---- Courses tab ----

// Day buttons (Mo Tu We...) for a meeting or busy time.
function dayPicker(item) {
  return el("div", { class: "days" }, DAYS.map((day) =>
    el("button", {
      class: "day" + (item.days.includes(day) ? " on" : ""),
      type: "button",
      title: day,
      onclick: (e) => {
        item.days = item.days.includes(day) ? item.days.filter((d) => d !== day) : DAYS.filter((d) => d === day || item.days.includes(d));
        e.currentTarget.classList.toggle("on");
        changed();
      },
    }, day.slice(0, 2))
  ));
}

function timeInputs(item) {
  return [
    el("input", { type: "time", step: 300, value: item.start, oninput: (e) => { item.start = e.target.value; changed(); } }),
    "to",
    el("input", { type: "time", step: 300, value: item.end, oninput: (e) => { item.end = e.target.value; changed(); } }),
  ];
}

function termSelect(item) {
  return el("select", { value: item.term, onchange: (e) => { item.term = e.target.value; changed(); } },
    Object.entries(TERMS).map(([key, label]) => el("option", { value: key }, label)));
}

function meetingRow(section, meeting) {
  return el("div", { class: "meeting" },
    dayPicker(meeting),
    timeInputs(meeting),
    el("button", {
      class: "icon-btn", title: "Remove this time",
      onclick: () => { section.meetings = section.meetings.filter((m) => m !== meeting); changed(); renderCourses(); },
    }, "×"),
  );
}

function sectionRow(course, section) {
  const row = el("div", { class: "section" + (section.excluded ? " excluded" : "") },
    el("div", { class: "section-head" },
      el("select", { value: section.type, onchange: (e) => { section.type = e.target.value; changed(); } },
        SECTION_TYPES.map((type) => el("option", { value: type }, type))),
      el("input", { class: "label", value: section.label, placeholder: "101", oninput: (e) => { section.label = e.target.value; changed(); } }),
      termSelect(section),
      el("label", { class: "toggle", title: "Untick to never use this section" },
        el("input", {
          type: "checkbox", checked: !section.excluded,
          onchange: (e) => { section.excluded = !e.target.checked; row.classList.toggle("excluded", section.excluded); changed(); },
        }),
        "allowed"),
      el("button", {
        class: "icon-btn", title: "Delete section",
        onclick: () => { course.sections = course.sections.filter((s) => s !== section); changed(); renderCourses(); },
      }, "×"),
    ),
    section.meetings.map((meeting) => meetingRow(section, meeting)),
    el("button", {
      class: "link-btn",
      onclick: () => { section.meetings.push(newMeeting()); changed(); renderCourses(); },
    }, "+ add time"),
  );
  return row;
}

function courseCard(course) {
  const card = el("div", { class: "card" + (course.include ? "" : " off") },
    el("div", { class: "card-head" },
      el("span", { class: "swatch", style: `background: ${courseColor(course)}` }),
      el("input", { class: "code", value: course.code, placeholder: "CPSC 110", "aria-label": "Course code", oninput: (e) => { course.code = e.target.value; changed(); } }),
      el("input", { class: "name", value: course.name, placeholder: "Course name", "aria-label": "Course name", oninput: (e) => { course.name = e.target.value; changed(); } }),
      el("label", { class: "toggle" },
        el("input", { class: "credits", type: "number", min: 0, step: 0.5, value: course.credits, oninput: (e) => { course.credits = parseFloat(e.target.value) || 0; changed(); } }),
        "credits"),
      el("label", { class: "toggle" },
        el("input", {
          type: "checkbox", checked: course.include,
          onchange: (e) => { course.include = e.target.checked; card.classList.toggle("off", !course.include); changed(); },
        }),
        "include"),
      el("button", {
        class: "icon-btn", title: "Delete course",
        onclick: () => {
          if (!confirm(`Delete ${courseName(course)}?`)) return;
          data.courses = data.courses.filter((c) => c !== course);
          changed();
          renderCourses();
        },
      }, "×"),
    ),
    el("label", { class: "prereq" }, "prerequisites",
      el("input", { value: course.prereqs, placeholder: "e.g. MATH 100, CPSC 110", oninput: (e) => { course.prereqs = e.target.value; changed(); } })),
    el("div", { class: "sections" }, course.sections.map((section) => sectionRow(course, section))),
    el("button", {
      class: "add-btn small",
      onclick: () => { course.sections.push(newSection()); changed(); renderCourses(); },
    }, "+ add section"),
  );
  return card;
}

function busyRow(busy) {
  return el("div", { class: "busy" },
    el("input", { value: busy.label, placeholder: "What is it?", oninput: (e) => { busy.label = e.target.value; changed(); } }),
    termSelect(busy),
    dayPicker(busy),
    timeInputs(busy),
    el("button", {
      class: "icon-btn", title: "Delete busy time",
      onclick: () => { data.busy = data.busy.filter((b) => b !== busy); changed(); renderCourses(); },
    }, "×"),
  );
}

function renderCourses() {
  courseListEl.replaceChildren(
    ...(data.courses.length
      ? data.courses.map(courseCard)
      : [el("p", { class: "empty-note" }, "No courses yet. Add one below, or press load example to see how it works.")])
  );
  busyListEl.replaceChildren(...data.busy.map(busyRow));
}

// ---- Timetables tab ----

// A week calendar for one term of a timetable.
function weekCalendar(timetable, term) {
  const blocks = [];

  for (const { course, section } of timetable) {
    if (!termsOf(section.term).includes(term)) continue;
    for (const meeting of section.meetings.filter(isValidMeeting)) {
      for (const day of meeting.days) {
        blocks.push({
          day, start: toMinutes(meeting.start), end: toMinutes(meeting.end),
          color: courseColor(course), title: courseName(course), detail: `${section.type} ${section.label}`,
        });
      }
    }
  }
  if (blocks.length === 0) return el("p", { class: "nothing" }, `No classes in ${TERMS[term]}.`);

  for (const busy of data.busy) {
    if (!isValidMeeting(busy) || !termsOf(busy.term).includes(term)) continue;
    for (const day of busy.days) {
      blocks.push({ day, start: toMinutes(busy.start), end: toMinutes(busy.end), busy: true, title: busy.label || "Busy", detail: "" });
    }
  }

  // Show Mon-Fri, plus Saturday if something's on it, from 8am-5pm or wider.
  const days = DAYS.filter((day) => day !== "Sat" || blocks.some((block) => block.day === "Sat"));
  const firstHour = Math.min(8, Math.floor(Math.min(...blocks.map((b) => b.start)) / 60));
  const lastHour = Math.max(17, Math.ceil(Math.max(...blocks.map((b) => b.end)) / 60));
  const hours = lastHour - firstHour;

  const hourLabels = [];
  for (let hour = firstHour + 1; hour < lastHour; hour++) {
    hourLabels.push(el("span", { class: "hour", style: `top: ${(hour - firstHour) * HOUR_PX}px` }, formatTime(hour * 60).replace(":00", "")));
  }

  const columns = days.map((day) =>
    el("div", { class: "week-col" },
      blocks.filter((block) => block.day === day).map((block) =>
        el("div", {
          class: "block" + (block.busy ? " busy-block" : ""),
          style: `top: ${((block.start - firstHour * 60) / 60) * HOUR_PX}px; height: ${((block.end - block.start) / 60) * HOUR_PX}px;` + (block.busy ? "" : ` background: ${block.color};`),
          title: `${block.title} ${block.detail} · ${formatTime(block.start)}–${formatTime(block.end)}`,
        },
          el("strong", {}, block.title),
          block.detail, block.detail ? el("br") : null,
          formatRange(block.start, block.end))
      ))
  );

  return el("div", { class: "week-scroll" },
    el("div", { class: "week", style: `--days: ${days.length}; --hours: ${hours}; --hour-px: ${HOUR_PX}px` },
      el("div", { class: "week-corner" }),
      days.map((day) => el("div", { class: "week-day" }, day)),
      el("div", { class: "week-times" }, hourLabels),
      columns,
    ));
}

function renderTimetables() {
  refreshTimetables();
  const { timetables, messages, cutOff } = found;
  showing = Math.max(0, Math.min(showing, timetables.length - 1));

  ttMessagesEl.replaceChildren(...messages.map((text) => el("p", { class: "message" + (found.bad ? " bad" : "") }, text)));
  if (cutOff) {
    ttMessagesEl.append(el("p", { class: "message" }, `Found over ${MAX_TIMETABLES} timetables, so only the first ${MAX_TIMETABLES} are ranked. Untick some sections to narrow it down.`));
  }

  ttCountEl.textContent = timetables.length ? `${showing + 1} of ${timetables.length}${cutOff ? "+" : ""}` : "none";
  prevBtn.disabled = showing <= 0;
  nextBtn.disabled = showing >= timetables.length - 1;

  const current = timetables[showing];
  if (!current) {
    ttViewEl.replaceChildren();
    return;
  }

  const { picks, stats } = current;
  const warnings = prereqWarnings(picks);

  // The sections in this timetable, one row per course.
  const rows = [];
  for (const course of data.courses) {
    const mine = picks.filter((pick) => pick.course === course);
    if (mine.length === 0) continue;
    rows.push(el("tr", {},
      el("td", {}, el("span", { class: "swatch", style: `display: inline-block; margin-right: 6px; background: ${courseColor(course)}` }), el("strong", {}, courseName(course)), course.name && course.code ? ` ${course.name}` : ""),
      el("td", {}, mine.map((pick) => `${pick.section.type} ${pick.section.label}`).join(", ")),
      el("td", {}, TERMS[mine[0].section.term]),
      el("td", {}, course.credits),
    ));
  }

  ttViewEl.replaceChildren(
    ...(warnings.length ? [el("div", { class: "message bad" }, "Prerequisite problems:", el("ul", {}, warnings.map((w) => el("li", {}, w))))] : []),
    el("p", { class: "tt-stats" },
      `${formatDuration(stats.gaps)} of gaps · ${stats.days} days on campus · classes start around ${stats.days ? formatTime(stats.averageStart) : "–"} on average`),
    ...["T1", "T2"].map((term) =>
      el("div", { class: "term" },
        el("h3", {}, TERMS[term], el("span", {}, `${stats.credits[term]} credits`)),
        weekCalendar(picks, term))),
    el("table", { class: "picks" },
      el("thead", {}, el("tr", {}, el("th", {}, "Course"), el("th", {}, "Sections"), el("th", {}, "Term"), el("th", {}, "Credits"))),
      el("tbody", {}, rows)),
  );
}

// ---- Requirements tab ----

let requirementStatusUpdaters = [];

function requirementRow(req) {
  const status = el("span", { class: "status" });
  const row = el("div", { class: "req" });

  const onEdit = (update) => (e) => { update(e.target.value); changed(); updateRequirementStatuses(); };
  let fields;
  if (req.type === "credits") {
    fields = ["Plan at least", el("input", { type: "number", min: 0, step: 0.5, value: req.credits, style: "width: 70px", oninput: onEdit((v) => { req.credits = parseFloat(v) || 0; }) }), "credits"];
  } else if (req.type === "course") {
    fields = ["Take", el("input", { value: req.code, placeholder: "MATH 100", style: "width: 120px", oninput: onEdit((v) => { req.code = v; }) })];
  } else {
    fields = [
      "Take",
      el("input", { type: "number", min: 1, step: 1, value: req.count, style: "width: 56px", oninput: onEdit((v) => { req.count = parseInt(v, 10) || 1; }) }),
      "of",
      el("input", { class: "app-wide", value: req.codes, placeholder: "ENGL 110, ENGL 112, WRDS 150", oninput: onEdit((v) => { req.codes = v; }) }),
    ];
  }

  row.append(...fields, status, el("button", {
    class: "icon-btn", title: "Delete requirement",
    onclick: () => { data.requirements = data.requirements.filter((r) => r !== req); changed(); renderRequirements(); },
  }, "×"));

  // Remember how to refresh this row's status without rebuilding it (which
  // would kick you out of the box you're typing in).
  requirementStatusUpdaters.push(() => {
    const result = checkRequirement(req);
    status.textContent = (result.met ? "✓ " : "✗ ") + result.text;
    status.classList.toggle("ok", result.met);
    row.classList.toggle("met", result.met);
    return result.met;
  });
  return row;
}

function updateRequirementStatuses() {
  const met = requirementStatusUpdaters.filter((update) => update()).length;
  reqSummaryEl.textContent = data.requirements.length ? `${met} of ${data.requirements.length} met` : "";

  // Prerequisites of included courses that you haven't taken or planned.
  const done = completedCodes();
  const planned = plannedCodes();
  const problems = [];
  for (const course of data.courses.filter((c) => c.include)) {
    for (const prereq of listItems(course.prereqs)) {
      const code = sameCode(prereq);
      if (!done.has(code) && !planned.has(code)) problems.push(`${courseName(course)} needs ${prereq}.`);
    }
  }
  prereqListEl.replaceChildren(
    ...(problems.length
      ? problems.map((text) => el("p", { class: "prereq-item" }, "✗ ", text))
      : [el("p", { class: "muted" }, "✓ Every included course has its prerequisites taken or planned. The Timetables tab also checks they're in the right order.")])
  );
}

function renderRequirements() {
  completedEl.value = data.completed;
  requirementStatusUpdaters = [];
  reqListEl.replaceChildren(
    ...(data.requirements.length
      ? data.requirements.map(requirementRow)
      : [el("p", { class: "empty-note" }, "No requirements yet. Add the ones from your program below.")])
  );
  updateRequirementStatuses();
}

// ---- All tabs ----

function renderAll() {
  document.getElementById("sort-select").value = data.prefs.sort;
  document.getElementById("earliest-select").value = data.prefs.earliest;
  document.getElementById("latest-select").value = data.prefs.latest;
  renderCourses();
  renderRequirements();
  if (currentTab === "timetables") renderTimetables();
}

// ===========================================================================
// 7. Input
// ===========================================================================

function newMeeting() {
  return { id: uid(), days: [], start: "09:00", end: "10:00" };
}

function newSection() {
  return { id: uid(), type: "LEC", label: "", term: "T1", excluded: false, meetings: [newMeeting()] };
}

// Something was edited: save it, and search for timetables again next time.
function changed() {
  timetablesOutOfDate();
  save();
}

// Tabs
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    currentTab = tab.dataset.tab;
    for (const other of document.querySelectorAll(".tab")) other.classList.toggle("active", other === tab);
    for (const panel of document.querySelectorAll(".panel")) panel.hidden = panel.id !== `panel-${currentTab}`;
    if (currentTab === "timetables") renderTimetables();
    if (currentTab === "requirements") renderRequirements();
  });
}

document.getElementById("add-course").addEventListener("click", () => {
  data.courses.push({ id: uid(), code: "", name: "", credits: 3, include: true, prereqs: "", sections: [newSection()] });
  changed();
  renderCourses();
  courseListEl.lastElementChild.querySelector("input.code").focus();
});

document.getElementById("add-busy").addEventListener("click", () => {
  data.busy.push({ id: uid(), label: "", term: "Both", days: [], start: "17:00", end: "19:00" });
  changed();
  renderCourses();
});

// Timetable controls
function fillTimeSelect(select, from, to, anyLabel) {
  select.append(el("option", { value: "" }, anyLabel));
  for (let hour = from; hour <= to; hour++) {
    select.append(el("option", { value: `${String(hour).padStart(2, "0")}:00` }, formatTime(hour * 60)));
  }
}
fillTimeSelect(document.getElementById("earliest-select"), 7, 13, "any time");
fillTimeSelect(document.getElementById("latest-select"), 12, 22, "any time");

for (const [id, pref] of [["sort-select", "sort"], ["earliest-select", "earliest"], ["latest-select", "latest"]]) {
  document.getElementById(id).addEventListener("change", (e) => {
    data.prefs[pref] = e.target.value;
    changed();
    renderTimetables();
  });
}

prevBtn.addEventListener("click", () => { showing--; renderTimetables(); });
nextBtn.addEventListener("click", () => { showing++; renderTimetables(); });

// Left/right arrow keys flip through timetables (unless you're typing somewhere).
window.addEventListener("keydown", (e) => {
  const focused = document.activeElement;
  if (currentTab !== "timetables" || (focused && focused.closest("input, select, textarea"))) return;
  if (e.key === "ArrowLeft" && !prevBtn.disabled) prevBtn.click();
  if (e.key === "ArrowRight" && !nextBtn.disabled) nextBtn.click();
});

// Requirements
completedEl.addEventListener("input", () => {
  data.completed = completedEl.value;
  changed();
  updateRequirementStatuses();
});

for (const button of document.querySelectorAll("[data-add-req]")) {
  button.addEventListener("click", () => {
    const type = button.dataset.addReq;
    data.requirements.push({ id: uid(), type, credits: 30, code: "", count: 1, codes: "" });
    changed();
    renderRequirements();
  });
}

// Export: downloads everything as a .json file.
document.getElementById("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = el("a", { href: URL.createObjectURL(blob), download: "schedulr.json" });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// Import: reads a .json file from export.
document.getElementById("import-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = ""; // so picking the same file again still works
  if (!file) return;
  try {
    const imported = normalize(JSON.parse(await file.text()));
    if (!confirm(`Replace everything with ${imported.courses.length} courses from ${file.name}?`)) return;
    data = imported;
    changed();
    renderAll();
  } catch (error) {
    alert("That file couldn't be read. Is it a Schedulr export?");
  }
});

document.getElementById("example-btn").addEventListener("click", () => {
  if (data.courses.length && !confirm("Replace everything with the example?")) return;
  data = normalize(EXAMPLE);
  changed();
  renderAll();
});

document.getElementById("clear-btn").addEventListener("click", () => {
  if (!confirm("Delete all your courses, busy times and requirements?")) return;
  data = normalize({});
  changed();
  renderAll();
});

// ===========================================================================
// 8. Saving
// ===========================================================================

// Fills in anything missing, so old saves, imports and the example all end
// up in exactly the same shape.
function normalize(raw) {
  raw = raw || {};
  const text = (value) => (typeof value === "string" ? value : "");
  const days = (list) => DAYS.filter((day) => Array.isArray(list) && list.includes(day));
  const term = (value) => (TERMS[value] ? value : "T1");

  return {
    courses: (raw.courses || []).map((course) => ({
      id: course.id || uid(),
      code: text(course.code),
      name: text(course.name),
      credits: Number(course.credits) || 0,
      include: course.include !== false,
      prereqs: text(course.prereqs),
      sections: (course.sections || []).map((section) => ({
        id: section.id || uid(),
        type: SECTION_TYPES.includes(section.type) ? section.type : "LEC",
        label: text(section.label),
        term: term(section.term),
        excluded: Boolean(section.excluded),
        meetings: (section.meetings || []).map((meeting) => ({
          id: meeting.id || uid(), days: days(meeting.days), start: text(meeting.start), end: text(meeting.end),
        })),
      })),
    })),
    busy: (raw.busy || []).map((busy) => ({
      id: busy.id || uid(), label: text(busy.label), term: TERMS[busy.term] ? busy.term : "Both",
      days: days(busy.days), start: text(busy.start), end: text(busy.end),
    })),
    completed: text(raw.completed),
    requirements: (raw.requirements || [])
      .filter((req) => ["credits", "course", "choose"].includes(req.type))
      .map((req) => ({
        id: req.id || uid(), type: req.type,
        credits: Number(req.credits) || 0, code: text(req.code), count: Number(req.count) || 1, codes: text(req.codes),
      })),
    prefs: {
      sort: raw.prefs && ["gaps", "late", "days", "balance"].includes(raw.prefs.sort) ? raw.prefs.sort : "gaps",
      earliest: text(raw.prefs && raw.prefs.earliest),
      latest: text(raw.prefs && raw.prefs.latest),
    },
  };
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // saving can fail (e.g. private browsing) - use export to keep a copy
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    data = normalize(saved || EXAMPLE);
  } catch (e) {
    data = normalize(EXAMPLE);
  }
}

load();
renderAll();
