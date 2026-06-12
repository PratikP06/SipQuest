const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	let timeInterval = null;

	function startInterval (){
		

		timeInterval = setInterval(()=>{
			vscode.window.showInformationMessage(
				"Time To Drink waterrrrrrrrrr",
				"Done",
				"Snooze"

			).then(selection =>{
				if(selection == "Snooze"){
					stopInterval(),
					setTimeout(() => startInterval(),30 * 1000)
				}
			}

			)
			console.log("notification sent")

		},10*1000)
		
	}

	function stopInterval(){
		if(timeInterval){
			clearInterval(timeInterval);
			timeInterval = null;
		}
	}
	
	startInterval();


	const startCommand = vscode.commands.registerCommand("hydroquest.start" , function() {
		stopInterval();
		startInterval();
		vscode.window.showInformationMessage("Reminder Started");
	})

	const stopCommand = vscode.commands.registerCommand("hydroquest.stop" , function() {
		stopInterval();
		vscode.window.showInformationMessage("Reminder stoped");
	})

	const resetCommand = vscode.commands.registerCommand("hydroquest.reset" , function() {
		stopInterval();
		
		vscode.window.showInformationMessage("Reminder reset");
	})

	context.subscriptions.push(startCommand, stopCommand, resetCommand);
	context.subscriptions.push({
		dispose: () => stopInterval()
	});
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
