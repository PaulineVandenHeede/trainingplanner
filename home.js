// Home week cards and day detail rendering (extracted from app.js).
function dayActivityMatchLine(a, dayMatch, planKind) {
  const info = dayMatch?.byDatetime?.[a.datetime];
  if (!dayMatch?.trainable) {
    return `<div class="actual k-${a.cat}">${activityLine(a)}</div>`;
  }
  if (info) {
    const conf = info.confidence || "low";
    return `
      <div class="actual k-${a.cat} is-matched conf-${conf}">
        <span class="match-tag matched" title="${esc(matchConfidenceLabel(conf))}">${esc(tt("day.matched"))}</span>
        ${activityLine(a)}
      </div>`;
  }
  // Walks / e-bikes on non-matching days stay quiet — not a failed training match.
  if (a.cat === "walk" && !plannedSportCats(planKind).includes("walk")) {
    return `<div class="actual k-${a.cat}">${activityLine(a)}</div>`;
  }
  if (a.cat === "ebike" && !plannedSportCats(planKind).includes("ebike")) {
    return `<div class="actual k-${a.cat}">${activityLine(a)}</div>`;
  }
  return `
    <div class="actual k-${a.cat} is-unmatched">
      <span class="match-tag unmatched" title="${esc(tt("day.unmatchedHint"))}">${esc(tt("day.unmatched"))}</span>
      ${activityLine(a)}
    </div>`;
}

function dayRow(week, i, acts, now) {
  const [kind, rawLabel, km] = week.days[i];
  const label = fmtPlanLabel(rawLabel);
  const date = addDays(weekStart(week.wk), i);
  const ds = ymd(date);
  const dayActs = acts.filter((a) => a.date === ds);
  const isToday = ds === ymd(now);
  const isPast = date < now;
  const plan = { week, i, kind, label, km };
  const dayMatch = matchPlanDay(plan, dayActs);
  const wanted = plannedSportCats(kind);
  const done = dayMatch.done;
  // Agenda events own the day — don't let an older busy mark cover them.
  const hasAgendaEvent = typeof eventsOn === "function" && eventsOn(ds).length > 0;
  const busy = hasAgendaEvent ? null : BUSY[ds];
  let status = "";
  if (done) {
    const conf = dayMatch.match?.confidence || "low";
    const title = `${tt("day.done")} · ${matchConfidenceLabel(conf)}`;
    status = `<span class="status done conf-${conf}" title="${esc(title)}">✓</span>`;
  } else if (isPast && wanted.length && !busy) {
    status = `<span class="status missed" title="${esc(tt("day.notLogged"))}">–</span>`;
  }
  const hint = dayActs.length ? tt("day.viewActivity") : isPast ? tt("day.viewSession") : tt("day.howTo");
  const rec = isToday ? recoveryFor(ds) : null;
  const recoveryChip = rec
    ? `<span class="recovery-chip lvl-${rec.band}" title="${esc(tt("day.recovery"))} · ${esc(typeof recoveryDayLabel === "function" ? recoveryDayLabel(rec.band) : rec.band)} ${rec.score}">${esc(typeof recoveryActionLabel === "function" ? recoveryActionLabel(rec.band) : rec.score)}</span>`
    : "";
  return `
    <li class="day clickable ${isToday ? "today" : ""} ${isPast ? "past" : ""} ${busy ? "busy" : ""} ${done ? "is-matched" : dayActs.length && wanted.length ? "has-unmatched" : ""}" data-date="${ds}" tabindex="0" role="button" title="${esc(hint)}">
      <div class="day-date"><strong>${DAY_NAMES()[i]}</strong><span>${short(date)}</span></div>
      <div class="day-body">
        ${busy ? `<div class="busy-line"><span class="chip k-busy">${tt("common.busy")}</span>${busy.reason ? esc(busy.reason) : tt("day.noTraining")}</div>` : ""}
        <div class="session"><span class="chip k-${kind}">${KIND_LABEL(kind)}</span><span class="label">${label}</span>${recoveryChip}${status}</div>
        ${eventLines(week, i, ds)}
        ${dayActs.map((a) => dayActivityMatchLine(a, dayMatch, kind)).join("")}
      </div>
      <span class="day-open" aria-hidden="true">›</span>
    </li>`;
}

function loggedDayRow(i, start, acts, now) {
  const date = addDays(start, i);
  const ds = ymd(date);
  const dayActs = acts.filter((a) => a.date === ds);
  const isToday = ds === ymd(now);
  const isPast = date < now;
  const sessions = dayActs.length
    ? dayActs.map((a) => `
        <div class="session"><span class="chip k-${a.cat}">${KIND_LABEL(a.cat) || a.cat}</span><span class="label">${esc(a.title || activityLine(a))}</span></div>
        <div class="actual k-${a.cat}">${activityLine(a)}</div>
        <p class="auto-text">${esc(activityFeedback(a, null, acts))}</p>`).join("")
    : `<div class="session"><span class="chip k-rest">${KIND_LABEL("rest")}</span><span class="label">${isPast ? tt("day.nothingLogged") : tt("day.noSessionYet")}</span></div>`;
  return `
    <li class="day clickable ${isToday ? "today" : ""} ${isPast ? "past" : ""}" data-date="${ds}" tabindex="0" role="button" title="${esc(dayActs.length ? tt("day.viewActivity") : tt("day.viewDay"))}">
      <div class="day-date"><strong>${DAY_NAMES()[i]}</strong><span>${short(date)}</span></div>
      <div class="day-body">${sessions}</div>
      <span class="day-open" aria-hidden="true">›</span>
    </li>`;
}


function renderDayDetail(ds) {
  const plan = planFor(ds);
  const date = parseDate(ds);
  const allDayActs = ACTS.filter((a) => a.date === ds);
  const dayActs = allDayActs.filter((a) => a.cat !== "walk" && a.cat !== "ebike");
  const walks = allDayActs.filter((a) => a.cat === "walk");
  const ebikes = allDayActs.filter((a) => a.cat === "ebike");
  const dayMatch = matchPlanDay(plan, allDayActs);
  const evs = eventsOn(ds);
  const title = plan ? plan.label : hasPlan() ? "Outside the plan" : (dayActs[0]?.title || "Logged day");

  const activityMeta = (a, label, matchInfo) => {
    const time = a.datetime.slice(11, 16);
    let matchChip = "";
    if (dayMatch.trainable) {
      if (matchInfo) {
        matchChip = `<span class="match-tag matched conf-${matchInfo.confidence}" title="${esc(matchConfidenceLabel(matchInfo.confidence))}">${esc(tt("day.matched"))}</span>`;
      } else if (
        (a.cat !== "walk" || plannedSportCats(plan?.kind).includes("walk"))
        && (a.cat !== "ebike" || plannedSportCats(plan?.kind).includes("ebike"))
      ) {
        matchChip = `<span class="match-tag unmatched" title="${esc(tt("day.unmatchedHint"))}">${esc(tt("day.unmatched"))}</span>`;
      }
    }
    return `
      <div class="activity-head">
        <h3>${esc(label)}${matchChip ? ` ${matchChip}` : ""}</h3>
        <div class="activity-meta">
          <span class="muted">${time}${isManualActivity(a) ? " · logged here" : ""}</span>
          ${stravaViewLink(a)}
          <button class="icon-button" type="button" data-action="delete-activity" data-started="${esc(a.datetime)}" data-type="${esc(a.raw["Activity Type"] || "")}" data-date="${esc(a.date)}" aria-label="Remove session">✕</button>
        </div>
      </div>`;
  };

  const activities = dayActs.map((a) => {
    const note = FEEDBACK.activities[a.datetime];
    const matchInfo = dayMatch.byDatetime[a.datetime] || null;
    const feedbackPlan = matchInfo ? plan : null;
    return `
      <section class="activity k-${a.cat} ${matchInfo ? `is-matched conf-${matchInfo.confidence}` : dayMatch.trainable ? "is-unmatched" : ""}">
        ${activityMeta(a, a.title || activityLine(a), matchInfo)}
        <div class="feedback">
          ${note ? `<p class="coach-text">${esc(note)}</p>` : ""}
          <p class="auto-text">${esc(activityFeedback(a, feedbackPlan, ACTS))}</p>
        </div>
        ${gearPicker(a)}
        ${statGrid(a)}
      </section>`;
  }).join("");

  const walkBlocks = walks.map((a) => {
    const matchInfo = dayMatch.byDatetime[a.datetime] || null;
    return `
      <section class="activity k-walk ${matchInfo ? "is-matched" : ""}">
        ${activityMeta(a, `Walk · ${fmtDistWithUnit(a.dist)}`, matchInfo)}
        ${gearPicker(a)}
      </section>`;
  }).join("");

  const ebikeBlocks = ebikes.map((a) => {
    const matchInfo = dayMatch.byDatetime[a.datetime] || null;
    return `
      <section class="activity k-ebike ${matchInfo ? "is-matched" : ""}">
        ${activityMeta(a, a.title || `E-bike · ${fmtDistWithUnit(a.dist)}`, matchInfo)}
        ${gearPicker(a)}
        ${statGrid(a)}
      </section>`;
  }).join("");

  const guides = plan ? guidesFor(plan.kind, plan.label) : [];
  const showGuidesOpen = !dayActs.length;
  const quietExtra = (a) => a.cat === "walk" || a.cat === "ebike";
  const matchSummary = dayMatch.trainable && dayMatch.done
    ? `<p class="match-summary conf-${dayMatch.match?.confidence || "low"}"><span class="match-tag matched">${esc(tt("day.matched"))}</span> ${esc(matchConfidenceLabel(dayMatch.match?.confidence))}${dayMatch.unmatched.some((a) => !quietExtra(a)) ? ` · ${esc(tt("day.extraLogged"))}` : ""}</p>`
    : dayMatch.trainable && allDayActs.some((a) => !quietExtra(a))
      ? `<p class="match-summary is-unmatched"><span class="match-tag unmatched">${esc(tt("day.unmatched"))}</span> ${esc(tt("day.noPlanMatch"))}</p>`
      : "";

  return `
    <header class="dialog-head">
      <div>
        <div class="eyebrow">${fmt(date, { weekday: "long", day: "numeric", month: "long" })}${plan ? ` · Week ${plan.week.wk} · ${plan.week.phase}` : ""}</div>
        <h2>${plan ? `<span class="chip k-${plan.kind}">${KIND_LABEL(plan.kind)}</span> ` : ""}${esc(title)}</h2>
        ${matchSummary}
      </div>
      <button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">✕</button>
    </header>
    ${recoveryBlock(ds, plan)}
    ${evs.map((ev) => eventDetailBlock(ev)).join("")}
    ${plan?.week?.focus === "Race week" || /bag check|t2|race week/i.test(plan?.label || "")
      ? raceWeekChecklistCard(parseDate(ds))
      : ""}
    ${plan ? busyBlock(plan, ds) : ""}
    ${plan ? paceGraph(plan) : ""}
    ${activities}
    ${walkBlocks}
    ${ebikeBlocks}
    ${currentRoute() === "activities" ? "" : logSessionForm(ds, plan, allDayActs)}
    ${guides.length ? `
      <details class="guides" ${showGuidesOpen ? "open" : ""}>
        <summary>${dayActs.length ? "About the planned session" : "How to do this session"}</summary>
        ${guides.map(guideBlock).join("")}
      </details>` : ""}
  `;
}

function isEventDay(plan, ds) {
  return plan?.kind === "event" || plan?.kind === "race" || eventsOn(ds).length > 0;
}

function busyBlock(plan, ds) {
  // Event windows replace busy marks — no busy UI on agenda event days.
  if (typeof eventsOn === "function" && eventsOn(ds).length) return "";
  const busy = BUSY[ds];
  if (busy) {
    return `
      <section class="busy-box">
        <div><strong>Marked as busy</strong>${busy.reason ? ` · ${esc(busy.reason)}` : ""}</div>
        <p>${esc(busySuggestion(plan.week, plan.i))}</p>
        <p class="muted small-text">Added to the plan changes on the Full plan page, so the AI coach can rework this week.</p>
        <button class="button ghost small" type="button" data-action="unbusy" data-date="${ds}">Unmark: I can train after all</button>
      </section>`;
  }
  if (parseDate(ds) < today() || isEventDay(plan, ds)) return "";
  return `
    <form class="busy-form" data-date="${ds}">
      <input type="text" name="reason" maxlength="140" placeholder="Something on? e.g. dinner, work trip, family day" />
      <button class="button ghost small" type="submit">Mark as busy day</button>
    </form>`;
}

function eventDay(ev) {
  return String(ev?.date || "").slice(0, 10);
}
window.eventDay = eventDay;

function openDay(ds) {
  const day = String(ds || "").slice(0, 10);
  const dialog = document.getElementById("day-dialog");
  if (!day || !dialog) return;
  try {
    if (hasPlan()) {
      const wk = weekOf(parseDate(day));
      if (wk >= 1 && wk <= WEEKS.length) {
        rememberPlanWeek(wk);
        if (currentRoute() === "plan") syncPlanWeekPath(wk);
      }
    }
    dialog.innerHTML = `<div class="dialog-body">${renderDayDetail(day)}</div>`;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  } catch (err) {
    toast(err.message || "Could not open that day.", true);
  }
}

function hasSportTarget(week, key) {
  const val = week?.[key];
  return !!(val && val !== "—");
}

function extraSportTargets(week) {
  return [
    hasSportTarget(week, "swim") ? `<div><span>Swim</span><strong>${week.swim}</strong></div>` : "",
    hasSportTarget(week, "bike") ? `<div><span>Bike</span><strong>${week.bike}</strong></div>` : "",
  ].join("");
}

function weekCard(week, acts, now, title, opts = {}) {
  const s = weekStart(week.wk), e = addDays(s, 6);
  const actual = weekRunKm(week, acts);
  const showActual = s <= now;
  const pct = Math.min(100, Math.round((actual / week.km) * 100));
  const hideNote = !!opts.hideNote;
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <div class="eyebrow">${title}</div>
          <h2>${short(s)} – ${short(e)}</h2>
        </div>
        <span class="pill p-${week.phase}">${week.phase}</span>
      </div>
      <div class="targets">
        <div><span>${tt("home.targetRun")}</span><strong>${fmtDistWithUnit(week.km, 0)}</strong></div>
        <div><span>${tt("home.targetLong")}</span><strong>${fmtDistWithUnit(week.long, 0)}</strong></div>
        ${extraSportTargets(week)}
      </div>
      ${showActual ? `
        <div class="progress">
          <div class="progress-label">${tt("home.loggedRun", { unit: distUnit() })} <strong>${fmtDist(actual, 1)}</strong> / ${fmtDist(week.km, 0)}</div>
          <div class="bar"><div style="width:${pct}%"></div></div>
        </div>` : ""}
      ${!hideNote && week.note ? `<p class="note">${week.note}</p>` : ""}
      <ul class="days">${week.days.map((_, i) => dayRow(week, i, acts, now)).join("")}</ul>
    </section>`;
}

function loggedWeekBlock(acts, now) {
  const start = mondayOf(now);
  const end = addDays(start, 6);
  const weekActs = acts.filter((a) => a.date >= ymd(start) && a.date <= ymd(end));
  const runs = weekActs.filter((a) => a.cat === "run");
  const km = runs.reduce((s, a) => s + (a.dist || 0), 0);
  const summary = typeof loggedWeekFeedback === "function" ? loggedWeekFeedback(acts, now) : "";
  return `
    <section class="card review">
      <div class="card-head">
        <div>
          <div class="eyebrow">${tt("home.thisWeekReview")}</div>
          <h2>${short(start)} – ${short(end)}</h2>
        </div>
      </div>
      <p class="auto-text">${esc(summary)}</p>
    </section>
    <section class="card">
      <div class="card-head">
        <div>
          <div class="eyebrow">This week</div>
          <h2>${weekActs.length ? `${fmtDistWithUnit(km, 1)} from ${runs.length} run${runs.length === 1 ? "" : "s"}` : "No sessions logged yet"}</h2>
        </div>
      </div>
      <ul class="days">${[0, 1, 2, 3, 4, 5, 6].map((i) => loggedDayRow(i, start, acts, now)).join("")}</ul>
    </section>`;
}

let HOME_WEEK = null;
let HOME_ZONE = null;

function homeZone() {
  if (HOME_ZONE === "today" || HOME_ZONE === "week") return HOME_ZONE;
  try {
    const saved = sessionStorage.getItem("tp-home-zone");
    if (saved === "today" || saved === "week") {
      HOME_ZONE = saved;
      return HOME_ZONE;
    }
  } catch {
    // sessionStorage may be unavailable.
  }
  HOME_ZONE = "today";
  return HOME_ZONE;
}

function setHomeZone(zone) {
  HOME_ZONE = zone === "week" ? "week" : "today";
  try {
    sessionStorage.setItem("tp-home-zone", HOME_ZONE);
  } catch {
    // Ignore persistence failures.
  }
}

function homeZoneToggle(active) {
  return `
    <div class="home-zone-toggle" role="tablist" aria-label="${esc(tt("home.zoneToggleAria"))}">
      <button class="home-zone-btn${active === "today" ? " active" : ""}" type="button" role="tab" aria-selected="${active === "today" ? "true" : "false"}" data-action="home-zone" data-zone="today">${esc(tt("home.zoneToday"))}</button>
      <button class="home-zone-btn${active === "week" ? " active" : ""}" type="button" role="tab" aria-selected="${active === "week" ? "true" : "false"}" data-action="home-zone" data-zone="week">${esc(tt("home.zoneWeek"))}</button>
    </div>`;
}

function calendarPlanWeek(now) {
  return Math.max(1, Math.min(WEEKS.length, weekOf(now)));
}

function homeViewWeek(now) {
  const cur = calendarPlanWeek(now);
  const wk = HOME_WEEK == null ? cur : HOME_WEEK;
  return Math.max(1, Math.min(WEEKS.length, wk));
}

function homeWeekCardTitle(viewWk, calendarWk, offset) {
  const wk = viewWk + offset;
  if (wk === calendarWk) return tt("home.thisWeek");
  if (wk === calendarWk + 1) return tt("home.nextWeekLabel");
  if (wk === calendarWk - 1) return tt("home.lastWeek");
  return offset === 0 ? tt("home.selectedWeek") : tt("home.followingWeek");
}

function todayGuideTargets(plan) {
  if (!plan || typeof guidesFor !== "function") return [];
  const guides = guidesFor(plan.kind, plan.label) || [];
  const primary = guides[0];
  return primary?.targets || [];
}

function todayEffortText(plan, targets) {
  const rows = targets || todayGuideTargets(plan);
  const effort = rows.find(([k]) => /effort|rpe|power/i.test(k));
  if (effort) return effort[1];
  if (!plan) return "";
  if (plan.kind === "brick") return tt("home.todayEffortBrick");
  if (plan.kind === "quality" || plan.kind === "race") return tt("home.todayEffortQuality");
  if (plan.kind === "long" || plan.kind === "event") return tt("home.todayEffortLong");
  if (["rest", "travel", "walk"].includes(plan.kind)) return tt("home.todayEffortRest");
  return tt("home.todayEffortEasy");
}

function todayTargetText(plan, targets) {
  if (!plan) return "";
  const rows = targets || todayGuideTargets(plan);
  const paceLike = rows.find(([k]) => /pace|mp|cruise|steady|reps|cadence|goal|solid|power|bike|run|t2/i.test(k));
  const dist = plan.km > 0 ? fmtDistWithUnit(plan.km, plan.km % 1 ? 1 : 0) : "";
  if (plan.kind === "brick") return paceLike?.[1] || plan.label || tt("home.todayTargetBrick");
  if (dist && paceLike) return `${dist} · ${paceLike[1]}`;
  if (paceLike) return paceLike[1];
  if (dist) return dist;
  return plan.label || "";
}

function todayPreferredShoeKind(targets) {
  const shoes = (targets || []).find(([k]) => /shoe|kit|equipment/i.test(k));
  const hint = String(shoes?.[1] || "").toLowerCase();
  if (/race|super/.test(hint)) return "race";
  if (/faster|tempo|performance|quality|mp/.test(hint)) return "tempo";
  if (/trail/.test(hint)) return "trail";
  if (/daily|trainer|easy/.test(hint)) return "daily";
  if (/kettle|dumbbell|band|gym|bodyweight|stair|wall|pillow|equipment/.test(hint)) return "strength";
  return shoes ? "daily" : null;
}

function todayPickShoe(items, preferred = "daily") {
  const pool = items.filter((g) => g.type === "shoes");
  if (!pool.length) return null;
  if (preferred && preferred !== "strength") {
    return pool.find((g) => g.shoeKind === preferred)
      || (preferred === "tempo" ? pool.find((g) => g.shoeKind === "race") : null)
      || (preferred === "race" ? pool.find((g) => g.shoeKind === "tempo") : null)
      || pool.find((g) => g.shoeKind === "daily")
      || pool[0];
  }
  return pool.find((g) => g.shoeKind === "daily") || pool[0];
}

function todayPickSwim(items, label = "") {
  const type = /wet/i.test(label) ? "wetsuit" : "swimsuit";
  return items.find((g) => g.type === type)
    || items.find((g) => g.type === "swimsuit" || g.type === "wetsuit")
    || null;
}

function todayGearText(plan, targets) {
  if (!plan) return "";
  const rows = targets || todayGuideTargets(plan);
  let preferred = todayPreferredShoeKind(rows);
  const items = (typeof GEAR !== "undefined" && Array.isArray(GEAR.items)) ? GEAR.items.filter((g) => !g.retired) : [];
  const label = String(plan.label || "");
  const wantTypes = plannedSportCats(plan.kind);
  const wantsSwim = plan.kind === "walkswim" || wantTypes.includes("swim") || /swim/i.test(label);
  const wantsWalk = plan.kind === "walk" || plan.kind === "walkswim" || wantTypes.includes("walk") || /walk/i.test(label);

  if (plan.kind === "strength" || preferred === "strength") {
    if (typeof strengthGearAdvice === "function") {
      const advice = strengthGearAdvice();
      if (advice) return advice.replace(/^Uses your gear:\s*/i, "").replace(/\.$/, "") || advice;
    }
    const guideGear = rows.find(([k]) => /equipment|kit/i.test(k));
    return guideGear?.[1] || tt("home.todayGearBodyweight");
  }

  if (plan.kind === "brick") {
    const bike = items.find((g) => g.type === "bike");
    const shoes = todayPickShoe(items, preferred || "daily");
    if (bike || shoes) return [bike?.name, shoes?.name].filter(Boolean).join(" · ");
    return tt("home.todayGearBrick");
  }

  // Walk + swim (kind or label) should not pick race/tempo run shoes alone.
  if (wantsSwim && wantsWalk) {
    const shoes = todayPickShoe(items, "daily");
    const swim = todayPickSwim(items, label);
    const parts = [shoes?.name, swim?.name].filter(Boolean);
    if (parts.length) return parts.join(" · ");
    const guideGear = rows.find(([k]) => /shoe|kit|equipment|swim/i.test(k));
    return guideGear?.[1] || tt("home.todayGearWalkSwim");
  }

  if (plan.kind === "walk" || (wantTypes.includes("walk") && !wantTypes.includes("run"))) {
    preferred = preferred || "daily";
    const shoes = todayPickShoe(items, preferred);
    if (shoes) return shoes.name;
    const guideGear = rows.find(([k]) => /shoe|kit|equipment/i.test(k));
    return guideGear?.[1] || tt("home.todayGearNone");
  }

  let type = "shoes";
  if (wantTypes.includes("bike") && !wantTypes.includes("run")) type = "bike";
  else if (wantsSwim) type = /wet/i.test(label) ? "wetsuit" : "swimsuit";
  else if (!wantTypes.includes("run") && !wantTypes.includes("walk")) {
    const guideGear = rows.find(([k]) => /shoe|kit|equipment/i.test(k));
    return guideGear?.[1] || "";
  }

  if (type === "shoes") {
    const shoes = todayPickShoe(items, preferred || "daily");
    if (shoes) return shoes.name;
    const guideGear = rows.find(([k]) => /shoe|kit|equipment/i.test(k));
    return guideGear?.[1] || tt("home.todayGearNone");
  }

  const pool = items.filter((g) => g.type === type);
  if (!pool.length) {
    const guideGear = rows.find(([k]) => /shoe|kit|equipment|swim/i.test(k));
    return guideGear?.[1] || tt("home.todayGearNone");
  }
  return pool[0].name;
}

function todayMoveCandidates(plan) {
  if (!plan || typeof freeDaysInWeek !== "function") return [];
  const free = freeDaysInWeek(plan.week, plan.i);
  if (!free.length) return [];
  const longIdx = plan.week.days.findIndex(([k], j) => j !== plan.i && ["long", "event", "race", "brick"].includes(k));
  const notNextToLong = free.filter((d) => longIdx === -1 || Math.abs(d.i - longIdx) > 1);
  let order = free;
  if (plan.kind === "long" || plan.kind === "event" || plan.kind === "brick") {
    order = [6, 4, 5, 3, 0, 2, 1].map((j) => free.find((d) => d.i === j)).filter(Boolean);
  } else if (plan.kind === "quality") {
    order = (notNextToLong.length ? notNextToLong : free).slice();
  }
  return order.slice(0, 4);
}

function raceWeekChecklistCard(now) {
  const list = typeof window.raceWeekChecklist === "function" ? window.raceWeekChecklist(now) : null;
  if (!list?.items?.length) return "";
  const when = list.daysLeft === 0
    ? tt("home.raceWeekToday")
    : list.daysLeft === 1
      ? tt("home.raceWeekTomorrow")
      : tt("home.raceWeekIn", { days: list.daysLeft });
  return `
    <section class="card race-checklist">
      <div class="card-head">
        <div>
          <div class="eyebrow">${esc(tt("home.raceWeekEyebrow"))}</div>
          <h2>${esc(list.eventName)}</h2>
          <p class="muted small-text">${esc(when)}</p>
        </div>
      </div>
      <ul class="checklist">
        ${list.items.map((item) => `<li>${esc(item.text)}</li>`).join("")}
      </ul>
    </section>`;
}

function todaySessionMeta(plan) {
  if (!plan) return null;
  const targets = todayGuideTargets(plan);
  const effort = todayEffortText(plan, targets);
  const target = todayTargetText(plan, targets);
  const gear = todayGearText(plan, targets);
  if (!effort && !target && !gear) return null;
  return { effort, target, gear };
}

function todayActionsHtml(plan, ds, statusClass) {
  if (statusClass === "busy") {
    return `
      <div class="today-actions">
        <button class="button ghost small" type="button" data-action="unbusy" data-date="${esc(ds)}">${esc(tt("home.todayUnbusy"))}</button>
        <button class="button ghost small" type="button" data-action="today-ask-toggle" aria-expanded="false">${esc(tt("home.todayAsk"))}</button>
      </div>
      <div class="today-panel" data-today-panel="ask" hidden>
        <form class="today-ask-form" data-date="${esc(ds)}">
          <input type="text" name="text" maxlength="280" required placeholder="${esc(tt("home.todayAskPlaceholder"))}" />
          <button class="button small" type="submit">${esc(tt("home.todayAskSend"))}</button>
        </form>
      </div>`;
  }

  const trainable = !!(plan && plannedSportCats(plan.kind).length && statusClass !== "done");
  const canMove = trainable && todayMoveCandidates(plan).length > 0;
  const canBusy = trainable;
  const canIcs = !!(plan && plan.kind !== "rest");

  if (!canBusy && !canMove && !canIcs && statusClass === "free") return "";

  const movePanel = canMove
    ? `<div class="today-panel" data-today-panel="move" hidden>
        <p class="muted small-text">${esc(tt("home.todayMoveHint"))}</p>
        <div class="today-move-days">
          ${todayMoveCandidates(plan).map((d) => `
            <button class="button ghost small" type="button" data-action="today-move" data-from="${esc(ds)}" data-to="${esc(d.ds)}">
              ${esc(DAY_NAMES()[d.i])} ${esc(short(parseDate(d.ds)))}
            </button>`).join("")}
        </div>
      </div>`
    : "";

  return `
    <div class="today-actions">
      ${canBusy ? `<button class="button ghost small" type="button" data-action="today-busy" data-date="${esc(ds)}">${esc(tt("common.busy"))}</button>` : ""}
      ${canMove ? `<button class="button ghost small" type="button" data-action="today-move-toggle" aria-expanded="false">${esc(tt("home.todayMove"))}</button>` : ""}
      <button class="button ghost small" type="button" data-action="today-ask-toggle" aria-expanded="false">${esc(tt("home.todayAsk"))}</button>
      ${canIcs ? `<button class="button ghost small" type="button" data-action="today-ics" data-date="${esc(ds)}">${esc(tt("home.todayCalendar"))}</button>` : ""}
    </div>
    ${movePanel}
    <div class="today-panel" data-today-panel="ask" hidden>
      <form class="today-ask-form" data-date="${esc(ds)}">
        <input type="text" name="text" maxlength="280" required placeholder="${esc(tt("home.todayAskPlaceholder"))}" />
        <button class="button small" type="submit">${esc(tt("home.todayAskSend"))}</button>
      </form>
    </div>`;
}

function todaySessionCard(acts, now) {
  const ds = ymd(now);
  const plan = planFor(ds);
  const dayActs = (acts || []).filter((a) => a.date === ds);
  const busy = BUSY[ds];
  const dayMatch = plan ? matchPlanDay(plan, dayActs) : null;
  const meta = !busy ? todaySessionMeta(plan) : null;

  let statusLine = tt("home.todayOpen");
  let statusClass = "pending";
  if (busy) {
    statusLine = busy.reason ? esc(busy.reason) : tt("day.noTraining");
    statusClass = "busy";
  } else if (dayMatch?.done) {
    statusLine = matchConfidenceLabel(dayMatch.match?.confidence);
    statusClass = "done";
  } else if (dayMatch?.partial && plan?.kind === "brick") {
    statusLine = tt("home.todayBrickPartial");
    statusClass = "todo";
  } else if (plan && plannedSportCats(plan.kind).length) {
    statusLine = tt("home.todayTodo");
    statusClass = "todo";
  } else if (dayActs.length) {
    statusLine = tt("home.todayLogged");
    statusClass = "done";
  } else if (!plan) {
    statusLine = tt("home.todayFree");
    statusClass = "free";
  }

  const title = busy
    ? tt("common.busy")
    : plan
      ? plan.label
      : dayActs[0]?.title || tt("home.todayFree");
  const chip = busy
    ? `<span class="chip k-busy">${tt("common.busy")}</span>`
    : plan
      ? `<span class="chip k-${plan.kind}">${KIND_LABEL(plan.kind)}</span>`
      : dayActs[0]
        ? `<span class="chip k-${dayActs[0].cat}">${KIND_LABEL(dayActs[0].cat) || dayActs[0].cat}</span>`
        : `<span class="chip k-rest">${KIND_LABEL("rest")}</span>`;

  const logged = dayActs.length
    ? dayActs.slice(0, 2).map((a) => dayActivityMatchLine(a, dayMatch || { trainable: false }, plan?.kind)).join("")
    : "";

  const metaHtml = meta
    ? `<div class="today-meta">
        ${meta.effort ? `<div><span>${esc(tt("plan.effort"))}</span><strong>${esc(meta.effort)}</strong></div>` : ""}
        ${meta.target ? `<div><span>${esc(tt("home.todayTarget"))}</span><strong>${esc(meta.target)}</strong></div>` : ""}
        ${meta.gear ? `<div><span>${esc(tt("home.todayGear"))}</span><strong>${esc(meta.gear)}</strong></div>` : ""}
      </div>`
    : "";

  return `
    <section class="today-card status-${statusClass}">
      <button class="today-card-hit" type="button" data-action="open-day" data-date="${esc(ds)}" aria-label="${esc(tt("home.todayOpenAria", { title }))}">
        <div class="today-card-top">
          <div class="eyebrow">${esc(tt("home.todayFocus"))}</div>
        </div>
        <div class="today-card-main">
          <div>
            <h2>${chip} <span class="today-title">${esc(title)}</span></h2>
            <p class="today-status">${statusLine}</p>
          </div>
          <span class="today-open" aria-hidden="true">›</span>
        </div>
      </button>
      ${metaHtml}
      ${logged ? `<div class="today-logged">${logged}</div>` : ""}
      ${todayActionsHtml(plan, ds, statusClass)}
    </section>`;
}

function recoveryHomeCard(now) {
  const ds = ymd(now);
  const plan = planFor(ds);
  const rec = typeof recoveryFor === "function" ? recoveryFor(ds) : null;
  const block = typeof recoveryBlock === "function" ? recoveryBlock(ds, plan) : "";
  if (!block) return "";
  if (!rec) {
    return `<section class="card recovery-home recovery-empty-home">${block}</section>`;
  }
  const band = rec.band;
  const dayLabel = typeof recoveryDayLabel === "function" ? recoveryDayLabel(band) : band;
  return `
    <section class="card recovery-home recovery-collapsible lvl-${band}" data-band="${band}">
      <button class="recovery-circle-btn" type="button" data-action="toggle-recovery" aria-expanded="false" aria-controls="recovery-panel">
        <span class="recovery-circle lvl-${band}" aria-hidden="true">${esc(String(rec.score))}</span>
        <span class="recovery-circle-copy">
          <strong>${esc(dayLabel)}</strong>
          <span class="muted small-text">${esc(tt("home.recoveryTap"))}</span>
        </span>
      </button>
      <div class="recovery-panel" id="recovery-panel">${block}</div>
    </section>`;
}

function toggleRecoveryPanel() {
  const card = document.querySelector(".recovery-collapsible");
  if (!card) return;
  const open = !card.classList.contains("is-open");
  card.classList.toggle("is-open", open);
  const btn = card.querySelector("[data-action=toggle-recovery]");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function toggleTodayPanel(name) {
  const card = document.querySelector(".today-card");
  if (!card) return;
  card.querySelectorAll("[data-today-panel]").forEach((panel) => {
    const on = panel.dataset.todayPanel === name && panel.hasAttribute("hidden");
    panel.toggleAttribute("hidden", !on);
  });
  card.querySelectorAll("[data-action=today-move-toggle], [data-action=today-ask-toggle]").forEach((btn) => {
    const panelName = btn.dataset.action === "today-move-toggle" ? "move" : "ask";
    const panel = card.querySelector(`[data-today-panel="${panelName}"]`);
    btn.setAttribute("aria-expanded", panel && !panel.hidden ? "true" : "false");
  });
  if (name === "ask") {
    const input = card.querySelector('.today-ask-form input[name="text"]');
    if (input && !card.querySelector('[data-today-panel="ask"]')?.hidden) input.focus();
  }
}

async function moveTodaySession(fromDs, toDs) {
  if (!CURRENT_USER_ID || !hasPlan()) throw new Error(tt("home.todayMoveNeedPlan"));
  const from = planFor(fromDs);
  const to = planFor(toDs);
  if (!from || !to) throw new Error(tt("home.todayMoveMissing"));
  if (from.week.wk !== to.week.wk) throw new Error(tt("home.todayMoveSameWeek"));
  if (from.i === to.i) return;

  const weeks = WEEKS.map((w) => ({ ...w, days: (w.days || []).map((d) => (Array.isArray(d) ? d.slice() : d)) }));
  const idx = weeks.findIndex((w) => Number(w.wk) === Number(from.week.wk));
  if (idx < 0) throw new Error(tt("home.todayMoveMissing"));
  const days = weeks[idx].days;
  const tmp = days[from.i];
  days[from.i] = days[to.i];
  days[to.i] = tmp;
  weeks[idx] = { ...weeks[idx], days };

  const { error } = await sb.from("plans").update({ weeks }).eq("user_id", CURRENT_USER_ID);
  if (error) throw error;
  window.WEEKS = weeks;
  if (window.CURRENT_PLAN) window.CURRENT_PLAN.weeks = weeks;

  const summary = `Moved “${from.label}” from ${fromDs} to ${toDs}`;
  try {
    await apiRequest("POST", "/api/changes", { text: summary });
  } catch {
    // Plan already moved; history note is best-effort.
  }
}

function downloadTodayIcs(ds) {
  const day = String(ds || ymd(today())).slice(0, 10);
  const plan = planFor(day);
  const busy = BUSY[day];
  const meta = !busy ? todaySessionMeta(plan) : null;
  const title = busy
    ? tt("common.busy")
    : plan
      ? plan.label
      : tt("home.todayFree");
  const lines = [
    plan ? `${KIND_LABEL(plan.kind)} · ${plan.label}` : title,
    meta?.effort ? `${tt("plan.effort")}: ${meta.effort}` : "",
    meta?.target ? `${tt("home.todayTarget")}: ${meta.target}` : "",
    meta?.gear ? `${tt("home.todayGear")}: ${meta.gear}` : "",
    "Training Pal",
  ].filter(Boolean);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const endDay = ymd(addDays(parseDate(day), 1)).replace(/-/g, "");
  const startDay = day.replace(/-/g, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Training Pal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:today-${startDay}@training-pal`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${startDay}`,
    `DTEND;VALUE=DATE:${endDay}`,
    `SUMMARY:${String(title).replace(/\n/g, " ")}`,
    `DESCRIPTION:${lines.join("\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `training-pal-${day}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderNoPlanHome(acts, now) {
  const lastSync = acts.length ? acts.map((a) => a.date).sort().at(-1) : null;
  const footnote = lastSync
    ? `${tt("home.actsUpTo", { date: short(parseDate(lastSync)) })} <a href="/activities">${tt("home.seeAll")}</a>`
    : tt("home.logOrImport");
  return `
    <section class="hero morning-hero">
      <div>
        <div class="eyebrow">${tt("home.today", { date: fmt(now, { weekday: "long", day: "numeric", month: "long" }) })}</div>
        <h1>${tt("home.noPlan")}</h1>
        <p class="muted">${tt("home.noPlanLead")}</p>
      </div>
      <button class="button" type="button" data-action="start-plan">${tt("home.startPlan")}</button>
    </section>
    ${todaySessionCard(acts, now)}
    ${typeof installPromptBanner === "function" ? installPromptBanner() : ""}
    ${acts.length ? loggedWeekBlock(acts, now) : `
      <section class="card">
        <p class="muted" style="margin:0">${tt("home.emptyCard")}</p>
      </section>`}
    <div class="cta"><a class="button ghost" href="/events">${tt("home.manageEvents")}</a></div>
    <p class="footnote">${footnote}</p>`;
}

function renderHome(acts, now) {
  const calendarWk = calendarPlanWeek(now);
  const wk = homeViewWeek(now);
  HOME_WEEK = wk === calendarWk ? null : wk;
  const current = WEEKS[wk - 1];
  const phase = phaseOf(wk);
  const daysToRace = daysBetween(now, RACE);
  const lastSync = acts.length ? acts.map((a) => a.date).sort().at(-1) : null;
  const viewingPast = wk !== calendarWk;
  const zone = viewingPast ? "week" : homeZone();
  if (viewingPast && homeZone() !== "week") setHomeZone("week");

  const changesN = pendingChanges().length;
  const footnote = lastSync
    ? `${tt("home.actsUpTo", { date: short(parseDate(lastSync)) })} <a href="/activities">${tt("home.seeAll")}</a>`
    : tt("home.openDayOrImport");

  const todayZone = `
    <div class="home-zone home-zone-today">
      ${todaySessionCard(acts, now)}
      ${recoveryHomeCard(now)}
      ${raceWeekChecklistCard(now)}
    </div>`;

  const weekZone = `
    <div class="home-zone home-zone-week">
      <div class="week-nav">
        <button class="button ghost small" type="button" data-action="home-week-prev"${wk <= 1 ? " disabled" : ""} aria-label="${esc(tt("common.previous"))}">${tt("home.prevWeek")}</button>
        ${viewingPast ? `<button class="button ghost small" type="button" data-action="home-week-today">${tt("home.thisWeek")}</button>` : ""}
        <button class="button ghost small" type="button" data-action="home-week-next"${wk >= WEEKS.length ? " disabled" : ""} aria-label="${esc(tt("common.next"))}">${tt("home.nextWeek")}</button>
      </div>
      <div class="week-stack">
        ${reviewCard(acts, now, { includePlanNote: true })}
        ${weekCard(current, acts, now, homeWeekCardTitle(wk, calendarWk, 0), {
          hideNote: reviewWeek(acts, now)?.wk === current.wk,
        })}
      </div>
      <div class="cta"><a class="button ghost" href="/plan">${tt("home.seeFullPlan")}</a></div>
    </div>`;

  return `
    <section class="hero morning-hero hero-compact">
      <div class="eyebrow">${zone === "today"
        ? tt("home.today", { date: fmt(now, { weekday: "long", day: "numeric", month: "long" }) })
        : (viewingPast ? tt("home.viewingWeekLabel", { week: wk }) : tt("home.zoneWeek"))}</div>
      <div class="hero-row">
        <div class="hero-week">
          <h1>${tt("home.weekOf", { week: wk, total: WEEKS.length })} <span class="hero-phase-inline muted">· ${esc(phase.name)}</span></h1>
          <p class="hero-phase-below">${esc(phase.name)}</p>
        </div>
        <button type="button" class="countdown" data-action="open-day" data-date="${ymd(RACE)}" title="${esc(tt("home.viewEvent", { event: eventLabel() }))}">
          <strong>${daysToRace}</strong><span>${tt("home.daysTo", { event: eventLabel() })}</span>
        </button>
      </div>
      ${window.CURRENT_PLAN?.notes ? `<p class="plan-notes">${esc(window.CURRENT_PLAN.notes)}</p>` : ""}
    </section>

    ${homeZoneToggle(zone)}
    ${typeof installPromptBanner === "function" ? installPromptBanner() : ""}

    ${changesN ? `
      <a class="changes-banner" href="/plan">
        <strong>${changesN === 1 ? tt("home.changesOne") : tt("home.changesMany", { count: changesN })}</strong>
        <span>${tt("home.changesReview")}</span>
      </a>` : ""}

    ${zone === "today" ? todayZone : weekZone}
    <p class="footnote">${footnote}</p>
  `;
}
