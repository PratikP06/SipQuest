const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

function activate(context) {
  let timeInterval = null;
  let nextReminderAt = null;
  let sipCount = context.globalState.get("sipCount", 0);
  let totalSips = context.globalState.get("totalSips", 0);
  let xp = context.globalState.get("xp", 0);
  let level = context.globalState.get("level", 1);
  let streak = context.globalState.get("streak", 0);
  let maxStreak = context.globalState.get("maxStreak", 0);
  let lastActiveDate = context.globalState.get("lastActiveDate", "");
  let unlockedAchievements = new Set(
    context.globalState.get("unlockedAchievements", [])
  );
  let earlySipCount = context.globalState.get("earlySipCount", 0);
  let nightSipCount = context.globalState.get("nightSipCount", 0);
  let totalSnoozes = context.globalState.get("totalSnoozes", 0);
  let snoozedToday = context.globalState.get("snoozedToday", false);
  let snoozeFreeStreak = context.globalState.get("snoozeFreeStreak", 0);
  const XP_PER_SIP = 10;

  // --- Startup date check ---
  const savedDate = context.globalState.get("sipDate", "");
  const today = new Date().toDateString();
  if (savedDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (lastActiveDate !== yesterday && lastActiveDate !== today) {
      streak = 0;
      context.globalState.update("streak", 0);
    }
    sipCount = 0;
    context.globalState.update("sipCount", 0);
    context.globalState.update("sipDate", today);
  }

  // --- Achievements list ---
  const ACHIEVEMENTS = [
    { id: "first_drop",        label: "Oceanus",              desc: "Drink your first sip",        check: () => totalSips >= 1 },
    { id: "hydration_starter", label: "Pontus",               desc: "10 total sips",               check: () => totalSips >= 10 },
    { id: "century",           label: "Nereus",               desc: "100 total sips",              check: () => totalSips >= 100 },
    { id: "hydration_hero",    label: "Tethys",               desc: "500 total sips",              check: () => totalSips >= 500 },
    { id: "water_legend",      label: "Amphitrite",           desc: "1000 total sips",             check: () => totalSips >= 1000 },
    { id: "on_a_roll",         label: "Tidecaller",           desc: "3 day streak",                check: () => maxStreak >= 3 },
    { id: "week_warrior",      label: "Riverkeeper",          desc: "7 day streak",                check: () => maxStreak >= 7 },
    { id: "unstoppable",       label: "Stormbringer",         desc: "30 day streak",               check: () => maxStreak >= 30 },
    { id: "hydration_machine", label: "Leviathan",            desc: "100 day streak",              check: () => maxStreak >= 100 },
    { id: "eternal_tide",      label: "Worldspring",          desc: "365 day streak",              check: () => maxStreak >= 365 },
    { id: "newcomer",          label: "Springwater Disciple", desc: "Reach Level 5",               check: () => level >= 5 },
    { id: "veteran",           label: "Tidewalker",           desc: "Reach Level 10",              check: () => level >= 10 },
    { id: "elite",             label: "Abyss Wanderer",       desc: "Reach Level 25",              check: () => level >= 25 },
    { id: "legendary",         label: "Avatar of the Deep",   desc: "Reach Level 50",              check: () => level >= 50 },
    { id: "mythic",            label: "Worldsea Sovereign",   desc: "Reach Level 100",             check: () => level >= 100 },
    { id: "early_bird_1",      label: "Dawnsipper",           desc: "Drink before 9am, once",      check: () => earlySipCount >= 1 },
    { id: "early_bird_2",      label: "Sunrise Adept",        desc: "Drink before 9am, 10 times",  check: () => earlySipCount >= 10 },
    { id: "early_bird_3",      label: "First Light Sage",     desc: "Drink before 9am, 50 times",  check: () => earlySipCount >= 50 },
    { id: "night_owl_1",       label: "Moonwell Drinker",     desc: "Drink after 10pm, once",      check: () => nightSipCount >= 1 },
    { id: "night_owl_2",       label: "Nocturne Keeper",      desc: "Drink after 10pm, 10 times",  check: () => nightSipCount >= 10 },
    { id: "night_owl_3",       label: "Starlit Hydromancer",  desc: "Drink after 10pm, 50 times",  check: () => nightSipCount >= 50 },
    { id: "no_snooze_day",     label: "Unwavering",           desc: "Complete a day without snoozing", check: () => snoozeFreeStreak >= 1 },
    { id: "no_snooze_3",       label: "Steadfast Tide",       desc: "3 day snooze-free streak",        check: () => snoozeFreeStreak >= 3 },
    { id: "no_snooze_7",       label: "Iron Current",         desc: "7 day snooze-free streak",        check: () => snoozeFreeStreak >= 7 },
    { id: "snooze_5",          label: "The Procrastinator",   desc: "Snooze 5 times total",            check: () => totalSnoozes >= 5 },
    { id: "snooze_25",         label: "Tide Resistant",       desc: "Snooze 25 times total",           check: () => totalSnoozes >= 25 },
    { id: "sips_2000",         label: "Deluge Bearer",        desc: "2000 total sips",             check: () => totalSips >= 2000 },
    { id: "sips_5000",         label: "Endless Current",      desc: "5000 total sips",             check: () => totalSips >= 5000 },
    { id: "sips_10000",        label: "Wellspring Eternal",   desc: "10,000 total sips",           check: () => totalSips >= 10000 },
    { id: "sips_25000",        label: "Source of All Rivers", desc: "25,000 total sips",           check: () => totalSips >= 25000 },
  ];

  function checkAchievements() {
    ACHIEVEMENTS.forEach((achievement) => {
      if (!unlockedAchievements.has(achievement.id) && achievement.check()) {
        unlockedAchievements.add(achievement.id);
        context.globalState.update("unlockedAchievements", Array.from(unlockedAchievements));
        vscode.window.showInformationMessage(
          `Achievement Unlocked: ${achievement.label}. ${achievement.desc}`
        );
      }
    });
  }

  function updateTimeOfDayTracking() {
    const hour = new Date().getHours();
    if (hour < 9) {
      earlySipCount++;
      context.globalState.update("earlySipCount", earlySipCount);
    }
    if (hour >= 22) {
      nightSipCount++;
      context.globalState.update("nightSipCount", nightSipCount);
    }
  }

  function xpForLevel(lvl) {
    return Math.floor(50 * Math.pow(lvl, 1.4));
  }

  function updateStreak() {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    if (lastActiveDate === today) {
      return;
    } else if (lastActiveDate === yesterday) {
      streak++;
    } else {
      streak = 1;
    }

    if (streak > maxStreak) {
      maxStreak = streak;
      context.globalState.update("maxStreak", maxStreak);
    }

    lastActiveDate = today;
    context.globalState.update("streak", streak);
    context.globalState.update("lastActiveDate", today);
  }

  function addXP(xp = 10) {
    xp += xp ?? XP_PER_SIP;
    context.globalState.update("xp", xp);

    if (xp >= xpForLevel(level)) {
      level++;
      context.globalState.update("level", level);
      vscode.window.showInformationMessage(`Level up! You're now Level ${level}!`);
      checkAchievements();
    }

    const currentLevelXp = xpForLevel(level - 1);
    const nextLevelXp = xpForLevel(level);
    const progress = Math.floor(
      ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100
    );

    updateStatusBar();
    return progress;
  }

  // --- reads from package.json's "hydrate.reminderInterval" / "hydrate.reminderMessage" ---
  function getIntervalMs() {
    const config = vscode.workspace.getConfiguration("hydrate");
    const minutes = config.get("reminderInterval");
    if (!minutes || minutes < 1) {
      vscode.window.showWarningMessage("Hydrate: Invalid interval! Defaulting to 60 minutes.");
      return 60 * 60 * 1000;
    }
    return minutes * 60 * 1000;
  }

  function getIntervalMsg() {
    const config = vscode.workspace.getConfiguration("hydrate");
    const msg = config.get("reminderMessage");
    if (!msg || msg.trim() === "") return "Time to hydrate!";
    return msg;
  }

  // --- Status Bar ---
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = "$(clockface) --:--";
  statusBar.tooltip = "Hydrate — click to open dashboard";
  statusBar.command = "hydrate.showStats";
  statusBar.show();

  function updateStatusBar() {
    if (nextReminderAt) {
      const remaining = nextReminderAt - Date.now();
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      statusBar.text = `$(clockface) ${minutes}:${seconds.toString().padStart(2, "0")}`;
    } else {
      statusBar.text = "$(clockface) --:--";
    }
  }

  const countdownTick = setInterval(() => { updateStatusBar(); }, 1000);

  // --- matches package.json's declared config keys exactly ---
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration("hydrate.reminderInterval") ||
      e.affectsConfiguration("hydrate.reminderMessage")
    ) {
      stopInterval();
      startInterval();
      vscode.window.showInformationMessage("Settings updated successfully");
      sendStatsToWebview();
    }
  });

  function startInterval() {
    nextReminderAt = Date.now() + getIntervalMs();

    timeInterval = setInterval(() => {
      nextReminderAt = Date.now() + getIntervalMs();

      vscode.window
        .showInformationMessage(getIntervalMsg(), "Done", "Snooze")
        .then((selection) => {
          if (selection == "Done") {
            const isFirstSipToday = sipCount === 0;

            sipCount++;
            totalSips++;
            context.globalState.update("sipCount", sipCount);
            context.globalState.update("totalSips", totalSips);
            context.globalState.update("sipDate", new Date().toDateString());

            updateTimeOfDayTracking();
            updateStreak();
            checkAchievements();
            addXP();

            vscode.window.showInformationMessage(`${XP_PER_SIP} XP gained`);
            if (isFirstSipToday) {
              vscode.window.showInformationMessage(`${streak} day streak`);
            }

            sendStatsToWebview();
          } else if (selection == "Snooze") {
            stopInterval();

            snoozedToday = true;
            context.globalState.update("snoozedToday", true);
            totalSnoozes++;
            context.globalState.update("totalSnoozes", totalSnoozes);
            checkAchievements();

            vscode.window
              .showQuickPick(
                [
                  { label: "15 minutes", ms: 15 * 60 * 1000 },
                  { label: "30 minutes", ms: 30 * 60 * 1000 },
                  { label: "45 minutes", ms: 45 * 60 * 1000 },
                ],
                { placeHolder: "Snooze for how long?" }
              )
              .then((choice) => {
                if (choice) {
                  nextReminderAt = Date.now() + choice.ms;
                  setTimeout(() => startInterval(), choice.ms);
                } else {
                  startInterval();
                }
                sendStatsToWebview();
              });
          }
        });

      console.log("notification sent");
    }, getIntervalMs());
  }

  function stopInterval() {
    if (timeInterval) {
      clearInterval(timeInterval);
      timeInterval = null;
    }
  }

  function scheduleMidnightReset() {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight - Date.now();

    setTimeout(() => {
      if (sipCount === 0) {
        streak = 0;
        context.globalState.update("streak", 0);
      }

      if (sipCount > 0) {
        if (!snoozedToday) {
          snoozeFreeStreak++;
        } else {
          snoozeFreeStreak = 0;
        }
        context.globalState.update("snoozeFreeStreak", snoozeFreeStreak);
        checkAchievements();
      }

      snoozedToday = false;
      context.globalState.update("snoozedToday", false);
      sipCount = 0;
      context.globalState.update("sipCount", 0);
      vscode.window.showInformationMessage("New day! Hydration count reset.");
      sendStatsToWebview();
      scheduleMidnightReset();
    }, msUntilMidnight);
  }

  scheduleMidnightReset();
  startInterval();

  // ═══════════════════════════════════════════════════
  //  WEBVIEW PANEL
  // ═══════════════════════════════════════════════════

  let panel = null;

  function sendStatsToWebview(showAll = false) {
    if (!panel) return;

    const currentLevelXp = xpForLevel(level - 1);
    const nextLevelXp = xpForLevel(level);
    const progress = Math.floor(
      ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100
    );

    panel.webview.postMessage({
      command: "updateStats",
      data: {
        sipCount,
        streak,
        level,
        xp,
        progress,
        nextLevelXp,
        achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, label: a.label, desc: a.desc })),
        unlocked: Array.from(unlockedAchievements),
        showAll,
        isRunning: timeInterval !== null,
      },
    });
  }

  function getWebviewContent(webview) {
    const htmlPath = path.join(context.extensionPath, "webview.html");
    const cssPath  = path.join(context.extensionPath, "webview.css");
    const iconPath = path.join(context.extensionPath, "icon.png");

    const cssUri  = webview.asWebviewUri(vscode.Uri.file(cssPath));
    const iconUri = webview.asWebviewUri(vscode.Uri.file(iconPath));

    let html = fs.readFileSync(htmlPath, "utf8");
    html = html.replace("{{CSS_URI}}",  cssUri.toString());
    html = html.replace("{{ICON_URI}}", iconUri.toString());

    return html;
  }

  const showStatsCommand = vscode.commands.registerCommand(
    "hydrate.showStats",
    function () {
      if (panel) {
        panel.reveal(vscode.ViewColumn.Two);
        sendStatsToWebview();
        return;
      }

      panel = vscode.window.createWebviewPanel(
        "hydrate",
        "Hydrate",
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(context.extensionPath)],
        }
      );

      panel.webview.html = getWebviewContent(panel.webview);

      panel.webview.onDidReceiveMessage((msg) => {
        if (msg.command === "ready")               sendStatsToWebview();
        if (msg.command === "showAllAchievements") sendStatsToWebview(true);
        if (msg.command === "pauseReminders") {
          stopInterval();
          nextReminderAt = null;
          updateStatusBar();
          sendStatsToWebview();
        }
        if (msg.command === "resumeReminders") {
          stopInterval();
          startInterval();
          sendStatsToWebview();
        }
        if (msg.command === "setInterval") {
          vscode.commands.executeCommand("workbench.action.openSettings", "hydrate.reminderInterval");
        }
      });

      panel.onDidDispose(() => { panel = null; });
    }
  );

  // ═══════════════════════════════════════════════════
  //  OTHER COMMANDS
  // ═══════════════════════════════════════════════════

  const startCommand = vscode.commands.registerCommand("hydrate.start", function () {
    stopInterval();
    startInterval();
    vscode.window.showInformationMessage("Hydrate: Reminders started");
    sendStatsToWebview();
  });

  const stopCommand = vscode.commands.registerCommand("hydrate.stop", function () {
    stopInterval();
    nextReminderAt = null;
    updateStatusBar();
    vscode.window.showInformationMessage("Hydrate: Reminders stopped");
    sendStatsToWebview();
  });

  const resetCommand = vscode.commands.registerCommand("hydrate.reset", function () {
    stopInterval();
    startInterval();
    vscode.window.showInformationMessage("Hydrate: Timer reset");
    sendStatsToWebview();
  });

  const showAchievementsCommand = vscode.commands.registerCommand(
    "hydrate.showAchievements",
    function () {
      const items = ACHIEVEMENTS.map((a) => ({
        label: unlockedAchievements.has(a.id) ? a.label : `$(lock) ${a.desc}`,
        description: unlockedAchievements.has(a.id) ? "Unlocked" : "Locked",
      }));

      vscode.window.showQuickPick(items, {
        placeHolder: `Achievements — ${unlockedAchievements.size}/${ACHIEVEMENTS.length} unlocked`,
        canPickMany: false,
      });
    }
  );

  context.subscriptions.push(
    startCommand,
    stopCommand,
    resetCommand,
    showStatsCommand,
    showAchievementsCommand,
    statusBar,
    { dispose: () => clearInterval(countdownTick) },
    { dispose: () => stopInterval() }
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
