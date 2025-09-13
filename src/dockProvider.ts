import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DockItem {
    id: string;
    type: 'app' | 'file' | 'folder' | 'link' | 'folder-group';
    name: string;
    title?: string;
    path?: string;
    url?: string;
    icon?: string;
    color?: string;
    children?: DockItem[];
    command?: string;
}

export class DockProvider {
    private statusBarItems: vscode.StatusBarItem[] = [];
    private context: vscode.ExtensionContext;
    private dockItems: DockItem[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async initialize() {
        await this.loadConfiguration();
        this.createDockItems();
    }

    private async loadConfiguration() {
        const config = vscode.workspace.getConfiguration('vscode-dock');
        this.dockItems = config.get<DockItem[]>('items', []);
        
        // Add some default items if none exist
        if (this.dockItems.length === 0) {
            this.dockItems = this.getDefaultItems();
            await this.saveConfiguration();
        }
    }

    private getDefaultItems(): DockItem[] {
        return [
            {
                id: 'terminal',
                type: 'app',
                name: 'Terminal',
                icon: '$(terminal)',
                command: 'workbench.action.terminal.new'
            },
            {
                id: 'explorer',
                type: 'app',
                name: 'Explorer',
                icon: '$(files)',
                command: 'workbench.view.explorer'
            },
            {
                id: 'git',
                type: 'app',
                name: 'Git',
                icon: '$(git-branch)',
                command: 'workbench.view.scm'
            },
            {
                id: 'extensions',
                type: 'app',
                name: 'Extensions',
                icon: '$(extensions)',
                command: 'workbench.view.extensions'
            }
        ];
    }

    private createDockItems() {
        // Clear existing status bar items
        this.statusBarItems.forEach(item => item.dispose());
        this.statusBarItems = [];

        const maxItems = vscode.workspace.getConfiguration('vscode-dock').get<number>('maxItems', 10);
        const showIcons = vscode.workspace.getConfiguration('vscode-dock').get<boolean>('showIcons', true);
        const showTitles = vscode.workspace.getConfiguration('vscode-dock').get<boolean>('showTitles', true);

        // Create status bar items for each dock item
        this.dockItems.slice(0, maxItems).forEach((item, index) => {
            const statusBarItem = vscode.window.createStatusBarItem(
                vscode.StatusBarAlignment.Left,
                1000 - index
            );

            // Create display text with icon and optional title
            let displayText = '';
            if (showIcons && item.icon) {
                // Add colored circle if item has a color
                if (item.color) {
                    displayText = this.getColorIcon(item.color) + ' ';
                }
                displayText += item.icon;
                // Add name as text if enabled and not too long
                if (showTitles && item.name && item.name.length <= 20) {
                    displayText += ` ${item.name}`;
                }
            } else {
                displayText = item.name;
            }

            statusBarItem.text = displayText;
            
            // Create enhanced tooltip with color info
            let tooltip = item.title || item.name;
            if (item.color) {
                const colorName = this.getColorName(item.color);
                tooltip += ` (${colorName})`;
            }
            statusBarItem.tooltip = tooltip;
            
            if (item.type === 'folder-group' && item.children) {
                // Create a menu for folder groups
                statusBarItem.command = {
                    command: 'vscode-dock.showFolderMenu',
                    title: item.name,
                    arguments: [item]
                };
            } else {
                // For other items, use the original command
                const originalCommand = this.getCommandForItem(item);
                if (originalCommand) {
                    statusBarItem.command = originalCommand;
                }
            }

            statusBarItem.show();
            this.statusBarItems.push(statusBarItem);
        });

        // Add a "+" button to add new items
        const addButton = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            500
        );
        addButton.text = '$(plus)';
        addButton.tooltip = 'Add item to dock';
        addButton.command = 'vscode-dock.addItem';
        addButton.show();
        this.statusBarItems.push(addButton);
    }

    private getCommandForItem(item: DockItem): vscode.Command | undefined {
        switch (item.type) {
            case 'app':
                if (item.command) {
                    return {
                        command: item.command,
                        title: item.name
                    };
                }
                break;
            case 'file':
                if (item.path) {
                    return {
                        command: 'vscode.open',
                        title: item.name,
                        arguments: [vscode.Uri.file(item.path)]
                    };
                }
                break;
            case 'folder':
                if (item.path) {
                    return {
                        command: 'vscode.openFolder',
                        title: item.name,
                        arguments: [vscode.Uri.file(item.path)]
                    };
                }
                break;
            case 'link':
                if (item.url) {
                    return {
                        command: 'vscode.open',
                        title: item.name,
                        arguments: [vscode.Uri.parse(item.url)]
                    };
                }
                break;
        }
        return undefined;
    }

    public async showAddItemDialog() {
        const itemType = await vscode.window.showQuickPick(
            [
                { label: '$(terminal) App/Command', description: 'VSCode commands and external apps' },
                { label: '$(file) File', description: 'Specific files you use often' },
                { label: '$(folder) Folder', description: 'Computer folders (Documents, Projects)' },
                { label: '$(folder-opened) Folder Group', description: 'Groups items on your dock' },
                { label: '$(globe) Web Link', description: 'URLs and bookmarks' }
            ],
            { placeHolder: 'Select item type to add' }
        );

        if (!itemType) return;

        if (itemType.label.includes('App/Command')) {
            await this.addAppItem();
        } else if (itemType.label.includes('File')) {
            await this.addFileItem();
        } else if (itemType.label.includes('Folder') && !itemType.label.includes('Group')) {
            await this.addFolderItem();
        } else if (itemType.label.includes('Folder Group')) {
            await this.showAddFolderDialog();
        } else if (itemType.label.includes('Web Link')) {
            await this.addLinkItem();
        }
    }

    private async addAppItem() {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter app/command name',
            placeHolder: 'e.g., Terminal, Chrome, Spotify'
        });

        if (!name) return;

        const title = await vscode.window.showInputBox({
            prompt: 'Enter description/title (optional)',
            placeHolder: 'e.g., Open new terminal window'
        });

        const command = await vscode.window.showInputBox({
            prompt: 'Enter VSCode command (optional)',
            placeHolder: 'e.g., workbench.action.terminal.new'
        });

        const icon = await vscode.window.showInputBox({
            prompt: 'Enter icon (optional)',
            placeHolder: 'e.g., $(terminal), $(chrome), $(spotify)'
        });

        const newItem: DockItem = {
            id: `app-${Date.now()}`,
            type: 'app',
            name,
            title: title || name,
            command,
            icon
        };

        this.dockItems.push(newItem);
        await this.saveConfiguration();
        this.createDockItems();
    }

    private async addFileItem() {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false
        });

        if (!fileUri || fileUri.length === 0) return;

        const filePath = fileUri[0].fsPath;
        const fileName = path.basename(filePath);

        const title = await vscode.window.showInputBox({
            prompt: 'Enter description/title (optional)',
            placeHolder: `e.g., Open ${fileName}`,
            value: `Open ${fileName}`
        });

        const newItem: DockItem = {
            id: `file-${Date.now()}`,
            type: 'file',
            name: fileName,
            title: title || fileName,
            path: filePath,
            icon: this.getFileIcon(fileName)
        };

        this.dockItems.push(newItem);
        await this.saveConfiguration();
        this.createDockItems();
    }

    private async addFolderItem() {
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false
        });

        if (!folderUri || folderUri.length === 0) return;

        const folderPath = folderUri[0].fsPath;
        const folderName = path.basename(folderPath);

        const title = await vscode.window.showInputBox({
            prompt: 'Enter description/title (optional)',
            placeHolder: `e.g., Open ${folderName} folder`,
            value: `Open ${folderName} folder`
        });

        const newItem: DockItem = {
            id: `folder-${Date.now()}`,
            type: 'folder',
            name: folderName,
            title: title || folderName,
            path: folderPath,
            icon: '$(folder)'
        };

        this.dockItems.push(newItem);
        await this.saveConfiguration();
        this.createDockItems();
    }

    private async addLinkItem() {
        const url = await vscode.window.showInputBox({
            prompt: 'Enter URL',
            placeHolder: 'https://example.com'
        });

        if (!url) return;

        const name = await vscode.window.showInputBox({
            prompt: 'Enter display name',
            placeHolder: 'e.g., GitHub, Documentation'
        });

        if (!name) return;

        const title = await vscode.window.showInputBox({
            prompt: 'Enter description/title (optional)',
            placeHolder: `e.g., Open ${name} in browser`
        });

        const newItem: DockItem = {
            id: `link-${Date.now()}`,
            type: 'link',
            name,
            title: title || name,
            url,
            icon: '$(globe)'
        };

        this.dockItems.push(newItem);
        await this.saveConfiguration();
        this.createDockItems();
    }

    public async showAddFolderDialog() {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter folder name',
            placeHolder: 'e.g., Work, Personal, Tools'
        });

        if (!name) return;

        const title = await vscode.window.showInputBox({
            prompt: 'Enter folder description/title (optional)',
            placeHolder: 'e.g., My work projects and tools'
        });

        const color = await vscode.window.showQuickPick(
            [
                { label: '$(circle-filled) Default', description: 'Use default color', value: '' },
                { label: '$(circle-filled) Blue', description: 'Blue color', value: '#007ACC' },
                { label: '$(circle-filled) Green', description: 'Green color', value: '#28A745' },
                { label: '$(circle-filled) Red', description: 'Red color', value: '#DC3545' },
                { label: '$(circle-filled) Orange', description: 'Orange color', value: '#FD7E14' },
                { label: '$(circle-filled) Purple', description: 'Purple color', value: '#6F42C1' },
                { label: '$(circle-filled) Pink', description: 'Pink color', value: '#E83E8C' },
                { label: '$(circle-filled) Yellow', description: 'Yellow color', value: '#FFC107' },
                { label: '$(circle-filled) Teal', description: 'Teal color', value: '#20C997' }
            ],
            { placeHolder: 'Select a color for the folder (optional)' }
        );

        const newItem: DockItem = {
            id: `folder-group-${Date.now()}`,
            type: 'folder-group',
            name,
            title: title || name,
            icon: '$(folder-opened)',
            color: color?.value || undefined,
            children: []
        };

        this.dockItems.push(newItem);
        await this.saveConfiguration();
        this.createDockItems();
    }

    public async importChromeBookmarks() {
        try {
            const bookmarksPath = this.getChromeBookmarksPath();
            if (!bookmarksPath || !fs.existsSync(bookmarksPath)) {
                vscode.window.showErrorMessage('Chrome bookmarks file not found. Please make sure Chrome is installed.');
                return;
            }

            const bookmarksData = JSON.parse(fs.readFileSync(bookmarksPath, 'utf8'));
            const importedItems = this.parseChromeBookmarks(bookmarksData);

            if (importedItems.length > 0) {
                this.dockItems.push(...importedItems);
                await this.saveConfiguration();
                this.createDockItems();
                vscode.window.showInformationMessage(`Imported ${importedItems.length} bookmarks from Chrome.`);
            } else {
                vscode.window.showInformationMessage('No bookmarks found to import.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import Chrome bookmarks: ${error}`);
        }
    }

    private getChromeBookmarksPath(): string | null {
        const os = require('os');
        const platform = os.platform();
        
        switch (platform) {
            case 'win32':
                return path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks');
            case 'darwin':
                return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Bookmarks');
            case 'linux':
                return path.join(os.homedir(), '.config', 'google-chrome', 'Default', 'Bookmarks');
            default:
                return null;
        }
    }

    private parseChromeBookmarks(bookmarksData: any): DockItem[] {
        const items: DockItem[] = [];
        
        const parseBookmarkNode = (node: any, parentName?: string): void => {
            if (node.type === 'url') {
                const item: DockItem = {
                    id: `chrome-${Date.now()}-${Math.random()}`,
                    type: 'link',
                    name: node.name,
                    url: node.url,
                    icon: '$(globe)'
                };
                items.push(item);
            } else if (node.type === 'folder' && node.children) {
                node.children.forEach((child: any) => {
                    parseBookmarkNode(child, node.name);
                });
            }
        };

        if (bookmarksData.roots) {
            Object.values(bookmarksData.roots).forEach((root: any) => {
                if (root.children) {
                    root.children.forEach((child: any) => {
                        parseBookmarkNode(child);
                    });
                }
            });
        }

        return items;
    }

    public async showConfigurationDialog() {
        const action = await vscode.window.showQuickPick(
            ['Add Item', 'Manage Items', 'Import Chrome Bookmarks', 'Reset to Defaults'],
            { placeHolder: 'Select configuration action' }
        );

        if (!action) return;

        switch (action) {
            case 'Add Item':
                await this.showAddItemDialog();
                break;
            case 'Manage Items':
                await this.showManageItemsDialog();
                break;
            case 'Import Chrome Bookmarks':
                await this.importChromeBookmarks();
                break;
            case 'Reset to Defaults':
                await this.clearAllItems();
                break;
        }
    }

    private async clearAllItems() {
        const result = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all custom dock items? (This will keep the default VSCode items)',
            'Yes', 'No'
        );

        if (result === 'Yes') {
            // Only clear user-added items, keep the default VSCode items
            this.dockItems = this.getDefaultItems();
            await this.saveConfiguration();
            this.createDockItems();
            vscode.window.showInformationMessage('All custom dock items cleared. Default VSCode items restored.');
        }
    }

    private getColorIcon(color: string): string {
        // Map colors to appropriate VSCode icons that represent colors
        const colorMap: { [key: string]: string } = {
            '#007ACC': '🔵', // Blue circle emoji
            '#28A745': '🟢', // Green circle emoji
            '#DC3545': '🟥', // Red square emoji (more visible)
            '#FD7E14': '🟠', // Orange circle emoji
            '#6F42C1': '🟣', // Purple circle emoji
            '#E83E8C': '🟪', // Pink square emoji
            '#FFC107': '🟡', // Yellow circle emoji
            '#20C997': '💎'  // Teal (using diamond as distinctive)
        };
        return colorMap[color] || '⚪';
    }

    private getColorName(color: string): string {
        const colorNames: { [key: string]: string } = {
            '#007ACC': 'Blue',
            '#28A745': 'Green',
            '#DC3545': 'Red',
            '#FD7E14': 'Orange',
            '#6F42C1': 'Purple',
            '#E83E8C': 'Pink',
            '#FFC107': 'Yellow',
            '#20C997': 'Teal'
        };
        return colorNames[color] || 'Custom';
    }

    private getItemIcon(item: DockItem): string {
        if (item.icon) {
            return item.icon;
        }

        switch (item.type) {
            case 'app':
                return '$(terminal)';
            case 'file':
                return this.getFileIcon(item.name);
            case 'folder':
                return '$(folder)';
            case 'link':
                return '$(globe)';
            case 'folder-group':
                return '$(folder-opened)';
            default:
                return '$(file)';
        }
    }

    private getFileIcon(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        const iconMap: { [key: string]: string } = {
            '.js': '$(symbol-method)',
            '.ts': '$(symbol-method)',
            '.html': '$(globe)',
            '.css': '$(symbol-color)',
            '.json': '$(symbol-object)',
            '.md': '$(book)',
            '.txt': '$(file-text)',
            '.pdf': '$(file-pdf)',
            '.png': '$(file-media)',
            '.jpg': '$(file-media)',
            '.gif': '$(file-media)',
            '.svg': '$(file-media)'
        };
        return iconMap[ext] || '$(file)';
    }

    private async saveConfiguration() {
        const config = vscode.workspace.getConfiguration('vscode-dock');
        await config.update('items', this.dockItems, vscode.ConfigurationTarget.Global);
    }

    public async showFolderMenu(folderItem: DockItem) {
        if (!folderItem.children) {
            folderItem.children = [];
        }

        if (folderItem.children.length === 0) {
            const action = await vscode.window.showQuickPick(
                [
                    { label: '$(close) Cancel', description: 'Close this menu' },
                    { label: '$(gear) Configure Items', description: 'Manage folder items and settings' },
                    { label: '$(paintcan) Change Color', description: 'Change the color of this folder' },
                    { label: '$(plus) Add Item to Folder', description: 'Add a new item to this folder' },
                    { label: '$(trash) Remove Folder', description: 'Delete this empty folder' }
                ],
                { placeHolder: `"${folderItem.name}" is empty. What would you like to do?` }
            );

            if (action?.label.includes('Add Item to Folder')) {
                await this.addItemToFolder(folderItem);
            } else if (action?.label.includes('Configure Items')) {
                await this.showFolderItemsDialog(folderItem);
            } else if (action?.label.includes('Change Color')) {
                await this.changeFolderColor(folderItem);
            } else if (action?.label.includes('Remove Folder')) {
                await this.removeFolderGroup(folderItem);
            }
            return;
        }

        // Show folder contents with options to add more items or manage the folder
        const items = [
            ...folderItem.children.map(child => ({
                label: `${this.getItemIcon(child)} ${child.name}`,
                description: child.type,
                detail: child.title || child.path || child.url,
                item: child,
                isAddAction: false,
                isRemoveAction: false,
                isColorAction: false,
                isConfigureAction: false,
                isSeparator: false
            })),
            {
                label: '$(plus) Add Item to Folder',
                description: 'Add a new item to this folder',
                isAddAction: true,
                isRemoveAction: false,
                isColorAction: false,
                isConfigureAction: false,
                isSeparator: false
            },
            {
                label: '$(horizontal-rule) ────────────────────────',
                description: '',
                isAddAction: false,
                isRemoveAction: false,
                isColorAction: false,
                isConfigureAction: false,
                isSeparator: true
            },
            {
                label: '$(gear) Configure Items',
                description: 'Manage folder items and settings',
                isConfigureAction: true,
                isAddAction: false,
                isRemoveAction: false,
                isColorAction: false,
                isSeparator: false
            },
            {
                label: '$(paintcan) Change Color',
                description: 'Change the color of this folder',
                isColorAction: true,
                isAddAction: false,
                isRemoveAction: false,
                isConfigureAction: false,
                isSeparator: false
            },
            {
                label: '$(trash) Remove Folder',
                description: 'Delete this folder and all its contents',
                isRemoveAction: true,
                isAddAction: false,
                isColorAction: false,
                isConfigureAction: false,
                isSeparator: false
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select item from ${folderItem.title || folderItem.name}`,
            matchOnDescription: true
        });

        if (selected) {
            if (selected.isSeparator) {
                // Do nothing for separator
                return;
            } else if (selected.isAddAction) {
                await this.addItemToFolder(folderItem);
            } else if (selected.isConfigureAction) {
                await this.showFolderItemsDialog(folderItem);
            } else if (selected.isColorAction) {
                await this.changeFolderColor(folderItem);
            } else if (selected.isRemoveAction) {
                await this.removeFolderGroup(folderItem);
            } else if ('item' in selected) {
                const command = this.getCommandForItem(selected.item);
                if (command) {
                    await vscode.commands.executeCommand(command.command, ...(command.arguments || []));
                }
            }
        }
    }

    public async showManageItemsDialog() {
        if (this.dockItems.length === 0) {
            vscode.window.showInformationMessage('No dock items to manage. Add some items first.');
            return;
        }

        const defaultItemIds = this.getDefaultItems().map(item => item.id);
        
        // Create hierarchical structure
        const items: any[] = [];
        
        this.dockItems.forEach(item => {
            const isDefault = defaultItemIds.includes(item.id);
            
            if (item.type === 'folder-group') {
                // Add folder group header
                items.push({
                    label: `${this.getItemIcon(item)} ${item.name}`,
                    description: `${item.type} (${item.children?.length || 0} items)`,
                    detail: item.title || 'Folder group',
                    item: item,
                    isDefault: isDefault,
                    isFolderGroup: true
                });
                
                // Add children items indented
                if (item.children && item.children.length > 0) {
                    item.children.forEach(child => {
                        items.push({
                            label: `  └─ ${this.getItemIcon(child)} ${child.name}`,
                            description: `${child.type} (in ${item.name})`,
                            detail: child.title || child.path || child.url || child.command,
                            item: child,
                            isDefault: false,
                            isFolderGroup: false,
                            parentFolder: item
                        });
                    });
                }
            } else {
                // Add regular items
                items.push({
                    label: `${this.getItemIcon(item)} ${item.name}`,
                    description: isDefault ? `${item.type} (Default)` : item.type,
                    detail: item.title || item.path || item.url || item.command,
                    item: item,
                    isDefault: isDefault,
                    isFolderGroup: false
                });
            }
        });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select item to manage',
            matchOnDescription: true
        });

        if (selected) {
            // Handle folder groups
            if (selected.isFolderGroup) {
                const action = await vscode.window.showQuickPick(
                    [
                        { label: '$(edit) Edit Folder', description: 'Change folder name, title, and color' },
                        { label: '$(plus) Add Item to Folder', description: 'Add a new item to this folder' },
                        { label: '$(paintcan) Change Color', description: 'Change the folder color' },
                        { label: '$(trash) Delete Folder', description: 'Delete this folder and all its contents' },
                        { label: '$(arrow-up) Move Up', description: 'Move folder left in dock' },
                        { label: '$(arrow-down) Move Down', description: 'Move folder right in dock' }
                    ],
                    { placeHolder: `What would you like to do with "${selected.item.name}" folder?` }
                );

                if (!action) return;

                if (action.label.includes('Edit Folder')) {
                    await this.editItem(selected.item);
                } else if (action.label.includes('Add Item to Folder')) {
                    await this.addItemToFolder(selected.item);
                } else if (action.label.includes('Change Color')) {
                    await this.changeFolderColor(selected.item);
                } else if (action.label.includes('Delete Folder')) {
                    await this.removeFolderGroup(selected.item);
                } else if (action.label.includes('Move Up')) {
                    await this.moveItem(selected.item, -1);
                } else if (action.label.includes('Move Down')) {
                    await this.moveItem(selected.item, 1);
                }
            }
            // Handle child items in folders
            else if (selected.parentFolder) {
                const action = await vscode.window.showQuickPick(
                    [
                        { label: '$(edit) Edit', description: 'Change name, title, and properties' },
                        { label: '$(trash) Remove from Folder', description: 'Remove this item from the folder' },
                        { label: '$(arrow-up) Move Up in Folder', description: 'Move item up in folder' },
                        { label: '$(arrow-down) Move Down in Folder', description: 'Move item down in folder' }
                    ],
                    { placeHolder: `What would you like to do with "${selected.item.name}" in "${selected.parentFolder.name}"?` }
                );

                if (!action) return;

                if (action.label.includes('Edit')) {
                    await this.editItem(selected.item);
                } else if (action.label.includes('Remove from Folder')) {
                    await this.removeItemFromFolder(selected.item, selected.parentFolder);
                } else if (action.label.includes('Move Up in Folder')) {
                    await this.moveItemInFolder(selected.item, selected.parentFolder, -1);
                } else if (action.label.includes('Move Down in Folder')) {
                    await this.moveItemInFolder(selected.item, selected.parentFolder, 1);
                }
            }
            // Handle regular items (default or user-added)
            else if (selected.isDefault) {
                const action = await vscode.window.showQuickPick(
                    [
                        { label: '$(arrow-up) Move Up', description: 'Move item left in dock' },
                        { label: '$(arrow-down) Move Down', description: 'Move item right in dock' }
                    ],
                    { placeHolder: `What would you like to do with "${selected.item.name}"? (Default items can only be reordered)` }
                );

                if (!action) return;

                if (action.label.includes('Move Up')) {
                    await this.moveItem(selected.item, -1);
                } else if (action.label.includes('Move Down')) {
                    await this.moveItem(selected.item, 1);
                }
            } else {
                // User-added items can be fully managed
                const action = await vscode.window.showQuickPick(
                    [
                        { label: '$(edit) Edit', description: 'Change name, title, and properties' },
                        { label: '$(trash) Delete', description: 'Remove this item permanently' },
                        { label: '$(arrow-up) Move Up', description: 'Move item left in dock' },
                        { label: '$(arrow-down) Move Down', description: 'Move item right in dock' }
                    ],
                    { placeHolder: `What would you like to do with "${selected.item.name}"?` }
                );

                if (!action) return;

                if (action.label.includes('Edit')) {
                    await this.editItem(selected.item);
                } else if (action.label.includes('Delete')) {
                    await this.deleteItem(selected.item);
                } else if (action.label.includes('Move Up')) {
                    await this.moveItem(selected.item, -1);
                } else if (action.label.includes('Move Down')) {
                    await this.moveItem(selected.item, 1);
                }
            }
        }
    }

    public async editItem(item: DockItem) {
        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new name',
            value: item.name,
            placeHolder: item.name
        });

        if (newName === undefined) return; // User cancelled

        const newTitle = await vscode.window.showInputBox({
            prompt: 'Enter new description/title',
            value: item.title || item.name,
            placeHolder: item.title || item.name
        });

        if (newTitle === undefined) return; // User cancelled

        // Update the item
        item.name = newName;
        item.title = newTitle;

        // For apps, also allow editing command and icon
        if (item.type === 'app') {
            const newCommand = await vscode.window.showInputBox({
                prompt: 'Enter VSCode command (optional)',
                value: item.command || '',
                placeHolder: 'e.g., workbench.action.terminal.new'
            });

            if (newCommand !== undefined) {
                item.command = newCommand;
            }

            const newIcon = await vscode.window.showInputBox({
                prompt: 'Enter icon (optional)',
                value: item.icon || '',
                placeHolder: 'e.g., $(terminal), $(chrome)'
            });

            if (newIcon !== undefined) {
                item.icon = newIcon;
            }
        }

        // For folder groups, allow editing color
        if (item.type === 'folder-group') {
            const color = await vscode.window.showQuickPick(
                [
                    { label: '$(circle-filled) Default', description: 'Use default color', value: '' },
                    { label: '$(circle-filled) Blue', description: 'Blue color', value: '#007ACC' },
                    { label: '$(circle-filled) Green', description: 'Green color', value: '#28A745' },
                    { label: '$(circle-filled) Red', description: 'Red color', value: '#DC3545' },
                    { label: '$(circle-filled) Orange', description: 'Orange color', value: '#FD7E14' },
                    { label: '$(circle-filled) Purple', description: 'Purple color', value: '#6F42C1' },
                    { label: '$(circle-filled) Pink', description: 'Pink color', value: '#E83E8C' },
                    { label: '$(circle-filled) Yellow', description: 'Yellow color', value: '#FFC107' },
                    { label: '$(circle-filled) Teal', description: 'Teal color', value: '#20C997' }
                ],
                { placeHolder: 'Select a color for the folder (optional)' }
            );

            if (color !== undefined) {
                item.color = color.value || undefined;
            }
        }

        // For links, allow editing URL
        if (item.type === 'link') {
            const newUrl = await vscode.window.showInputBox({
                prompt: 'Enter new URL',
                value: item.url || '',
                placeHolder: 'https://example.com'
            });

            if (newUrl !== undefined) {
                item.url = newUrl;
            }
        }

        await this.saveConfiguration();
        this.createDockItems();
        vscode.window.showInformationMessage(`Updated "${item.name}" successfully.`);
    }

    private async deleteItem(item: DockItem) {
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${item.name}"?`,
            'Yes', 'No'
        );

        if (result === 'Yes') {
            const index = this.dockItems.findIndex(i => i.id === item.id);
            if (index !== -1) {
                this.dockItems.splice(index, 1);
                await this.saveConfiguration();
                this.createDockItems();
                vscode.window.showInformationMessage(`Deleted "${item.name}" successfully.`);
            }
        }
    }

    private async moveItem(item: DockItem, direction: number) {
        const index = this.dockItems.findIndex(i => i.id === item.id);
        if (index === -1) return;

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.dockItems.length) {
            vscode.window.showInformationMessage('Cannot move item in that direction.');
            return;
        }

        // Swap items
        [this.dockItems[index], this.dockItems[newIndex]] = [this.dockItems[newIndex], this.dockItems[index]];

        await this.saveConfiguration();
        this.createDockItems();
        vscode.window.showInformationMessage(`Moved "${item.name}" ${direction > 0 ? 'down' : 'up'} successfully.`);
    }

    public async addItemToFolder(folderItem: DockItem) {
        const itemType = await vscode.window.showQuickPick(
            [
                { label: '$(terminal) App/Command', description: 'VSCode commands and external apps' },
                { label: '$(file) File', description: 'Specific files you use often' },
                { label: '$(folder) Folder', description: 'Computer folders (Documents, Projects)' },
                { label: '$(globe) Web Link', description: 'URLs and bookmarks' }
            ],
            { placeHolder: 'Select item type to add to folder' }
        );

        if (!itemType) return;

        let newItem: DockItem | null = null;

        if (itemType.label.includes('App/Command')) {
            newItem = await this.createAppItem();
        } else if (itemType.label.includes('File')) {
            newItem = await this.createFileItem();
        } else if (itemType.label.includes('Folder')) {
            newItem = await this.createFolderItem();
        } else if (itemType.label.includes('Web Link')) {
            newItem = await this.createLinkItem();
        }

        if (newItem) {
            if (!folderItem.children) {
                folderItem.children = [];
            }
            folderItem.children.push(newItem);
            await this.saveConfiguration();
            vscode.window.showInformationMessage(`Added "${newItem.name}" to "${folderItem.name}" folder.`);
        }
    }

    private async createAppItem(): Promise<DockItem | null> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter app/command name',
            placeHolder: 'e.g., Terminal, Chrome, Spotify'
        });

        if (!name) return null;

        const title = await vscode.window.showInputBox({
            prompt: 'Enter description/title (optional)',
            placeHolder: 'e.g., Open new terminal window'
        });

        const command = await vscode.window.showInputBox({
            prompt: 'Enter VSCode command (optional)',
            placeHolder: 'e.g., workbench.action.terminal.new'
        });

        const icon = await vscode.window.showInputBox({
            prompt: 'Enter icon (optional)',
            placeHolder: 'e.g., $(terminal), $(chrome), $(spotify)'
        });

        return {
            id: `app-${Date.now()}`,
            type: 'app',
            name,
            title: title || name,
            command,
            icon
        };
    }

    private async createFileItem(): Promise<DockItem | null> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false
        });

        if (!fileUri || fileUri.length === 0) return null;

        const filePath = fileUri[0].fsPath;
        const fileName = path.basename(filePath);

        const title = await vscode.window.showInputBox({
            prompt: 'Enter description/title (optional)',
            placeHolder: `e.g., Open ${fileName}`,
            value: `Open ${fileName}`
        });

        return {
            id: `file-${Date.now()}`,
            type: 'file',
            name: fileName,
            title: title || fileName,
            path: filePath,
            icon: this.getFileIcon(fileName)
        };
    }

    private async createFolderItem(): Promise<DockItem | null> {
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false
        });

        if (!folderUri || folderUri.length === 0) return null;

        const folderPath = folderUri[0].fsPath;
        const folderName = path.basename(folderPath);

        const title = await vscode.window.showInputBox({
            prompt: 'Enter description/title (optional)',
            placeHolder: `e.g., Open ${folderName} folder`,
            value: `Open ${folderName} folder`
        });

        return {
            id: `folder-${Date.now()}`,
            type: 'folder',
            name: folderName,
            title: title || folderName,
            path: folderPath,
            icon: '$(folder)'
        };
    }

    private async createLinkItem(): Promise<DockItem | null> {
        const url = await vscode.window.showInputBox({
            prompt: 'Enter URL',
            placeHolder: 'https://example.com'
        });

        if (!url) return null;

        const name = await vscode.window.showInputBox({
            prompt: 'Enter display name',
            placeHolder: 'e.g., GitHub, Documentation'
        });

        if (!name) return null;

        const title = await vscode.window.showInputBox({
            prompt: 'Enter description/title (optional)',
            placeHolder: `e.g., Open ${name} in browser`
        });

        return {
            id: `link-${Date.now()}`,
            type: 'link',
            name,
            title: title || name,
            url,
            icon: '$(globe)'
        };
    }

    private async changeFolderColor(folderItem: DockItem) {
        const color = await vscode.window.showQuickPick(
            [
                { label: '$(circle-filled) Default', description: 'Use default color', value: '' },
                { label: '$(circle-filled) Blue', description: 'Blue color', value: '#007ACC' },
                { label: '$(circle-filled) Green', description: 'Green color', value: '#28A745' },
                { label: '$(circle-filled) Red', description: 'Red color', value: '#DC3545' },
                { label: '$(circle-filled) Orange', description: 'Orange color', value: '#FD7E14' },
                { label: '$(circle-filled) Purple', description: 'Purple color', value: '#6F42C1' },
                { label: '$(circle-filled) Pink', description: 'Pink color', value: '#E83E8C' },
                { label: '$(circle-filled) Yellow', description: 'Yellow color', value: '#FFC107' },
                { label: '$(circle-filled) Teal', description: 'Teal color', value: '#20C997' }
            ],
            { placeHolder: 'Select a new color for this folder' }
        );

        if (color !== undefined) {
            folderItem.color = color.value || undefined;
            await this.saveConfiguration();
            this.createDockItems();
            vscode.window.showInformationMessage(`Changed "${folderItem.name}" folder color.`);
        }
    }

    private async removeFolderGroup(folderItem: DockItem) {
        const itemCount = folderItem.children ? folderItem.children.length : 0;
        const message = itemCount > 0 
            ? `Are you sure you want to delete "${folderItem.name}" folder and all ${itemCount} items inside it?`
            : `Are you sure you want to delete "${folderItem.name}" folder?`;

        const result = await vscode.window.showWarningMessage(
            message,
            'Yes', 'No'
        );

        if (result === 'Yes') {
            const index = this.dockItems.findIndex(i => i.id === folderItem.id);
            if (index !== -1) {
                this.dockItems.splice(index, 1);
                await this.saveConfiguration();
                this.createDockItems();
                vscode.window.showInformationMessage(`Deleted "${folderItem.name}" folder and all its contents.`);
            }
        }
    }

    public async showItemContextMenu(item: DockItem) {
        const defaultItemIds = this.getDefaultItems().map(defaultItem => defaultItem.id);
        const isDefault = defaultItemIds.includes(item.id);

        if (isDefault) {
            // Default items can only be moved
            const action = await vscode.window.showQuickPick(
                [
                    { label: '$(arrow-up) Move Up', description: 'Move item left in dock' },
                    { label: '$(arrow-down) Move Down', description: 'Move item right in dock' }
                ],
                { placeHolder: `What would you like to do with "${item.name}"? (Default items can only be reordered)` }
            );

            if (action?.label.includes('Move Up')) {
                await this.moveItem(item, -1);
            } else if (action?.label.includes('Move Down')) {
                await this.moveItem(item, 1);
            }
        } else {
            // User-added items can be edited or removed
            const action = await vscode.window.showQuickPick(
                [
                    { label: '$(edit) Edit', description: 'Change name, title, and properties' },
                    { label: '$(trash) Remove', description: 'Remove this item from dock' },
                    { label: '$(arrow-up) Move Up', description: 'Move item left in dock' },
                    { label: '$(arrow-down) Move Down', description: 'Move item right in dock' }
                ],
                { placeHolder: `What would you like to do with "${item.name}"?` }
            );

            if (action?.label.includes('Edit')) {
                await this.editItem(item);
            } else if (action?.label.includes('Remove')) {
                await this.removeItem(item);
            } else if (action?.label.includes('Move Up')) {
                await this.moveItem(item, -1);
            } else if (action?.label.includes('Move Down')) {
                await this.moveItem(item, 1);
            }
        }
    }

    public async removeItem(item: DockItem) {
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to remove "${item.name}" from the dock?`,
            'Yes', 'No'
        );

        if (result === 'Yes') {
            const index = this.dockItems.findIndex(i => i.id === item.id);
            if (index !== -1) {
                this.dockItems.splice(index, 1);
                await this.saveConfiguration();
                this.createDockItems();
                vscode.window.showInformationMessage(`Removed "${item.name}" from dock.`);
            }
        }
    }

    private async removeItemFromFolder(item: DockItem, folder: DockItem) {
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to remove "${item.name}" from "${folder.name}" folder?`,
            'Yes', 'No'
        );

        if (result === 'Yes') {
            if (folder.children) {
                const index = folder.children.findIndex(child => child.id === item.id);
                if (index !== -1) {
                    folder.children.splice(index, 1);
                    await this.saveConfiguration();
                    this.createDockItems();
                    vscode.window.showInformationMessage(`Removed "${item.name}" from "${folder.name}" folder.`);
                }
            }
        }
    }

    private async moveItemInFolder(item: DockItem, folder: DockItem, direction: number) {
        if (!folder.children) return;

        const index = folder.children.findIndex(child => child.id === item.id);
        if (index === -1) return;

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= folder.children.length) {
            vscode.window.showInformationMessage('Cannot move item in that direction within the folder.');
            return;
        }

        // Swap items within the folder
        [folder.children[index], folder.children[newIndex]] = [folder.children[newIndex], folder.children[index]];

        await this.saveConfiguration();
        this.createDockItems();
        vscode.window.showInformationMessage(`Moved "${item.name}" ${direction > 0 ? 'down' : 'up'} in "${folder.name}" folder.`);
    }

    public async showFolderItemsDialog(folderItem: DockItem) {
        if (!folderItem.children || folderItem.children.length === 0) {
            vscode.window.showInformationMessage(`"${folderItem.name}" folder is empty. Add some items first.`);
            return;
        }

        // Show only the items within this specific folder
        const items = folderItem.children.map(child => ({
            label: `${this.getItemIcon(child)} ${child.name}`,
            description: child.type,
            detail: child.title || child.path || child.url || child.command,
            item: child
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Manage items in "${folderItem.name}" folder`,
            matchOnDescription: true
        });

        if (selected) {
            const action = await vscode.window.showQuickPick(
                [
                    { label: '$(edit) Edit', description: 'Change name, title, and properties' },
                    { label: '$(trash) Remove from Folder', description: 'Remove this item from the folder' },
                    { label: '$(arrow-up) Move Up in Folder', description: 'Move item up in folder' },
                    { label: '$(arrow-down) Move Down in Folder', description: 'Move item down in folder' }
                ],
                { placeHolder: `What would you like to do with "${selected.item.name}" in "${folderItem.name}"?` }
            );

            if (!action) return;

            if (action.label.includes('Edit')) {
                await this.editItem(selected.item);
            } else if (action.label.includes('Remove from Folder')) {
                await this.removeItemFromFolder(selected.item, folderItem);
            } else if (action.label.includes('Move Up in Folder')) {
                await this.moveItemInFolder(selected.item, folderItem, -1);
            } else if (action.label.includes('Move Down in Folder')) {
                await this.moveItemInFolder(selected.item, folderItem, 1);
            }
        }
    }



    public dispose() {
        this.statusBarItems.forEach(item => item.dispose());
    }
}
