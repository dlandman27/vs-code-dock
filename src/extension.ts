import * as vscode from 'vscode';
import { DockProvider } from './dockProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('VSCode Dock extension is now active!');

    const dockProvider = new DockProvider(context);

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

    const showFolderMenuCommand = vscode.commands.registerCommand('vscode-dock.showFolderMenu', (item: any) => {
        dockProvider.showFolderMenu(item);
    });

    context.subscriptions.push(
        addItemCommand,
        addFolderCommand,
        importChromeCommand,
        configureCommand,
        showFolderMenuCommand,
        dockProvider
    );

    // Initialize the dock
    dockProvider.initialize();
}

export function deactivate() {
    console.log('VSCode Dock extension is now deactivated!');
}
