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

  // --- Achievements list (no emoji — plain text labels) ---
  const ACHIEVEMENTS = [
    // sip based
    { id: "first_drop",        label: "First Drop",        desc: "Drink your first sip", check: () => totalSips >= 1 },
    { id: "hydration_starter", label: "Hydration Starter", desc: "10 total sips",        check: () => totalSips >= 10 },
    { id: "century",           label: "Century",            desc: "100 total sips",       check: () => totalSips >= 100 },
    { id: "hydration_hero",    label: "Hydration Hero",     desc: "500 total sips",       check: () => totalSips >= 500 },
    { id: "water_legend",      label: "Water Legend",       desc: "1000 total sips",      check: () => totalSips >= 1000 },

    // streak based
    { id: "on_a_roll",         label: "On a Roll",          desc: "3 day streak",         check: () => maxStreak >= 3 },
    { id: "week_warrior",      label: "Week Warrior",       desc: "7 day streak",         check: () => maxStreak >= 7 },
    { id: "unstoppable",       label: "Unstoppable",        desc: "30 day streak",        check: () => maxStreak >= 30 },
    { id: "hydration_machine", label: "Hydration Machine",  desc: "100 day streak",       check: () => maxStreak >= 100 },

    // level based
    { id: "newcomer",          label: "Newcomer",           desc: "Reach Level 5",        check: () => level >= 5 },
    { id: "veteran",           label: "Hydration Veteran",  desc: "Reach Level 10",       check: () => level >= 10 },
    { id: "elite",             label: "Elite Sipper",       desc: "Reach Level 25",       check: () => level >= 25 },
    { id: "legendary",         label: "Legendary",          desc: "Reach Level 50",       check: () => level >= 50 },
  ];

  function checkAchievements() {
    ACHIEVEMENTS.forEach((achievement) => {
      if (!unlockedAchievements.has(achievement.id) && achievement.check()) {
        unlockedAchievements.add(achievement.id);
        context.globalState.update(
          "unlockedAchievements",
          Array.from(unlockedAchievements)
        );
        // showInformationMessage only renders plain text — codicons don't work here
        vscode.window.showInformationMessage(
          `Achievement Unlocked: ${achievement.label}. ${achievement.desc}`
        );
      }
    });
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

  function addXP() {
    xp += XP_PER_SIP;
    context.globalState.update("xp", xp);

    if (xp >= xpForLevel(level)) {
      level++;
      context.globalState.update("level", level);
      vscode.window.showInformationMessage(
        `Level up! You're now Level ${level}!`
      );
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

  function getIntervalMs() {
    const config = vscode.workspace.getConfiguration("siptracker");
    const minutes = config.get("sipInterval");

    // if (!minutes || minutes < 1) {
    //   vscode.window.showWarningMessage(
    //     "Sip Tracker: Invalid interval! Setting to 60 minutes."
    //   );
    //   return 60 * 60 * 1000;
    // }

    return minutes * 60 * 1000;
  }

  function getIntervalMsg() {
    const config = vscode.workspace.getConfiguration("siptracker");
    const msg = config.get("sipMsg");
    if (!msg || msg.trim() === "") {
      return "Time to drink water!";
    }
    return msg;
  }

  // --- Status Bar ---
  // Shows ONLY the countdown to the next reminder. Nothing else lives here —
  // level, streak, and achievements moved entirely into the Webview panel.
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.text = "$(flame) --:--";
  statusBar.tooltip = "Sip Tracker — click to open dashboard";
  statusBar.command = "siptracker.showStats";
  statusBar.show();

  function updateStatusBar() {
    if (nextReminderAt) {
      const remaining = nextReminderAt - Date.now();
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      statusBar.text = `$(flame) ${minutes}:${seconds.toString().padStart(2, "0")}`;
    } else {
      statusBar.text = "$(flame) --:--";
    }
  }

  const countdownTick = setInterval(() => {
    updateStatusBar();
  }, 1000);

  // --- Config change listener ---
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration("siptracker.sipInterval") ||
      e.affectsConfiguration("siptracker.sipMsg")
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
            sipCount++;
            totalSips++;
            context.globalState.update("sipCount", sipCount);
            context.globalState.update("totalSips", totalSips);
            context.globalState.update("sipDate", new Date().toDateString());

            updateStreak();
            checkAchievements();

            const progress = addXP();
            vscode.window.showInformationMessage(
              `${XP_PER_SIP} XP earned. ${progress}% to Level ${level + 1}. ${streak} day streak.`
            );

            sendStatsToWebview();
          } else if (selection == "Snooze") {
            stopInterval();

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
      sipCount = 0;
      context.globalState.update("sipCount", 0);
      vscode.window.showInformationMessage("New day! Sip count reset.");
      sendStatsToWebview();
      scheduleMidnightReset();
    }, msUntilMidnight);
  }

  scheduleMidnightReset();
  startInterval();

  // ═══════════════════════════════════════════════════
  //  WEBVIEW PANEL
  // ═══════════════════════════════════════════════════

  let panel = null; // keep track of a single open panel

  /**
   * Builds the stats payload and posts it to the webview.
   * @param {boolean} showAll - whether to show all achievements
   */
  function sendStatsToWebview(showAll = false) {
    if (!panel) return; // panel is closed, nothing to do

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
        achievements: ACHIEVEMENTS.map((a) => ({
          id: a.id,
          label: a.label,
          desc: a.desc,
        })),
        unlocked: Array.from(unlockedAchievements),
        showAll,
        isRunning: timeInterval !== null,
      },
    });
  }

  /**
   * Reads webview.html from disk, injects the CSS webview URI,
   * and returns the final HTML string for the panel.
   */
  function getWebviewContent(webview) {
    const htmlPath = path.join(context.extensionPath, "webview.html");
    const cssPath = path.join(context.extensionPath, "webview.css");

    const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath));

    let html = fs.readFileSync(htmlPath, "utf8");
    html = html.replace("{{CSS_URI}}", cssUri.toString());

    return html;
  }

  // ── showStats command — opens or focuses the webview panel ──
  const showStatsCommand = vscode.commands.registerCommand(
    "siptracker.showStats",
    function () {
      if (panel) {
        panel.reveal(vscode.ViewColumn.Two);
        sendStatsToWebview();
        return;
      }

      panel = vscode.window.createWebviewPanel(
        "siptracker",
        "Sip Tracker",
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(context.extensionPath)],
        }
      );

      panel.webview.html = getWebviewContent(panel.webview);

      panel.webview.onDidReceiveMessage((msg) => {
        if (msg.command === "ready") {
          sendStatsToWebview();
        }
        if (msg.command === "showAllAchievements") {
          sendStatsToWebview(true);
        }
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
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "siptracker.sipInterval"
          );
        }
      });

      panel.onDidDispose(() => {
        panel = null;
      });
    }
  );

  // ═══════════════════════════════════════════════════
  //  OTHER COMMANDS
  // ═══════════════════════════════════════════════════

  const startCommand = vscode.commands.registerCommand(
    "siptracker.start",
    function () {
      stopInterval();
      startInterval();
      vscode.window.showInformationMessage("Reminder Started");
      sendStatsToWebview();
    }
  );

  const stopCommand = vscode.commands.registerCommand(
    "siptracker.stop",
    function () {
      stopInterval();
      nextReminderAt = null;
      updateStatusBar();
      vscode.window.showInformationMessage("Reminder stopped");
      sendStatsToWebview();
    }
  );

  const resetCommand = vscode.commands.registerCommand(
    "siptracker.reset",
    function () {
      stopInterval();
      startInterval();
      vscode.window.showInformationMessage("Reminder reset");
      sendStatsToWebview();
    }
  );

  const showAchievementsCommand = vscode.commands.registerCommand(
    "siptracker.showAchievements",
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