(() => {
  const STORAGE_KEY = "tp-lang";
  const SUPPORTED = ["en", "nl"];
  const LOCALE_TAG = { en: "en-GB", nl: "nl-NL" };

  const en = {
    "nav.home": "Home",
    "nav.plan": "Full plan",
    "nav.activities": "All activities",
    "nav.gear": "Gear",
    "nav.sync": "Sync activities",
    "nav.import": "Import a Garmin Connect Activities.csv export",
    "nav.importAria": "Import CSV",
    "nav.account": "Account",
    "nav.accountAria": "Account menu",
    "nav.logout": "Sign out",
    "nav.overview": "Overview",
    "nav.connections": "Connections",
    "nav.settings": "Settings",
    "common.loading": "Loading…",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "brand.name": "Training Pal",
    "brand.eyebrow": "Your training",

    "day.mon": "Mon",
    "day.tue": "Tue",
    "day.wed": "Wed",
    "day.thu": "Thu",
    "day.fri": "Fri",
    "day.sat": "Sat",
    "day.sun": "Sun",

    "kind.run": "Easy run",
    "kind.quality": "Quality",
    "kind.long": "Long run",
    "kind.event": "Event",
    "kind.race": "Race",
    "kind.walk": "Walk",
    "kind.swim": "Swim",
    "kind.walkswim": "Walk + swim",
    "kind.bike": "Bike",
    "kind.rest": "Rest",
    "kind.travel": "Travel",

    "auth.leadSignIn": "Sign in to open your plan.",
    "auth.leadForgot": "Enter your email and we'll send a link to choose a new password.",
    "auth.signIn": "Sign in",
    "auth.signUp": "Create account",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.confirmPassword": "Confirm password",
    "auth.forgot": "Forgot password?",
    "auth.backSignIn": "Back to sign in",
    "auth.sendReset": "Send reset link",
    "auth.newPasswordTitle": "New password",
    "auth.newPassword": "New password",
    "auth.savePassword": "Save password",
    "auth.resetLead": "Choose a new password for your account.",
    "auth.resetLeadFor": "Choose a new password for {email}.",
    "auth.language": "Language",

    "pw.length": "12 to 72 characters",
    "pw.lower": "One lowercase letter",
    "pw.upper": "One uppercase letter",
    "pw.digit": "One number",
    "pw.symbol": "One symbol",
    "pw.noEdgeSpace": "No space at the start or end",
    "pw.notEmail": "Can't be your email address",
    "pw.notEmailLocal": "Can't include your email name",
    "pw.enter": "Enter a password.",
    "pw.mismatch": "Passwords don't match.",
    "pw.meetAll": "Meet every requirement below.",
    "pw.alsoMeet": "Also meet every requirement below.",

    "settings.eyebrow": "Your account",
    "settings.title": "Settings",
    "settings.lead": "Change your name, language, units and password.",
    "settings.profileEyebrow": "Profile",
    "settings.nameTitle": "Name",
    "settings.nameHelp": "This is how you appear in the app.",
    "settings.nameLabel": "Name",
    "settings.namePlaceholder": "Your name",
    "settings.saveName": "Save name",
    "settings.prefsEyebrow": "Preferences",
    "settings.languageTitle": "Language",
    "settings.languageHelp": "App language for menus and labels.",
    "settings.saveLanguage": "Save language",
    "settings.unitsTitle": "Units",
    "settings.unitsHelp": "Distances and strength weights across the app.",
    "settings.saveUnits": "Save units",
    "settings.securityEyebrow": "Security",
    "settings.passwordTitle": "Password",
    "settings.passwordHelp": "Choose a new password for this account.",
    "settings.currentPassword": "Current password",
    "settings.newPassword": "New password",
    "settings.confirmNewPassword": "Confirm new password",
    "settings.changePassword": "Change password",
    "settings.unitsMetric": "Metric (km, kg)",
    "settings.unitsImperial": "Miles & lb",
    "settings.langEn": "English",
    "settings.langNl": "Nederlands",
    "settings.toastName": "Name saved.",
    "settings.toastUnitsMetric": "Using km and kg.",
    "settings.toastUnitsImperial": "Using miles and lb.",
    "settings.toastLanguage": "Language updated.",
    "settings.passwordUpdated": "Password updated.",
    "settings.enterCurrentPassword": "Enter your current password.",
    "settings.checkNewPassword": "Check your new password.",
    "settings.signInAgain": "Sign in again, then change your password.",
    "settings.currentIncorrect": "Current password is incorrect.",

    "profile.eyebrow": "Your profile",
    "profile.title": "Your profile",
    "profile.unitsBefore": "Currently {units}. Change below or in",
    "profile.settingsLink": "Settings",

    "username.enter": "Enter your name.",
    "username.length": "2–40 characters.",
    "username.chars": "Use letters, spaces, hyphens or apostrophes — e.g. Jane Doe.",
    "username.taken": "That name is already taken.",

    "sport.run": "Run",
    "sport.swim": "Swim",
    "sport.bike": "Bike",
    "sport.walk": "Walk",
    "sport.triathlon": "Triathlon",
    "common.busy": "Busy",
    "common.connected": "Connected",
    "common.notConnected": "Not connected",
    "common.sync": "Sync",
    "common.disconnect": "Disconnect",
    "common.previous": "Previous",
    "common.next": "Next",
    "common.all": "All",
    "common.close": "Close",

    "day.done": "Done",
    "day.notLogged": "Not logged",
    "day.viewActivity": "View activity",
    "day.viewSession": "View session",
    "day.howTo": "How to do this session",
    "day.viewDay": "View day",
    "day.noTraining": "No training today",
    "day.nothingLogged": "Nothing logged",
    "day.noSessionYet": "No session yet",
    "day.recovery": "Recovery",
    "day.matched": "Matched",
    "day.unmatched": "Extra",
    "day.unmatchedHint": "Logged, but not the best match for the planned session",
    "day.matchHigh": "Strong match (sport and distance)",
    "day.matchMedium": "Likely match",
    "day.matchLow": "Same sport — weak distance/time fit",
    "day.extraLogged": "other sessions logged too",
    "day.noPlanMatch": "Nothing here looks like the planned session",

    "home.today": "Today · {date}",
    "home.viewingWeek": " · viewing week {week}",
    "home.noPlan": "No plan yet",
    "home.noPlanLead": "Start a plan when you are ready. Import a CSV for this week, or add a public event to your agenda.",
    "home.startPlan": "Start plan",
    "home.emptyCard": "Nothing to show yet. Open a day to log a session, import a Garmin CSV, or start a plan.",
    "home.actsUpTo": "Activities up to {date}.",
    "home.seeAll": "See all",
    "home.logOrImport": "Log a session from a day, or import a Garmin CSV.",
    "home.openDayOrImport": "Open a day to mark it done, or import a Garmin Connect Activities.csv.",
    "home.weekOf": "Week {week} of {total}",
    "home.daysTo": "days to {event}",
    "home.viewEvent": "View {event}",
    "home.changesOne": "1 plan change waiting for the AI coach",
    "home.changesMany": "{count} plan changes waiting for the AI coach",
    "home.changesReview": "Review and send them from the Full plan page →",
    "home.prevWeek": "← Previous week",
    "home.nextWeek": "Next week →",
    "home.thisWeek": "This week",
    "home.lastWeek": "Last week",
    "home.nextWeekLabel": "Next week",
    "home.selectedWeek": "Selected week",
    "home.followingWeek": "Following week",
    "home.seeFullPlan": "See the full plan to race day →",
    "home.weekTitle": "Week {week} · {range}",
    "home.targetRun": "Run",
    "home.targetLong": "Long",
    "home.loggedRun": "Logged run {unit}:",
    "home.thisWeekReview": "This week · review",
    "home.upcomingEvents": "Upcoming events",
    "home.addEvent": "+ Add event",

    "plan.weeksRange": "{weeks} weeks · {start} → {end}",
    "plan.fullTitle": "Full {event} plan",
    "plan.leadRun": "The long run is the key session. If tired: keep that and cut an easy run. Weekly load rises about 10%, with a cutback every fourth week.",
    "plan.leadTri": "Triathlon structure: longer aerobic base, then build with race-specific work and bike→run bricks, then a sharper taper. If tired: cut extras first, protect the long ride and key brick. About 10% load increase week to week, cutback every fourth week.",
    "plan.leadOther": "Key session wins every conflict. If tired: cut the extra sport first, then easy km. About 10% load increase week to week, with a cutback every fourth week.",
    "plan.remove": "Remove plan",
    "plan.youAreHere": "You are here",
    "plan.weekFeedback": "Week feedback",
    "plan.paceGuide": "Pace guide",
    "plan.effort": "Effort",
    "plan.pace": "Pace / {unit}",
    "plan.use": "Use",
    "plan.paceNote": "Keep easy days easy. Save race effort for the event and short quality sessions. Track shoes, bikes, swim kit and strength equipment on the Gear page.",
    "plan.paceNoteLink": "Gear page",
    "plan.research": "Research behind this plan",
    "plan.load": "Load",
    "plan.weeklyRun": "Weekly run {unit}",
    "plan.progressReport": "Progress report",
    "plan.weekly": "Weekly",
    "plan.long": "Long",
    "plan.progress": "Progress",
    "plan.notStarted": "not started",
    "plan.weekN": "Week {week}",

    "act.log": "Log",
    "act.allTitle": "All activities",
    "act.sportTitle": "{sport} activities",
    "act.sessionsIn": "{count} session in {year}",
    "act.sessionsInPlural": "{count} sessions in {year}",
    "act.noSportInYear": "No {sport} sessions in {year}.",
    "act.nothingInYear": "Nothing logged in {year}. Pick another year, or log a session.",
    "act.nothingYet": "Nothing logged yet. Log a session, or import a Garmin CSV.",
    "act.logSession": "Log a session",
    "act.logged": "{unit} logged",
    "act.noSessionsInYear": "No sessions in {year}.",
    "act.weeklyVolume": "Weekly volume",
    "act.sportByWeek": "{sport} {unit} by week",

    "gear.inventory": "Inventory",
    "gear.title": "Gear & strength kit",
    "gear.lead": "Track shoes, bikes and swim kit for activities, plus home or gym equipment so strength sessions match what you own. Strava sync can link shoes or bikes onto activities that don’t have gear yet.",
    "gear.add": "+ Add gear",
    "gear.noEndurance": "No active endurance gear yet.",
    "gear.retired": "Retired gear",
    "gear.retiredHint": "Kept for history on past activities. Unretire to use again.",
    "gear.strengthEyebrow": "Strength",
    "gear.strengthTitle": "What can you train with?",
    "gear.strengthLead": "Logged kit shapes strength sessions and plan recommendations. Bodyweight always works; a kettlebell or gym membership unlocks loaded work.",
    "gear.current": "Current",

    "conn.eyebrow": "Your profile",
    "conn.title": "Connections",
    "conn.lead": "Link devices and services so activities can sync into your plan.",
    "conn.device": "Device",
    "conn.service": "Service",
    "conn.csvFootnote": "CSV import stays available from the upload button in the top bar.",
    "conn.garminLead": "Use your own Garmin Personal API key. Sync pulls activities, heart-rate zones, threshold, VO2 when Garmin shares it, plus sleep, Body Battery, stress and HRV for the recovery score on today's workout. Shoes, bikes or swim kit saved in Garmin are linked when an activity has no gear yet.",
    "conn.replaceKey": "Replace API key",
    "conn.newKey": "New Personal API key",
    "conn.keyPlaceholder": "Paste key from Garmin Connect",
    "conn.saveKey": "Save key",
    "conn.apiKey": "Personal API key",
    "conn.garminKeyHelp": "Create a key at Garmin Connect → Personal API (shown once; treat it like a password).",
    "conn.saveConnect": "Save & connect",
    "conn.stravaLead": "Compatible with Strava. Activities already on your own account, including from a watch, are stored for your plan and shown only to you. Disconnecting removes them from this app.",
    "conn.stravaShare": "Send Strava session summaries (date, sport, distance, pace, heart rate) to the AI coach. Leave this off and those sessions stay in your log only.",
    "conn.stravaShareAlso": "Also send Strava session summaries (date, sport, distance, pace, heart rate) to the AI coach. Leave this off and those sessions stay in your log only.",
    "conn.passcode": "Connect passcode",
    "conn.passcodePlaceholder": "Passcode from the app owner",
    "conn.stravaHelp": "Your Strava login happens on Strava. A new Strava API app can connect one athlete until the app owner raises that limit in Strava’s API settings.",

    "progress.title": "Progress report",
    "progress.back": "Back to plan",
    "progress.askAgain": "Ask the coach again",
    "progress.writing": "Writing…",
    "progress.noPlan": "No plan yet",
    "progress.eventDone": "{event} is done",
    "progress.weekOf": "Week {week} of {total} · {phase}",
    "progress.startsIn": "Starts in {days} days",
    "progress.daysToRace": " · {days} days to race",
    "progress.updating": "Updating the report…",
    "progress.writingFresh": "The coach is writing a progress report from your plan and sessions.",
    "progress.stale": "This was written in week {week}. Ask again for an update.",
    "progress.coachNote": "Coach note · {when}",

    "coach.eyebrow": "AI coach",
    "coach.planChanges": "Plan changes",
    "coach.send": "Send to AI coach",
    "coach.reviewing": "Reviewing",
    "coach.sentReviewing": "Sent to the AI coach. Reviewing these changes now. The plan updates when it finishes.",
    "coach.sendHint": "Click Send to AI coach and the review goes out as a request. The plan updates when it finishes. Stage weeks do this automatically.",
    "coach.sentNow": "Sent to the AI coach. Reviewing now. The plan updates when it finishes.",
    "coach.nonePending": "No pending changes. Busy days, new events and CSV imports show up here automatically.",
    "coach.appliedOne": " 1 earlier change was applied.",
    "coach.appliedMany": " {count} earlier changes were applied.",
    "coach.addNote": "Add note",
    "coach.notePlaceholder": "Anything else for the coach? e.g. sore calf, holiday 20–27 Dec, want to try a 10K race in January",
    "coach.removeFromList": "Remove from list",

    "setup.step1": "Step 1 of 2",
    "setup.step2": "Step 2 of 2",
    "setup.welcome": "Welcome",
    "setup.accountTitle": "Set up your account",
    "setup.accountLead": "Choose a name and units, then connect Garmin or Strava if you want past training to shape your first plan.",
    "setup.name": "Name",
    "setup.namePlaceholder": "e.g. Jane Doe",
    "setup.units": "Units",
    "setup.unitsHint": "Suggested from your location — change anytime in Settings.",
    "setup.connectOptional": "Connect a source",
    "setup.optional": "(optional)",
    "setup.checking": "Checking connections…",
    "setup.continue": "Continue",
    "setup.createPlan": "Create plan",
    "setup.newPlan": "New plan",
    "setup.whatFor": "What are you training for?",
    "setup.goal": "Goal",
    "setup.goalRace": "A race",
    "setup.goalTime": "A time goal",
    "setup.goalFitness": "General fitness",
    "setup.eventType": "Event type",
    "setup.searchEvents": "Search public events",
    "setup.addOwnEvent": "Add your own event",
    "setup.backToSearch": "Back to search",
    "setup.syncing": "Syncing activities… weekly volume will fill when ready.",
    "setup.pickSport": "Pick a sport first.",
    "sport.runFull": "Running",
    "sport.swimFull": "Swimming",
    "sport.bikeFull": "Cycling",
    "sport.triathlonFull": "Triathlon",
  };

  const nl = {
    "nav.home": "Home",
    "nav.plan": "Volledig plan",
    "nav.activities": "Alle activiteiten",
    "nav.gear": "Materiaal",
    "nav.sync": "Activiteiten synchroniseren",
    "nav.import": "Importeer een Garmin Connect Activities.csv-export",
    "nav.importAria": "CSV importeren",
    "nav.account": "Account",
    "nav.accountAria": "Accountmenu",
    "nav.logout": "Uitloggen",
    "nav.overview": "Overzicht",
    "nav.connections": "Koppelingen",
    "nav.settings": "Instellingen",
    "common.loading": "Laden…",
    "common.cancel": "Annuleren",
    "common.save": "Opslaan",
    "brand.name": "Training Pal",
    "brand.eyebrow": "Jouw training",

    "day.mon": "ma",
    "day.tue": "di",
    "day.wed": "wo",
    "day.thu": "do",
    "day.fri": "vr",
    "day.sat": "za",
    "day.sun": "zo",

    "kind.run": "Rustige loop",
    "kind.quality": "Kwaliteit",
    "kind.long": "Lange duurloop",
    "kind.event": "Evenement",
    "kind.race": "Wedstrijd",
    "kind.walk": "Wandelen",
    "kind.swim": "Zwemmen",
    "kind.walkswim": "Wandelen + zwemmen",
    "kind.bike": "Fietsen",
    "kind.rest": "Rust",
    "kind.travel": "Reizen",

    "auth.leadSignIn": "Log in om je plan te openen.",
    "auth.leadForgot": "Vul je e-mailadres in; we sturen een link om een nieuw wachtwoord te kiezen.",
    "auth.signIn": "Inloggen",
    "auth.signUp": "Account aanmaken",
    "auth.email": "E-mail",
    "auth.password": "Wachtwoord",
    "auth.confirmPassword": "Bevestig wachtwoord",
    "auth.forgot": "Wachtwoord vergeten?",
    "auth.backSignIn": "Terug naar inloggen",
    "auth.sendReset": "Stuur resetlink",
    "auth.newPasswordTitle": "Nieuw wachtwoord",
    "auth.newPassword": "Nieuw wachtwoord",
    "auth.savePassword": "Wachtwoord opslaan",
    "auth.resetLead": "Kies een nieuw wachtwoord voor je account.",
    "auth.resetLeadFor": "Kies een nieuw wachtwoord voor {email}.",
    "auth.language": "Taal",

    "pw.length": "12 tot 72 tekens",
    "pw.lower": "Eén kleine letter",
    "pw.upper": "Eén hoofdletter",
    "pw.digit": "Eén cijfer",
    "pw.symbol": "Eén symbool",
    "pw.noEdgeSpace": "Geen spatie aan begin of einde",
    "pw.notEmail": "Mag niet je e-mailadres zijn",
    "pw.notEmailLocal": "Mag je e-mailnaam niet bevatten",
    "pw.enter": "Vul een wachtwoord in.",
    "pw.mismatch": "Wachtwoorden komen niet overeen.",
    "pw.meetAll": "Voldoe aan alle eisen hieronder.",
    "pw.alsoMeet": "Voldoe ook aan alle eisen hieronder.",

    "settings.eyebrow": "Je account",
    "settings.title": "Instellingen",
    "settings.lead": "Wijzig je naam, taal, eenheden en wachtwoord.",
    "settings.profileEyebrow": "Profiel",
    "settings.nameTitle": "Naam",
    "settings.nameHelp": "Zo verschijn je in de app.",
    "settings.nameLabel": "Naam",
    "settings.namePlaceholder": "Jouw naam",
    "settings.saveName": "Naam opslaan",
    "settings.prefsEyebrow": "Voorkeuren",
    "settings.languageTitle": "Taal",
    "settings.languageHelp": "App-taal voor menu's en labels.",
    "settings.saveLanguage": "Taal opslaan",
    "settings.unitsTitle": "Eenheden",
    "settings.unitsHelp": "Afstanden en krachtgewichten in de app.",
    "settings.saveUnits": "Eenheden opslaan",
    "settings.securityEyebrow": "Beveiliging",
    "settings.passwordTitle": "Wachtwoord",
    "settings.passwordHelp": "Kies een nieuw wachtwoord voor dit account.",
    "settings.currentPassword": "Huidig wachtwoord",
    "settings.newPassword": "Nieuw wachtwoord",
    "settings.confirmNewPassword": "Bevestig nieuw wachtwoord",
    "settings.changePassword": "Wachtwoord wijzigen",
    "settings.unitsMetric": "Metrisch (km, kg)",
    "settings.unitsImperial": "Mijl & lb",
    "settings.langEn": "English",
    "settings.langNl": "Nederlands",
    "settings.toastName": "Naam opgeslagen.",
    "settings.toastUnitsMetric": "Km en kg worden gebruikt.",
    "settings.toastUnitsImperial": "Mijl en lb worden gebruikt.",
    "settings.toastLanguage": "Taal bijgewerkt.",
    "settings.passwordUpdated": "Wachtwoord bijgewerkt.",
    "settings.enterCurrentPassword": "Vul je huidige wachtwoord in.",
    "settings.checkNewPassword": "Controleer je nieuwe wachtwoord.",
    "settings.signInAgain": "Log opnieuw in en wijzig daarna je wachtwoord.",
    "settings.currentIncorrect": "Huidig wachtwoord is onjuist.",

    "profile.eyebrow": "Jouw profiel",
    "profile.title": "Jouw profiel",
    "profile.unitsBefore": "Nu {units}. Wijzig hieronder of in",
    "profile.settingsLink": "Instellingen",

    "username.enter": "Vul je naam in.",
    "username.length": "2–40 tekens.",
    "username.chars": "Gebruik letters, spaties, koppeltekens of apostroffen — bv. Jane Doe.",
    "username.taken": "Die naam is al in gebruik.",

    "sport.run": "Hardlopen",
    "sport.swim": "Zwemmen",
    "sport.bike": "Fietsen",
    "sport.walk": "Wandelen",
    "sport.triathlon": "Triatlon",
    "common.busy": "Bezet",
    "common.connected": "Verbonden",
    "common.notConnected": "Niet verbonden",
    "common.sync": "Sync",
    "common.disconnect": "Ontkoppelen",
    "common.previous": "Vorige",
    "common.next": "Volgende",
    "common.all": "Alles",
    "common.close": "Sluiten",

    "day.done": "Gedaan",
    "day.notLogged": "Niet gelogd",
    "day.viewActivity": "Bekijk activiteit",
    "day.viewSession": "Bekijk sessie",
    "day.howTo": "Hoe doe je deze sessie",
    "day.viewDay": "Bekijk dag",
    "day.noTraining": "Geen training vandaag",
    "day.nothingLogged": "Niets gelogd",
    "day.noSessionYet": "Nog geen sessie",
    "day.recovery": "Herstel",
    "day.matched": "Match",
    "day.unmatched": "Extra",
    "day.unmatchedHint": "Gelogd, maar niet de beste match voor de geplande sessie",
    "day.matchHigh": "Sterke match (sport en afstand)",
    "day.matchMedium": "Waarschijnlijke match",
    "day.matchLow": "Zelfde sport — zwakke afstand/tijd-fit",
    "day.extraLogged": "ook andere sessies gelogd",
    "day.noPlanMatch": "Niets hier lijkt op de geplande sessie",

    "home.today": "Vandaag · {date}",
    "home.viewingWeek": " · week {week} bekijken",
    "home.noPlan": "Nog geen plan",
    "home.noPlanLead": "Start een plan wanneer je klaar bent. Importeer een CSV voor deze week, of voeg een openbaar evenement toe aan je agenda.",
    "home.startPlan": "Plan starten",
    "home.emptyCard": "Nog niets te tonen. Open een dag om een sessie te loggen, importeer een Garmin-CSV, of start een plan.",
    "home.actsUpTo": "Activiteiten tot {date}.",
    "home.seeAll": "Alles bekijken",
    "home.logOrImport": "Log een sessie vanaf een dag, of importeer een Garmin-CSV.",
    "home.openDayOrImport": "Open een dag om hem af te vinken, of importeer een Garmin Connect Activities.csv.",
    "home.weekOf": "Week {week} van {total}",
    "home.daysTo": "dagen tot {event}",
    "home.viewEvent": "Bekijk {event}",
    "home.changesOne": "1 planwijziging wacht op de AI-coach",
    "home.changesMany": "{count} planwijzigingen wachten op de AI-coach",
    "home.changesReview": "Bekijk en verstuur ze via de pagina Volledig plan →",
    "home.prevWeek": "← Vorige week",
    "home.nextWeek": "Volgende week →",
    "home.thisWeek": "Deze week",
    "home.lastWeek": "Vorige week",
    "home.nextWeekLabel": "Volgende week",
    "home.selectedWeek": "Gekozen week",
    "home.followingWeek": "Volgende week",
    "home.seeFullPlan": "Bekijk het volledige plan tot racedag →",
    "home.weekTitle": "Week {week} · {range}",
    "home.targetRun": "Loop",
    "home.targetLong": "Lang",
    "home.loggedRun": "Gelogde loop {unit}:",
    "home.thisWeekReview": "Deze week · review",
    "home.upcomingEvents": "Komende evenementen",
    "home.addEvent": "+ Evenement toevoegen",

    "plan.weeksRange": "{weeks} weken · {start} → {end}",
    "plan.fullTitle": "Volledig {event}-plan",
    "plan.leadRun": "De lange duurloop is de sleutelsessie. Bij vermoeidheid: houd die en schrap een rustige loop. Weekbelasting stijgt ongeveer 10%, met elke vierde week een cutback.",
    "plan.leadTri": "Triatlonstructuur: langere aërobe basis, daarna opbouw met racespecifiek werk en bike→run bricks, dan een scherpere taper. Bij vermoeidheid: schrap eerst extras, bescherm de lange rit en key brick. Ongeveer 10% belastingstijging per week, cutback elke vierde week.",
    "plan.leadOther": "De sleutelsessie wint elk conflict. Bij vermoeidheid: schrap eerst de extra sport, dan makkelijke km. Ongeveer 10% belastingstijging per week, met elke vierde week een cutback.",
    "plan.remove": "Plan verwijderen",
    "plan.youAreHere": "Je bent hier",
    "plan.weekFeedback": "Weekfeedback",
    "plan.paceGuide": "Tempogids",
    "plan.effort": "Inspanning",
    "plan.pace": "Tempo / {unit}",
    "plan.use": "Gebruik",
    "plan.paceNote": "Houd makkelijke dagen makkelijk. Bewaar race-inspanning voor het evenement en korte kwaliteitssessies. Volg schoenen, fietsen, zwemkit en krachtmateriaal op de Materiaal-pagina.",
    "plan.paceNoteLink": "Materiaal-pagina",
    "plan.research": "Onderzoek achter dit plan",
    "plan.load": "Belasting",
    "plan.weeklyRun": "Wekelijkse loop {unit}",
    "plan.progressReport": "Voortgangsrapport",
    "plan.weekly": "Week",
    "plan.long": "Lang",
    "plan.progress": "Voortgang",
    "plan.notStarted": "niet gestart",
    "plan.weekN": "Week {week}",

    "act.log": "Logboek",
    "act.allTitle": "Alle activiteiten",
    "act.sportTitle": "{sport}-activiteiten",
    "act.sessionsIn": "{count} sessie in {year}",
    "act.sessionsInPlural": "{count} sessies in {year}",
    "act.noSportInYear": "Geen {sport}-sessies in {year}.",
    "act.nothingInYear": "Niets gelogd in {year}. Kies een ander jaar, of log een sessie.",
    "act.nothingYet": "Nog niets gelogd. Log een sessie, of importeer een Garmin-CSV.",
    "act.logSession": "Sessie loggen",
    "act.logged": "{unit} gelogd",
    "act.noSessionsInYear": "Geen sessies in {year}.",
    "act.weeklyVolume": "Wekelijks volume",
    "act.sportByWeek": "{sport} {unit} per week",

    "gear.inventory": "Inventaris",
    "gear.title": "Materiaal & krachtkit",
    "gear.lead": "Volg schoenen, fietsen en zwemkit voor activiteiten, plus thuis- of gymmateriaal zodat krachtsessies passen bij wat je hebt. Strava-sync kan schoenen of fietsen koppelen aan activiteiten zonder materiaal.",
    "gear.add": "+ Materiaal toevoegen",
    "gear.noEndurance": "Nog geen actief duurvermogenmateriaal.",
    "gear.retired": "Afgeschreven materiaal",
    "gear.retiredHint": "Bewaard voor geschiedenis op eerdere activiteiten. Haal uit afschrijving om opnieuw te gebruiken.",
    "gear.strengthEyebrow": "Kracht",
    "gear.strengthTitle": "Waarmee kun je trainen?",
    "gear.strengthLead": "Gelogde kit bepaalt krachtsessies en planaanbevelingen. Eigen lichaamsgewicht werkt altijd; een kettlebell of gymlidmaatschap opent belaste oefeningen.",
    "gear.current": "Nu",

    "conn.eyebrow": "Jouw profiel",
    "conn.title": "Koppelingen",
    "conn.lead": "Koppel apparaten en diensten zodat activiteiten in je plan kunnen synchroniseren.",
    "conn.device": "Apparaat",
    "conn.service": "Dienst",
    "conn.csvFootnote": "CSV-import blijft beschikbaar via de uploadknop in de bovenbalk.",
    "conn.garminLead": "Gebruik je eigen Garmin Personal API-sleutel. Sync haalt activiteiten, hartslagzones, drempel, VO2 wanneer Garmin die deelt, plus slaap, Body Battery, stress en HRV voor de herstelscore van de training van vandaag. Schoenen, fietsen of zwemkit uit Garmin worden gekoppeld wanneer een activiteit nog geen materiaal heeft.",
    "conn.replaceKey": "API-sleutel vervangen",
    "conn.newKey": "Nieuwe Personal API-sleutel",
    "conn.keyPlaceholder": "Plak sleutel uit Garmin Connect",
    "conn.saveKey": "Sleutel opslaan",
    "conn.apiKey": "Personal API-sleutel",
    "conn.garminKeyHelp": "Maak een sleutel aan bij Garmin Connect → Personal API (eenmalig zichtbaar; behandel als wachtwoord).",
    "conn.saveConnect": "Opslaan & verbinden",
    "conn.stravaLead": "Compatibel met Strava. Activiteiten op je eigen account, ook van een horloge, worden voor je plan bewaard en alleen aan jou getoond. Ontkoppelen verwijdert ze uit deze app.",
    "conn.stravaShare": "Stuur Strava-sessiesamenvattingen (datum, sport, afstand, tempo, hartslag) naar de AI-coach. Laat dit uit staan en die sessies blijven alleen in je logboek.",
    "conn.stravaShareAlso": "Stuur ook Strava-sessiesamenvattingen (datum, sport, afstand, tempo, hartslag) naar de AI-coach. Laat dit uit staan en die sessies blijven alleen in je logboek.",
    "conn.passcode": "Verbindingscode",
    "conn.passcodePlaceholder": "Code van de app-eigenaar",
    "conn.stravaHelp": "Je Strava-login gebeurt op Strava. Een nieuwe Strava API-app kan één atleet verbinden tot de app-eigenaar die limiet verhoogt in de API-instellingen van Strava.",

    "progress.title": "Voortgangsrapport",
    "progress.back": "Terug naar plan",
    "progress.askAgain": "Vraag de coach opnieuw",
    "progress.writing": "Schrijven…",
    "progress.noPlan": "Nog geen plan",
    "progress.eventDone": "{event} is voorbij",
    "progress.weekOf": "Week {week} van {total} · {phase}",
    "progress.startsIn": "Start over {days} dagen",
    "progress.daysToRace": " · {days} dagen tot de race",
    "progress.updating": "Rapport bijwerken…",
    "progress.writingFresh": "De coach schrijft een voortgangsrapport op basis van je plan en sessies.",
    "progress.stale": "Dit is geschreven in week {week}. Vraag opnieuw voor een update.",
    "progress.coachNote": "Coachnotitie · {when}",

    "coach.eyebrow": "AI-coach",
    "coach.planChanges": "Planwijzigingen",
    "coach.send": "Naar AI-coach sturen",
    "coach.reviewing": "Bezig",
    "coach.sentReviewing": "Verstuurd naar de AI-coach. Deze wijzigingen worden nu bekeken. Het plan wordt bijgewerkt als dat klaar is.",
    "coach.sendHint": "Klik op Naar AI-coach sturen; de review gaat als verzoek de deur uit. Het plan wordt bijgewerkt als dat klaar is. Faseweken doen dit automatisch.",
    "coach.sentNow": "Verstuurd naar de AI-coach. Nu aan het bekijken. Het plan wordt bijgewerkt als dat klaar is.",
    "coach.nonePending": "Geen openstaande wijzigingen. Bezetting, nieuwe evenementen en CSV-imports verschijnen hier automatisch.",
    "coach.appliedOne": " 1 eerdere wijziging is toegepast.",
    "coach.appliedMany": " {count} eerdere wijzigingen zijn toegepast.",
    "coach.addNote": "Notitie toevoegen",
    "coach.notePlaceholder": "Nog iets voor de coach? bv. zure kuit, vakantie 20–27 dec, wil een 10K in januari",
    "coach.removeFromList": "Uit lijst verwijderen",

    "setup.step1": "Stap 1 van 2",
    "setup.step2": "Stap 2 van 2",
    "setup.welcome": "Welkom",
    "setup.accountTitle": "Account instellen",
    "setup.accountLead": "Kies een naam en eenheden, en koppel Garmin of Strava als je wilt dat eerdere training je eerste plan mee vormt.",
    "setup.name": "Naam",
    "setup.namePlaceholder": "bv. Jane Doe",
    "setup.units": "Eenheden",
    "setup.unitsHint": "Voorgesteld op basis van je locatie — wijzig wanneer je wilt in Instellingen.",
    "setup.connectOptional": "Koppel een bron",
    "setup.optional": "(optioneel)",
    "setup.checking": "Koppelingen controleren…",
    "setup.continue": "Doorgaan",
    "setup.createPlan": "Plan maken",
    "setup.newPlan": "Nieuw plan",
    "setup.whatFor": "Waarvoor train je?",
    "setup.goal": "Doel",
    "setup.goalRace": "Een wedstrijd",
    "setup.goalTime": "Een tijdsdoel",
    "setup.goalFitness": "Algemene fitness",
    "setup.eventType": "Type evenement",
    "setup.searchEvents": "Zoek openbare evenementen",
    "setup.addOwnEvent": "Eigen evenement toevoegen",
    "setup.backToSearch": "Terug naar zoeken",
    "setup.syncing": "Activiteiten synchroniseren… wekelijks volume wordt ingevuld als het klaar is.",
    "setup.pickSport": "Kies eerst een sport.",
    "sport.runFull": "Hardlopen",
    "sport.swimFull": "Zwemmen",
    "sport.bikeFull": "Fietsen",
    "sport.triathlonFull": "Triatlon",
  };

  const catalogs = { en, nl };
  let currentLang = "en";

  function normalizeLang(raw) {
    const base = String(raw || "").trim().toLowerCase().split(/[-_]/)[0];
    return SUPPORTED.includes(base) ? base : "en";
  }

  function guessLangFromNavigator() {
    try {
      const list = navigator.languages?.length
        ? [...navigator.languages]
        : [navigator.language];
      for (const entry of list) {
        const lang = normalizeLang(entry);
        if (SUPPORTED.includes(lang)) return lang;
      }
    } catch { /* ignore */ }
    return "en";
  }

  function readStoredLang() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return normalizeLang(stored);
    } catch { /* ignore */ }
    return "";
  }

  function writeStoredLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch { /* ignore */ }
  }

  function t(key, vars) {
    const table = catalogs[currentLang] || catalogs.en;
    let text = table[key] ?? catalogs.en[key] ?? key;
    if (vars && typeof vars === "object") {
      text = String(text).replace(/\{(\w+)\}/g, (_, name) => (
        vars[name] == null ? `{${name}}` : String(vars[name])
      ));
    }
    return text;
  }

  function localeTag(lang = currentLang) {
    return LOCALE_TAG[normalizeLang(lang)] || LOCALE_TAG.en;
  }

  function applyDomI18n(root) {
    const scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope?.querySelectorAll) return;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.title = t(el.getAttribute("data-i18n-title"));
    });
    scope.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
  }

  function setDocumentLang(lang) {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }

  function setLanguage(raw, { persist = true, silent = false } = {}) {
    const lang = normalizeLang(raw);
    const changed = lang !== currentLang;
    currentLang = lang;
    if (persist) writeStoredLang(lang);
    setDocumentLang(lang);
    applyDomI18n();
    if (!silent && changed) {
      window.dispatchEvent(new CustomEvent("tp:languagechange", { detail: { language: lang } }));
    }
    return lang;
  }

  function initLanguage() {
    const stored = readStoredLang();
    const initial = stored || guessLangFromNavigator();
    return setLanguage(initial, { persist: Boolean(stored), silent: true });
  }

  function languageChoiceRow(selected = currentLang) {
    const lang = normalizeLang(selected);
    return `
    <div class="choice-row language-choice">
      <button class="choice-btn${lang === "en" ? " is-on" : ""}" type="button" data-lang="en">${t("settings.langEn")}</button>
      <button class="choice-btn${lang === "nl" ? " is-on" : ""}" type="button" data-lang="nl">${t("settings.langNl")}</button>
    </div>
    <input type="hidden" name="language" value="${lang}" />`;
  }

  function dayNames() {
    return [t("day.mon"), t("day.tue"), t("day.wed"), t("day.thu"), t("day.fri"), t("day.sat"), t("day.sun")];
  }

  function dayName(i) {
    return dayNames()[((Number(i) % 7) + 7) % 7];
  }

  function kindLabel(kind) {
    const key = `kind.${kind}`;
    const value = t(key);
    return value === key ? String(kind || "") : value;
  }

  // Boot before other scripts paint UI.
  initLanguage();

  window.I18N = {
    SUPPORTED,
    t,
    setLanguage,
    initLanguage,
    applyDomI18n,
    normalizeLang,
    guessLangFromNavigator,
    languageChoiceRow,
    localeTag,
    dayNames,
    dayName,
    kindLabel,
    get language() { return currentLang; },
  };
  window.t = t;
  window.setLanguage = setLanguage;
  window.applyDomI18n = applyDomI18n;
  window.languageChoiceRow = languageChoiceRow;
  window.localeTag = localeTag;
  window.dayNames = dayNames;
  window.dayName = dayName;
  window.kindLabel = kindLabel;
})();
