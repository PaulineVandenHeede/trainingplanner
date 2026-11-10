// Gear inventory, shoe wear, and /gear page (extracted from app.js).
const GEAR_KINDS = {
  shoes: { title: "Shoes", add: "shoes", hint: "e.g. ASICS Gel Pursue 10", picker: "Shoes", empty: "shoes", addLink: "shoes", unit: "km", group: "endurance" },
  bike: { title: "Bikes", add: "a bike", hint: "e.g. Canyon Endurace", picker: "Bike", empty: "bike", addLink: "a bike", unit: "km", group: "endurance" },
  swimsuit: { title: "Swimsuits", add: "a swimsuit", hint: "e.g. Arena Powerskin", picker: "Swimsuit", empty: "swimsuit", addLink: "a swimsuit", unit: "m", group: "endurance" },
  wetsuit: { title: "Wetsuits", add: "a wetsuit", hint: "e.g. HUUB Aegis", picker: "Wetsuit", empty: "wetsuit", addLink: "a wetsuit", unit: "m", group: "endurance" },
  kettlebell: { title: "Kettlebells", add: "a kettlebell", hint: "e.g. 16 kg", picker: "Kettlebell", empty: "kettlebell", addLink: "a kettlebell", unit: null, group: "strength", hasWeight: true },
  dumbbells: { title: "Dumbbells", add: "dumbbells", hint: "e.g. pair weight", picker: "Dumbbells", empty: "dumbbells", addLink: "dumbbells", unit: null, group: "strength", hasWeight: true },
  barbell: { title: "Barbells", add: "a barbell", hint: "e.g. working weight", picker: "Barbell", empty: "barbell", addLink: "a barbell", unit: null, group: "strength", hasWeight: true },
  bands: { title: "Bands", add: "bands", hint: "e.g. loop + long bands", picker: "Bands", empty: "bands", addLink: "bands", unit: null, group: "strength" },
  pullup: { title: "Pull-up bars", add: "a pull-up bar", hint: "e.g. doorway pull-up bar", picker: "Pull-up bar", empty: "pull-up bar", addLink: "a pull-up bar", unit: null, group: "strength" },
  gym: { title: "Gym access", add: "gym access", hint: "e.g. Basic-Fit membership", picker: "Gym access", empty: "gym access", addLink: "gym access", unit: null, group: "strength" },
};

const ENDURANCE_GEAR_TYPES = Object.keys(GEAR_KINDS).filter((id) => GEAR_KINDS[id].group === "endurance");
const STRENGTH_GEAR_TYPES = Object.keys(GEAR_KINDS).filter((id) => GEAR_KINDS[id].group === "strength");

// Typical useful lifespan by shoe category (km). Midpoints of common manufacturer /
 // coach ranges: daily trainers ~500–800, tempo ~400–600, race/super ~200–400,
 // trail ~500–700. Racing pairs often lose their edge earlier (~240 km).
const SHOE_KINDS = {
  daily: { label: "Daily trainer", maxKm: 700, hint: "Most volume shoes last about 500–800 km" },
  tempo: { label: "Tempo / performance", maxKm: 500, hint: "Lighter foam usually lasts about 400–600 km" },
  race: { label: "Race / super shoe", maxKm: 300, hint: "Carbon race shoes often fade by 200–400 km" },
  trail: { label: "Trail", maxKm: 600, hint: "Trail pairs typically last about 500–700 km" },
  other: { label: "Other", maxKm: 700, hint: "Set your own target distance" },
};
const SHOE_WEAR_WARN = 0.85;

function activeStrengthGear(items = GEAR.items) {
  return (items || []).filter((g) => !g.retired && GEAR_KINDS[g.type]?.group === "strength");
}

function strengthAccessLevel(items = GEAR.items) {
  const form = typeof document !== "undefined" ? document.querySelector(".setup-form") : null;
  const mode = form?.dataset.strengthMode || "";
  const active = activeStrengthGear(items);
  const home = active.filter((g) => g.type !== "gym");
  // Explicit setup choice wins — even before gear inventory is updated.
  if (mode === "bodyweight") return "bodyweight";
  if (mode === "gym") return "gym";
  if (mode === "home") return home.length ? "home" : "bodyweight";
  if (active.some((g) => g.type === "gym")) return "gym";
  if (home.length) return "home";
  return "bodyweight";
}

function strengthAccessLabel(level = strengthAccessLevel()) {
  if (level === "gym") return "Gym membership";
  if (level === "home") return "Home gym";
  return "Bodyweight";
}

function strengthGearAdvice() {
  const level = strengthAccessLevel();
  const active = activeStrengthGear().filter((g) => g.type !== "gym");
  if (level === "gym") return "Strength sessions use your gym membership.";
  if (level === "home") {
    const names = active.map((g) => g.name).slice(0, 3).join(", ");
    const more = active.length > 3 ? ` +${active.length - 3} more` : "";
    return names ? `Uses your gear: ${names}${more}.` : "Add home gym gear to load sessions.";
  }
  return "";
}

function gearHasWeight(type) {
  return !!GEAR_KINDS[type]?.hasWeight;
}

window.activeStrengthGear = activeStrengthGear;
window.strengthAccessLevel = strengthAccessLevel;
window.strengthAccessLabel = strengthAccessLabel;
window.strengthGearAdvice = strengthGearAdvice;

async function loadGear() {
  if (!CURRENT_USER_ID) return { items: [], assignments: {} };
  const [{ data: items, error: itemErr }, { data: assigned, error: assignErr }] = await Promise.all([
    sb.from("gear").select("*").eq("user_id", CURRENT_USER_ID).order("added_at"),
    sb.from("activity_gear").select("activity,gear_id").eq("user_id", CURRENT_USER_ID),
  ]);
  if (itemErr || assignErr) return { items: [], assignments: {} };
  const assignments = {};
  for (const row of assigned || []) assignments[row.activity] = row.gear_id;
  return {
    items: (items || []).map(mapGearRow),
    assignments,
  };
}

function mapGearRow(row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    note: row.note || "",
    retired: !!row.retired,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
    shoeKind: row.shoe_kind && SHOE_KINDS[row.shoe_kind] ? row.shoe_kind : null,
    maxKm: row.max_km != null ? Number(row.max_km) : null,
    notifyWear: !!row.notify_wear,
    addedAt: row.added_at,
  };
}

function shoeMaxKmDefault(kind) {
  return SHOE_KINDS[kind]?.maxKm || SHOE_KINDS.daily.maxKm;
}

function shoeWearState(item, usedKm = gearDistance(item)) {
  const maxKm = Number(item?.maxKm);
  if (!(maxKm > 0)) return { level: "none", usedKm, maxKm: null, pct: 0 };
  const pct = Math.min(1.5, usedKm / maxKm);
  if (usedKm >= maxKm) return { level: "over", usedKm, maxKm, pct };
  if (usedKm >= maxKm * SHOE_WEAR_WARN) return { level: "warn", usedKm, maxKm, pct };
  return { level: "ok", usedKm, maxKm, pct };
}

function shoeWearAlerts(items = GEAR.items) {
  return (items || [])
    .filter((g) => g.type === "shoes" && !g.retired && g.notifyWear && g.maxKm > 0)
    .map((g) => ({ item: g, wear: shoeWearState(g) }))
    .filter((row) => row.wear.level === "warn" || row.wear.level === "over");
}

function shoeWearBanner() {
  const alerts = shoeWearAlerts();
  if (!alerts.length) return "";
  const lines = alerts.map(({ item, wear }) => {
    const used = fmtDistWithUnit(wear.usedKm, 1);
    const max = fmtDistWithUnit(wear.maxKm, 0);
    if (wear.level === "over") {
      return `<li><strong>${esc(item.name)}</strong> is past its target (${used} / ${max}). Time to retire or rotate them.</li>`;
    }
    return `<li><strong>${esc(item.name)}</strong> is near its target (${used} / ${max}).</li>`;
  }).join("");
  return `
    <section class="card gear-wear-alert" role="status">
      <div class="eyebrow">Shoe lifespan</div>
      <h2>Wear alerts</h2>
      <ul class="gear-wear-list">${lines}</ul>
    </section>`;
}

function maybeToastShoeWear() {
  const alerts = shoeWearAlerts();
  if (!alerts.length) return;
  const key = `shoe-wear-toast:${CURRENT_USER_ID || "anon"}`;
  let seen = {};
  try { seen = JSON.parse(sessionStorage.getItem(key) || "{}"); } catch { seen = {}; }
  const fresh = alerts.filter(({ item, wear }) => seen[item.id] !== wear.level);
  if (!fresh.length) return;
  fresh.forEach(({ item, wear }) => { seen[item.id] = wear.level; });
  try { sessionStorage.setItem(key, JSON.stringify(seen)); } catch { /* ignore */ }
  const over = fresh.filter((r) => r.wear.level === "over");
  const warn = fresh.filter((r) => r.wear.level === "warn");
  if (over.length) {
    toast(over.length === 1
      ? `${over[0].item.name} is past its shoe lifespan target.`
      : `${over.length} pairs are past their shoe lifespan target.`);
  } else if (warn.length) {
    toast(warn.length === 1
      ? `${warn[0].item.name} is near its shoe lifespan target.`
      : `${warn.length} pairs are near their shoe lifespan target.`);
  }
}

function shoeWearBar(item) {
  if (item.type !== "shoes" || !(item.maxKm > 0)) return "";
  const wear = shoeWearState(item);
  const pct = Math.min(100, Math.round(wear.pct * 100));
  const used = fmtDistWithUnit(wear.usedKm, 1);
  const max = fmtDistWithUnit(wear.maxKm, 0);
  const kind = item.shoeKind && SHOE_KINDS[item.shoeKind] ? SHOE_KINDS[item.shoeKind].label : "";
  return `
    <div class="shoe-wear" data-level="${wear.level}">
      <div class="shoe-wear-meta">
        <span>${used} / ${max}${kind ? ` · ${esc(kind)}` : ""}</span>
        <span>${pct}%</span>
      </div>
      <div class="shoe-wear-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Distance on ${esc(item.name)}">
        <span class="shoe-wear-fill" style="width:${pct}%"></span>
      </div>
    </div>`;
}
const pendingChanges = () => CHANGES.filter((c) => c.status === "pending" || (!c.status));

function gearMatchesActivity(item, a) {
  return gearTypesFor(a.cat).includes(item.type);
}

function gearDistance(item, acts = ACTS) {
  return acts.reduce((sum, a) => {
    if (GEAR.assignments[a.datetime] !== item.id) return sum;
    if (!gearMatchesActivity(item, a)) return sum;
    return sum + (a.dist || 0);
  }, 0);
}

function gearUsageLabel(item) {
  const kind = GEAR_KINDS[item.type];
  if (kind?.group === "strength") {
    const weight = item.weightKg ? fmtWeightWithUnit(item.weightKg) : "";
    if (item.type === "gym") return "Full gym access for strength sessions";
    return weight ? `${weight} · available for strength sessions` : "Available for strength sessions";
  }
  const dist = gearDistance(item);
  const count = ACTS.filter((a) => GEAR.assignments[a.datetime] === item.id).length;
  const amount = kind?.unit === "m"
    ? `${Math.round(dist).toLocaleString(typeof window.localeTag === "function" ? window.localeTag() : "en-GB")} m`
    : fmtDistWithUnit(dist, 1);
  const sessions = count ? ` · ${count} session${count === 1 ? "" : "s"}` : "";
  return `${amount} from assigned activities${sessions}`;
}

function gearPicker(a) {
  const types = gearTypesFor(a.cat);
  if (!types.length) return "";
  const items = GEAR.items.filter((g) => types.includes(g.type));
  const assigned = GEAR.assignments[a.datetime] || "";
  const mixed = types.length > 1;
  if (!items.length) {
    const noun = mixed ? "swimsuit or wetsuit" : GEAR_KINDS[types[0]].empty;
    const add = mixed ? "a swimsuit or wetsuit" : GEAR_KINDS[types[0]].addLink;
    return `<p class="muted small-text">No ${noun} added yet. This activity is fine without gear — <a href="/gear">add ${add}</a> when you want to track it.</p>`;
  }
  const options = items
    .filter((g) => !g.retired || g.id === assigned)
    .map((g) => {
      const kind = mixed ? ` · ${GEAR_KINDS[g.type].picker.toLowerCase()}` : "";
      return `<option value="${esc(g.id)}" ${g.id === assigned ? "selected" : ""}>${esc(g.name)}${kind}${g.retired ? " (retired)" : ""}</option>`;
    })
    .join("");
  return `
    <label class="gear-pick">
      ${mixed ? "Swim kit" : GEAR_KINDS[types[0]].picker}
      <select data-action="assign-gear" data-activity="${esc(a.datetime)}" data-date="${esc(a.date)}">
        <option value="">None</option>
        ${options}
      </select>
    </label>`;
}

function gearRow(item) {
  return `
    <li>
      <div class="gear-main">
        <strong>${esc(item.name)}</strong>
        <span class="muted">${item.note ? `${esc(item.note)} · ` : ""}${gearUsageLabel(item)}</span>
        ${shoeWearBar(item)}
      </div>
      <div class="gear-actions">
        <button class="button ghost small" type="button" data-action="edit-gear" data-id="${esc(item.id)}">Edit</button>
        <button class="button ghost small" type="button" data-action="toggle-retire" data-id="${esc(item.id)}">${item.retired ? "Unretire" : "Retire"}</button>
      </div>
    </li>`;
}

function gearGroup(type) {
  const kind = GEAR_KINDS[type];
  const active = GEAR.items.filter((g) => g.type === type && !g.retired);
  if (!active.length) return "";
  return `
    <section class="card">
      <div class="card-head">
        <h2>${kind.title}</h2>
      </div>
      <ul class="gear-list">
        ${active.map(gearRow).join("")}
      </ul>
    </section>`;
}

function retiredGearSection() {
  const retired = GEAR.items.filter((g) => g.retired);
  if (!retired.length) return "";
  const byType = Object.keys(GEAR_KINDS)
    .map((type) => {
      const items = retired.filter((g) => g.type === type);
      if (!items.length) return "";
      return `
        <div class="gear-retired-group">
          <div class="eyebrow gear-retired-label">${GEAR_KINDS[type].title}</div>
          <ul class="gear-list retired">${items.map(gearRow).join("")}</ul>
        </div>`;
    })
    .join("");
  return `
    <section class="card gear-retired">
      <div class="card-head">
        <h2>${tt("gear.retired")}</h2>
      </div>
      <p class="muted setup-hint">${tt("gear.retiredHint")}</p>
      ${byType}
    </section>`;
}

function syncGearNamePlaceholder(form) {
  const kind = GEAR_KINDS[form?.type?.value];
  const input = form?.querySelector("input[name=name]");
  if (kind && input) {
    if (kind.hasWeight) {
      input.placeholder = isImperial() ? "e.g. Competition KB" : "e.g. Cast iron KB";
    } else {
      input.placeholder = kind.hint;
    }
  }
  const weightLabel = form?.querySelector("[data-weight-label]");
  if (weightLabel) weightLabel.textContent = `Weight (${weightUnit()})`;
  const maxLabel = form?.querySelector("[data-max-km-label]");
  if (maxLabel) maxLabel.textContent = `Lifespan target (${distUnit()})`;
}

function syncGearWeightVisibility(form) {
  if (!form) return;
  const wrap = form.querySelector(".gear-weight-field");
  const input = form.querySelector("input[name=weight]");
  const show = gearHasWeight(form.type?.value);
  if (wrap) wrap.hidden = !show;
  if (input) {
    input.required = !!show;
    if (!show) input.value = "";
  }
}

function syncShoeFieldsVisibility(form) {
  if (!form) return;
  const wrap = form.querySelector(".gear-shoe-fields");
  const show = form.type?.value === "shoes";
  if (wrap) wrap.hidden = !show;
  if (!show) return;
  const kind = form.shoe_kind?.value || "daily";
  const hint = form.querySelector("[data-shoe-hint]");
  if (hint) hint.textContent = SHOE_KINDS[kind]?.hint || "";
  if (form.max_km && !form.max_km.value) {
    form.max_km.value = displayDistValue(shoeMaxKmDefault(kind), 0);
  }
}

function applyShoeKindDefault(form) {
  if (!form || form.type?.value !== "shoes") return;
  const kind = form.shoe_kind?.value || "daily";
  const hint = form.querySelector("[data-shoe-hint]");
  if (hint) hint.textContent = SHOE_KINDS[kind]?.hint || "";
  if (form.max_km) form.max_km.value = displayDistValue(shoeMaxKmDefault(kind), 0);
}

function syncGearFormMode(form, item = null) {
  if (!form) return;
  const title = form.closest(".gear-add")?.querySelector(".gear-form-title");
  const type = form.type;
  const submit = form.querySelector("button[type=submit]");
  if (item) {
    form.dataset.id = item.id;
    if (title) title.textContent = "Edit gear";
    if (type) {
      type.value = item.type;
      type.disabled = true;
    }
    if (form.name) form.name.value = item.name || "";
    if (form.note) form.note.value = item.note || "";
    if (submit) submit.textContent = "Save changes";
  } else {
    delete form.dataset.id;
    if (title) title.textContent = "Add gear";
    if (type) type.disabled = false;
    form.reset();
    if (submit) submit.textContent = "Save";
  }
  const errorEl = form.querySelector(".form-error");
  if (errorEl) errorEl.textContent = "";
  syncGearNamePlaceholder(form);
  syncGearWeightVisibility(form);
  syncShoeFieldsVisibility(form);
  if (item && form.weight) form.weight.value = item.weightKg ? fmtWeight(item.weightKg) : "";
  if (item && item.type === "shoes") {
    if (form.shoe_kind) form.shoe_kind.value = item.shoeKind || "daily";
    if (form.max_km) form.max_km.value = item.maxKm ? displayDistValue(item.maxKm, 0) : displayDistValue(shoeMaxKmDefault(form.shoe_kind?.value || "daily"), 0);
    if (form.notify_wear) form.notify_wear.checked = !!item.notifyWear;
    const hint = form.querySelector("[data-shoe-hint]");
    if (hint) hint.textContent = SHOE_KINDS[form.shoe_kind?.value || "daily"]?.hint || "";
  } else if (!item && form.type?.value === "shoes") {
    applyShoeKindDefault(form);
    if (form.notify_wear) form.notify_wear.checked = false;
  }
}

function openGearForm(item = null, presetType = null) {
  const wrap = document.querySelector(".gear-add");
  const form = wrap?.querySelector(".gear-form");
  if (!wrap || !form) return;
  syncGearFormMode(form, item);
  if (!item && presetType && GEAR_KINDS[presetType] && form.type) {
    form.type.value = presetType;
    syncGearNamePlaceholder(form);
    syncGearWeightVisibility(form);
    syncShoeFieldsVisibility(form);
    if (presetType === "shoes") applyShoeKindDefault(form);
  }
  wrap.hidden = false;
  form.querySelector("input[name=name]")?.focus();
  wrap.scrollIntoView({ block: "nearest" });
}

async function quickAddStrengthGear(type, opts = {}) {
  if (!GEAR_KINDS[type] || GEAR_KINDS[type].group !== "strength") return;
  const defaults = {
    gym: { name: "Gym membership", note: "Full equipment access" },
    kettlebell: { name: "Kettlebell", note: "Home strength" },
    dumbbells: { name: "Dumbbells", note: "Home strength" },
    barbell: { name: "Barbell", note: "Home strength" },
    bands: { name: "Resistance bands", note: "Home strength" },
    pullup: { name: "Pull-up bar", note: "Home strength" },
  };
  const existing = GEAR.items.find((g) => g.type === type && !g.retired);
  if (existing && (type === "gym" || opts.insert)) {
    toast(`${existing.name} is already in your kit.`);
    return;
  }
  const insertNow = opts.insert === true || type === "gym" || !document.querySelector(".gear-add");
  if (insertNow) {
    const preset = defaults[type] || { name: GEAR_KINDS[type].picker, note: "" };
    await apiRequest("POST", "/api/gear", {
      type,
      name: preset.name,
      note: preset.note,
    });
    GEAR = await loadGear();
    if (!opts.skipRender) render(true);
    if (!opts.silent) {
      toast(type === "gym"
        ? "Gym membership added — strength sessions can use full gym equipment."
        : `${preset.name} added for strength sessions.`);
    }
    return;
  }
  openGearForm(null, type);
  const form = document.querySelector(".gear-form");
  if (form && defaults[type] && !form.name.value) {
    form.name.value = defaults[type].name;
    if (form.note && !form.note.value) form.note.value = defaults[type].note;
  }
}
window.quickAddStrengthGear = quickAddStrengthGear;

function closeGearForm() {
  const wrap = document.querySelector(".gear-add");
  const form = wrap?.querySelector(".gear-form");
  if (!wrap || !form) return;
  wrap.hidden = true;
  syncGearFormMode(form, null);
}

function gearAddForm() {
  const endurance = ENDURANCE_GEAR_TYPES
    .map((id) => `<option value="${id}">${GEAR_KINDS[id].picker}</option>`)
    .join("");
  const strength = STRENGTH_GEAR_TYPES
    .map((id) => `<option value="${id}">${GEAR_KINDS[id].picker}</option>`)
    .join("");
  const shoeKinds = Object.entries(SHOE_KINDS)
    .map(([id, meta]) => `<option value="${id}">${meta.label}</option>`)
    .join("");
  return `
    <section class="card gear-add" hidden>
      <h2 class="gear-form-title">Add gear</h2>
      <form class="gear-form">
        <label>Type
          <select name="type">
            <optgroup label="Endurance">${endurance}</optgroup>
            <optgroup label="Strength">${strength}</optgroup>
          </select>
        </label>
        <label class="grow">Name<input type="text" name="name" required maxlength="80" placeholder="${GEAR_KINDS.shoes.hint}" /></label>
        <label class="gear-weight-field" hidden>
          <span data-weight-label>Weight (${weightUnit()})</span>
          <input type="number" name="weight" min="0.5" step="0.5" placeholder="${isImperial() ? "35" : "16"}" />
        </label>
        <div class="gear-shoe-fields full" hidden>
          <label>Shoe type
            <select name="shoe_kind">
              ${shoeKinds}
            </select>
          </label>
          <label>
            <span data-max-km-label>Lifespan target (${distUnit()})</span>
            <input type="number" name="max_km" min="1" step="1" />
          </label>
          <p class="setup-hint" data-shoe-hint></p>
          <label class="check-row">
            <input type="checkbox" name="notify_wear" value="1" />
            <span>Notify me when this pair is near or past its lifespan</span>
          </label>
        </div>
        <label class="full">Note <span class="muted">(optional)</span><input type="text" name="note" maxlength="140" placeholder="e.g. daily trainer, race pair" /></label>
        <div class="form-actions">
          <span class="form-error"></span>
          <button class="button ghost" type="button" data-action="toggle-gear-form">Cancel</button>
          <button class="button" type="submit">Save</button>
        </div>
      </form>
    </section>`;
}

function strengthGearQuickAdd() {
  const level = strengthAccessLevel();
  const chips = [
    ["gym", "Gym membership"],
    ["kettlebell", "Kettlebell"],
    ["dumbbells", "Dumbbells"],
    ["bands", "Bands"],
    ["pullup", "Pull-up bar"],
    ["barbell", "Barbell"],
  ].map(([type, label]) => {
    const owned = GEAR.items.some((g) => g.type === type && !g.retired);
    return `<button class="choice-btn${owned ? " is-on" : ""}" type="button" data-action="quick-gear" data-type="${type}" ${owned && type === "gym" ? "disabled" : ""}>${owned && type === "gym" ? "Gym added" : `+ ${label}`}</button>`;
  }).join("");
  return `
    <section class="card gear-strength">
      <div class="eyebrow">${tt("gear.strengthEyebrow")}</div>
      <h2>${tt("gear.strengthTitle")}</h2>
      <p class="muted">${tt("gear.strengthLead")}</p>
      <p class="gear-access-pill"><span class="eyebrow">${tt("gear.current")}</span> ${esc(strengthAccessLabel(level))}</p>
      <p class="setup-hint">${esc(strengthGearAdvice())}</p>
      <div class="choice-row gear-quick">${chips}</div>
    </section>`;
}

function renderGear() {
  const endurance = ENDURANCE_GEAR_TYPES.map(gearGroup).join("");
  const strength = STRENGTH_GEAR_TYPES.map(gearGroup).join("");
  const hasActive = GEAR.items.some((g) => !g.retired);
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">${tt("gear.inventory")}</div>
        <h1>${tt("gear.title")}</h1>
        <p class="muted">${tt("gear.lead")}</p>
      </div>
      <button class="button" type="button" data-action="toggle-gear-form">${tt("gear.add")}</button>
    </section>
    ${gearAddForm()}
    ${shoeWearBanner()}
    ${strengthGearQuickAdd()}
    ${strength}
    ${endurance || (!hasActive ? `<section class="card"><p class="muted">${tt("gear.noEndurance")}</p></section>` : "")}
    ${retiredGearSection()}`;
}

