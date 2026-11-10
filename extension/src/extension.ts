import * as vscode from 'vscode';
import { findMatches, resolveBinaryPath } from './searchRunner';

interface SearchRequest {
    filePath: string;
    query: string;
}

let extensionPath = '';
const output = vscode.window.createOutputChannel('Plugin Search');

// Запрашивает поисковое слово. Пустой ввод не принимается.
async function askQuery(initialValue?: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
        title: 'Plugin Search',
        prompt: 'Введите слово для поиска',
        value: initialValue,
        validateInput: (text) =>
            text.length === 0 ? 'Поисковый запрос не может быть пустым' : undefined
    });
}

// Режим 1: слово вводится, файл выбирается через диалог
async function searchInFile(): Promise<void> {
    const query = await askQuery();
    if (query === undefined) {
        return; // пользователь нажал Esc
    }

    const uris = await vscode.window.showOpenDialog({
        title: 'Выберите файл для поиска',
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
    });
    if (!uris || uris.length === 0) {
        return;
    }

    await runSearch({ filePath: uris[0].fsPath, query });
}

// Режим 2: поиск в активном файле, как Ctrl+F
async function searchInActiveFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('Нет открытого файла. Откройте файл в редакторе.');
        return;
    }

    const document = editor.document;
    if (document.isUntitled || document.uri.scheme !== 'file') {
        vscode.window.showWarningMessage('Файл не сохранён на диск. Сохраните его и повторите поиск.');
        return;
    }

    // Как в Ctrl+F: если выделено слово в одной строке, подставляем его
    const selection = editor.selection;
    const selectedText = !selection.isEmpty && selection.isSingleLine
        ? document.getText(selection)
        : undefined;

    const query = await askQuery(selectedText);
    if (query === undefined) {
        return;
    }

    // Бинарник читает файл с диска, поэтому сначала сохраняем изменения
    if (document.isDirty && !(await document.save())) {
        vscode.window.showErrorMessage('Не удалось сохранить файл перед поиском.');
        return;
    }

    await runSearch({ filePath: document.uri.fsPath, query });
}

// Запускает бинарник и показывает результаты
async function runSearch(request: SearchRequest): Promise<void> {
    try {
        const binary = resolveBinaryPath(extensionPath);
        const matches = await findMatches(binary, request.filePath, request.query);

        // Временный вывод для проверки, навигацию добавим в подзадаче 5
        output.clear();
        output.appendLine(`Запрос: "${request.query}", файл: ${request.filePath}`);

        // Префиксы "строка:колонка" выравниваются по ширине самого длинного
        const prefixes = matches.map((m) => `${m.line}:${m.column + 1}`);
        const width = prefixes.reduce((max, p) => Math.max(max, p.length), 0);
        matches.forEach((m, i) => {
            output.appendLine(`${prefixes[i].padEnd(width)}  ${m.text}`);
        });
        output.show(true);

        vscode.window.showInformationMessage(`Найдено совпадений: ${matches.length}`);
    } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
    }
}

export function activate(context: vscode.ExtensionContext): void {
    extensionPath = context.extensionPath;

    context.subscriptions.push(
        output,
        vscode.commands.registerCommand('pluginSearch.searchInFile', searchInFile),
        vscode.commands.registerCommand('pluginSearch.searchInActiveFile', searchInActiveFile)
    );
}

export function deactivate(): void {}