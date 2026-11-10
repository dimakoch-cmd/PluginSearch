import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
    const searchInFile = vscode.commands.registerCommand(
        'pluginSearch.searchInFile',
        () => {
            vscode.window.showInformationMessage('Plugin Search: поиск в выбранном файле (заглушка)');
        }
    );

    const searchInActiveFile = vscode.commands.registerCommand(
        'pluginSearch.searchInActiveFile',
        () => {
            vscode.window.showInformationMessage('Plugin Search: поиск в активном файле (заглушка)');
        }
    );

    context.subscriptions.push(searchInFile, searchInActiveFile);
}

export function deactivate(): void {}