const vscode = require("vscode");

function activate(context) {
  let timeInterval = null;
  let nextReminderAt = null;
  let sipCount = context.globalState.get("sipCount", 0);
  let xp = context.globalState.get("xp", 0);
  let level = context.globalState.get("level", 1);

  const XP_PER_SIP = 10;

  function xpForLevel(lvl) {
    return Math.floor(50 * Math.pow(lvl, 1.4));
  }

  function addXP() {
    xp += XP_PER_SIP;
    context.globalState.update("xp", xp);

    if (xp >= xpForLevel(level)) {
      level++;
      context.globalState.update("level", level);
      vscode.window.showInformationMessage(
        `🎉 Level up! You're now Level ${level}!`
      );
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
      return "Time to drink water! 💧";
    }
    return msg;
  }

  // --- Status Bar ---
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.text = "💧 --:--";
  statusBar.tooltip = "Sip Tracker - Click for stats";
  statusBar.command = "siptracker.showStats";
  statusBar.show();

  function updateStatusBar() {
    if (nextReminderAt) {
      const remaining = nextReminderAt - Date.now();
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      statusBar.text = `💧 ${minutes}:${seconds.toString().padStart(2, "0")} | ⭐ Lvl ${level}`;
    }
  }

  const countdownTick = setInterval(() => {
    if (nextReminderAt) updateStatusBar();
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
            context.globalState.update("sipCount", sipCount);
            context.globalState.update("sipDate", new Date().toDateString());

            const progress = addXP();
            vscode.window.showInformationMessage(
              `💧 Nice! +${XP_PER_SIP} XP (${progress}% to Level ${level + 1})`
            );

          } else if (selection == "Snooze") {
            stopInterval();

            vscode.window
              .showQuickPick(
                [
                  { label: "⏱ 15 minutes", ms: 15 * 60 * 1000 },
                  { label: "⏱ 30 minutes", ms: 30 * 60 * 1000 },
                  { label: "⏱ 45 minutes", ms: 45 * 60 * 1000 },
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
      sipCount = 0;
      context.globalState.update("sipCount", 0);
      vscode.window.showInformationMessage("🌙 New day! Sip count reset.");
      scheduleMidnightReset();
    }, msUntilMidnight);
  }

  scheduleMidnightReset();
  startInterval();

  // --- Commands ---
  const startCommand = vscode.commands.registerCommand(
    "siptracker.start",
    function () {
      stopInterval();
      startInterval();
      vscode.window.showInformationMessage("Reminder Started");
    }
  );

  const stopCommand = vscode.commands.registerCommand(
    "siptracker.stop",
    function () {
      stopInterval();
      nextReminderAt = null;
      statusBar.text = "💧 --:--";
      vscode.window.showInformationMessage("Reminder stopped");
    }
  );

  const resetCommand = vscode.commands.registerCommand(
    "siptracker.reset",
    function () {
      stopInterval();
      startInterval();
      vscode.window.showInformationMessage("Reminder reset");
    }
  );

  const showStatsCommand = vscode.commands.registerCommand(
    "siptracker.showStats",
    function () {
      const remaining = nextReminderAt ? nextReminderAt - Date.now() : 0;
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      const currentLevelXp = xpForLevel(level - 1);
      const nextLevelXp = xpForLevel(level);
      const progress = Math.floor(
        ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100
      );

      vscode.window.showInformationMessage(
        `💧 Next sip in: ${minutes}:${seconds.toString().padStart(2, "0")} | 🥛 ${sipCount} sips today | ⭐ Lvl ${level} (${progress}% to Lvl ${level + 1})`
      );
    }
  );

  context.subscriptions.push(
    startCommand,
    stopCommand,
    resetCommand,
    showStatsCommand,
    statusBar,
    { dispose: () => clearInterval(countdownTick) },
    { dispose: () => stopInterval() }
  );
}

function deactivate() {}

module.exports = { activate, deactivate };