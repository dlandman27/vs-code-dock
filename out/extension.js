"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const dockProvider_1 = require("./dockProvider");
function activate(context) {
    console.log('VSCode Dock extension is now active!');
    const dockProvider = new dockProvider_1.DockProvider(context);
    // Register commands
    const addItemCommand = vscode.commands.registerCommand('vscode-dock.addItem', () => {
        dockProvider.showAddItemDialog();
    });
    const addFolderCommand = vscode.commands.registerCommand('vscode-dock.addFolder', () => {
        dockProvider.showAddFolderDialog();
    });
    const importChromeCommand = vscode.commands.registerCommand('vscode-dock.importChromeBookmarks', () => {
        dockProvider.importChromeBookmarks();
    });
    const configureCommand = vscode.commands.registerCommand('vscode-dock.configure', () => {
        dockProvider.showConfigurationDialog();
    });
    const showFolderMenuCommand = vscode.commands.registerCommand('vscode-dock.showFolderMenu', (item) => {
        dockProvider.showFolderMenu(item);
    });
    context.subscriptions.push(addItemCommand, addFolderCommand, importChromeCommand, configureCommand, showFolderMenuCommand, dockProvider);
    // Initialize the dock
    dockProvider.initialize();
}
exports.activate = activate;
function deactivate() {
    console.log('VSCode Dock extension is now deactivated!');
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map