# VSCode Dock

A status bar dock for VSCode where you can pin icons, folders, files, and links. Think of it like a bookmark bar inside your editor.

## 🖥️ What it is

A status bar dock for VSCode where you can pin icons, folders, files, and links.
Think of it like a bookmark bar inside your editor.

## 💡 What it's used for

### Quick Launch Apps & Tools
- Open Chrome, Terminal, Spotify, Figma, or any local app with one click
- Jump into your dev scripts or tools without leaving VSCode

### Navigate Files & Folders
- Pin your most-used projects, config folders, or docs
- Clicking an icon opens the file/folder in VSCode or your OS file explorer

### Open Web Links
- GitHub repo? Documentation? Project management board? All just a click away
- You can even import Chrome bookmarks so your editor mirrors your browser setup

### Folder Groups (like Google Chrome's bookmarks)
- Create folders in the dock (e.g. "Work", "Personal", "Tools")
- Expand them to reveal nested links and shortcuts

## 🎯 Who it's for

- Developers who want fewer context switches between browser, OS, and editor
- Anyone who wants their editor to double as a command center
- People who live inside VSCode and want a personalized shortcut bar

## 🔑 The difference

- Not just bookmarks → it's apps, files, folders, AND links
- Not hidden in menus → it's always visible in your status bar
- Not just text → icons + folders make it fast and visual

## ⚡ Features

- **App Shortcuts**: Launch VSCode commands and external applications
- **File & Folder Access**: Quick access to your most-used files and folders
- **Web Links**: One-click access to documentation, repos, and web tools
- **Folder Groups**: Organize items into expandable folders
- **Chrome Bookmarks Import**: Import your existing Chrome bookmarks
- **Customizable Icons**: Use VSCode's built-in icons or custom ones
- **Persistent Storage**: Your dock items are saved and restored between sessions

## 🚀 Getting Started

1. Install the extension
2. The dock will appear in your status bar with some default items
3. Click the `+` button to add new items
4. Use the Command Palette (`Ctrl+Shift+P`) and search for "VSCode Dock" to access configuration options

## 🛠️ Managing Your Dock

### Adding Items
- Click the `+` button in the dock
- Use Command Palette → "VSCode Dock: Add Item to Dock"
- Choose from: App/Command, File, Folder, Folder Group, or Web Link

**Two Types of Folders:**
- **📂 Folder** - Opens a folder on your computer (like Documents, Projects)
- **📁 Folder Group** - A container in the dock to organize other items (like "Work", "Personal")

### Editing Items
- Use Command Palette → "VSCode Dock: Manage Dock Items"
- Select an item and choose: Edit, Delete, Move Up, or Move Down
- Edit allows you to change name, title, and item-specific properties

### Adding Titles/Descriptions
- When adding new items, you'll be prompted for a title/description
- Titles appear as tooltips when you hover over dock items
- For folder groups, titles help describe what's inside

## 📋 Commands

- `VSCode Dock: Add Item to Dock` - Add a new item (app, file, folder, or link)
- `VSCode Dock: Add Folder to Dock` - Create a new folder group
- `VSCode Dock: Manage Dock Items` - Edit, delete, or reorder existing items
- `VSCode Dock: Import Chrome Bookmarks` - Import bookmarks from Chrome
- `VSCode Dock: Configure Dock` - Open the configuration dialog

## ⚙️ Configuration

The extension adds several configuration options:

- `vscode-dock.items`: Array of dock items (automatically managed)
- `vscode-dock.showIcons`: Show icons in dock items (default: true)
- `vscode-dock.maxItems`: Maximum number of items to show in dock (default: 10)

## 🎨 Supported Icons

The extension supports VSCode's built-in icons. Some popular ones include:

- `$(terminal)` - Terminal
- `$(files)` - Files/Explorer
- `$(git-branch)` - Git
- `$(extensions)` - Extensions
- `$(folder)` - Folder
- `$(globe)` - Web link
- `$(chrome)` - Chrome
- `$(spotify)` - Spotify
- `$(figma)` - Figma

## 🔧 Development

To build and test the extension:

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Press `F5` in VSCode to launch a new Extension Development Host window

## 📝 License

MIT License - feel free to use and modify as needed.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
