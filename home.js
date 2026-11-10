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
  // Walks on non-walk days stay quiet — recovery, not a failed match.
  if (a.cat === "walk" && !plannedSportCats(planKind).includes("walk")) {
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
  const busy = BUSY[ds];
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
    ? `<span class="recovery-chip lvl-${rec.score >= 80 ? "high" : rec.score >= 60 ? "mid" : "low"}" title="${esc(tt("day.recovery"))} ${rec.score}">${rec.score}</span>`
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
  const dayActs = allDayActs.filter((a) => a.cat !== "walk");
  const walks = allDayActs.filter((a) => a.cat === "walk");
  const dayMatch = matchPlanDay(plan, allDayActs);
  const evs = eventsOn(ds);
  const title = plan ? plan.label : hasPlan() ? "Outside the plan" : (dayActs[0]?.title || "Logged day");

  const activityMeta = (a, label, matchInfo) => {
    const time = a.datetime.slice(11, 16);
    let matchChip = "";
    if (dayMatch.trainable) {
      if (matchInfo) {
        matchChip = `<span class="match-tag matched conf-${matchInfo.confidence}" title="${esc(matchConfidenceLabel(matchInfo.confidence))}">${esc(tt("day.matched"))}</span>`;
      } else if (a.cat !== "walk" || plannedSportCats(plan?.kind).includes("walk")) {
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

  const guides = plan ? guidesFor(plan.kind, plan.label) : [];
  const showGuidesOpen = !dayActs.length;
  const matchSummary = dayMatch.trainable && dayMatch.done
    ? `<p class="match-summary conf-${dayMatch.match?.confidence || "low"}"><span class="match-tag matched">${esc(tt("day.matched"))}</span> ${esc(matchConfidenceLabel(dayMatch.match?.confidence))}${dayMatch.unmatched.some((a) => a.cat !== "walk") ? ` · ${esc(tt("day.extraLogged"))}` : ""}</p>`
    : dayMatch.trainable && allDayActs.some((a) => a.cat !== "walk")
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
    ${plan ? busyBlock(plan, ds) : ""}
    ${plan ? paceGraph(plan) : ""}
    ${activities}
    ${walkBlocks}
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

function weekCard(week, acts, now, title) {
  const s = weekStart(week.wk), e = addDays(s, 6);
  const actual = weekRunKm(week, acts);
  const showActual = s <= now;
  const pct = Math.min(100, Math.round((actual / week.km) * 100));
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <div class="eyebrow">${title}</div>
          <h2>${tt("home.weekTitle", { week: week.wk, range: `${short(s)} – ${short(e)}` })}</h2>
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
      ${week.note ? `<p class="note">${week.note}</p>` : ""}
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

function renderNoPlanHome(acts, now) {
  const lastSync = acts.length ? acts.map((a) => a.date).sort().at(-1) : null;
  const upcoming = upcomingEventsList(now, acts);
  const footnote = lastSync
    ? `${tt("home.actsUpTo", { date: short(parseDate(lastSync)) })} <a href="/activities">${tt("home.seeAll")}</a>`
    : tt("home.logOrImport");
  return `
    <section class="hero">
      <div>
        <div class="eyebrow">${tt("home.today", { date: fmt(now, { weekday: "long", day: "numeric", month: "long" }) })}</div>
        <h1>${tt("home.noPlan")}</h1>
        <p class="muted">${tt("home.noPlanLead")}</p>
      </div>
      <button class="button" type="button" data-action="start-plan">${tt("home.startPlan")}</button>
    </section>
    ${acts.length ? loggedWeekBlock(acts, now) : `
      <section class="card">
        <p class="muted" style="margin:0">${tt("home.emptyCard")}</p>
      </section>`}
    ${eventsCard(now, upcoming, { acts })}
    <p class="footnote">${footnote}</p>`;
}

function renderHome(acts, now) {
  const calendarWk = calendarPlanWeek(now);
  const wk = homeViewWeek(now);
  HOME_WEEK = wk === calendarWk ? null : wk;
  const current = WEEKS[wk - 1];
  const next = WEEKS[wk];
  const phase = phaseOf(wk);
  const daysToRace = daysBetween(now, RACE);
  const progress = Math.round((daysBetween(START, now) / daysBetween(START, RACE)) * 100);
  const upcoming = upcomingEventsList(now, acts);
  const lastSync = acts.length ? acts.map((a) => a.date).sort().at(-1) : null;
  const viewingPast = wk !== calendarWk;

  const changesN = pendingChanges().length;
  const footnote = lastSync
    ? `${tt("home.actsUpTo", { date: short(parseDate(lastSync)) })} <a href="/activities">${tt("home.seeAll")}</a>`
    : tt("home.openDayOrImport");
  return `
    <section class="hero">
      <div>
        <div class="eyebrow">${tt("home.today", { date: fmt(now, { weekday: "long", day: "numeric", month: "long" }) })}${viewingPast ? tt("home.viewingWeek", { week: wk }) : ""}</div>
        <h1>${tt("home.weekOf", { week: wk, total: WEEKS.length })} <span class="muted">· ${phase.name}</span></h1>
        <p class="muted">${phase.focus}</p>
        ${window.CURRENT_PLAN?.notes ? `<p class="plan-notes">${esc(window.CURRENT_PLAN.notes)}</p>` : ""}
      </div>
      <button type="button" class="countdown" data-action="open-day" data-date="${ymd(RACE)}" title="${esc(tt("home.viewEvent", { event: eventLabel() }))}">
        <strong>${daysToRace}</strong><span>${tt("home.daysTo", { event: eventLabel() })}</span>
      </button>
    </section>

    <div class="timeline">
      ${PHASES.map((p) => `<div class="seg p-${p.name} ${p === phase ? "active" : ""}" style="flex:${p.to - p.from + 1}"><span>${p.name}</span></div>`).join("")}
      <div class="marker" style="left:${Math.max(0, Math.min(100, progress))}%"></div>
    </div>

    ${(() => {
      const block = recoveryBlock(ymd(now), planFor(ymd(now)));
      return block ? `<section class="card">${block}</section>` : "";
    })()}

    ${changesN ? `
      <a class="changes-banner" href="/plan">
        <strong>${changesN === 1 ? tt("home.changesOne") : tt("home.changesMany", { count: changesN })}</strong>
        <span>${tt("home.changesReview")}</span>
      </a>` : ""}

    ${reviewCard(acts, now)}

    <div class="week-nav">
      <button class="button ghost small" type="button" data-action="home-week-prev"${wk <= 1 ? " disabled" : ""} aria-label="${esc(tt("common.previous"))}">${tt("home.prevWeek")}</button>
      ${viewingPast ? `<button class="button ghost small" type="button" data-action="home-week-today">${tt("home.thisWeek")}</button>` : ""}
      <button class="button ghost small" type="button" data-action="home-week-next"${wk >= WEEKS.length ? " disabled" : ""} aria-label="${esc(tt("common.next"))}">${tt("home.nextWeek")}</button>
    </div>

    <div class="grid">
      ${weekCard(current, acts, now, homeWeekCardTitle(wk, calendarWk, 0))}
      ${next ? weekCard(next, acts, now, homeWeekCardTitle(wk, calendarWk, 1)) : ""}
    </div>

    ${eventsCard(now, upcoming, { acts })}

    <div class="cta"><a class="button" href="/plan">${tt("home.seeFullPlan")}</a></div>
    <p class="footnote">${footnote}</p>
  `;
}
