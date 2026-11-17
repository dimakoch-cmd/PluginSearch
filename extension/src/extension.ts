import * as vscode from 'vscode';
import { SearchOptions, findMatches, resolveBinaryPath } from './searchRunner';
import { presentMatches } from './results';

interface SearchRequest {
    filePath: string;
    query: string;
    options: SearchOptions;
}

interface ModeItem extends vscode.QuickPickItem {
    key: keyof SearchOptions;
}

let extensionPath = '';

// Читает режимы поиска из настроек VS Code
function readSearchOptions(): SearchOptions {
    const config = vscode.workspace.getConfiguration('pluginSearch');
    return {
        caseSensitive: config.get<boolean>('caseSensitive', true),
        wholeWord: config.get<boolean>('wholeWord', false)
    };
}

// Краткое описание включённых режимов для подсказки в поле ввода
function describeOptions(options: SearchOptions): string {
    const yesNo = (value: boolean): string => (value ? 'да' : 'нет');
    return `Учёт регистра: ${yesNo(options.caseSensitive)}. Целое слово: ${yesNo(options.wholeWord)}.`;
}

// Всплывающее окно выбора режимов с галочками, выбор сохраняется в настройках
async function selectModes(): Promise<void> {
    const current = readSearchOptions();

    const items: ModeItem[] = [
        { key: 'caseSensitive', label: 'Учитывать регистр', picked: current.caseSensitive },
        { key: 'wholeWord', label: 'Целое слово', picked: current.wholeWord }
    ];

    const chosen = await vscode.window.showQuickPick(items, {
        title: 'Plugin Search: режимы поиска',
        placeHolder: 'Отметьте нужные режимы и нажмите Enter',
        canPickMany: true
    });
    if (chosen === undefined) {
        return; // пользователь нажал Esc, ничего не меняем
    }

    const enabled = new Set(chosen.map((item) => item.key));
    const config = vscode.workspace.getConfiguration('pluginSearch');
    await Promise.all(
        items.map((item) =>
            config.update(item.key, enabled.has(item.key), vscode.ConfigurationTarget.Global)
        )
    );

    vscode.window.showInformationMessage(
        `Режимы сохранены. ${describeOptions(readSearchOptions())}`
    );
}

// Запрашивает поисковое слово. Пустой ввод не принимается.
async function askQuery(options: SearchOptions, initialValue?: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
        title: 'Plugin Search',
        prompt: `Введите запрос. ${describeOptions(options)}`,
        value: initialValue,
        validateInput: (text) =>
            text.length === 0 ? 'Поисковый запрос не может быть пустым' : undefined
    });
}

// Режим 1: слово вводится, файл выбирается через диалог
async function searchInFile(): Promise<void> {
    const options = readSearchOptions();

    const query = await askQuery(options);
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

    await runSearch({ filePath: uris[0].fsPath, query, options });
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

    const options = readSearchOptions();

    // Как в Ctrl+F: если выделено слово в одной строке, подставляем его
    const selection = editor.selection;
    const selectedText = !selection.isEmpty && selection.isSingleLine
        ? document.getText(selection)
        : undefined;

    const query = await askQuery(options, selectedText);
    if (query === undefined) {
        return;
    }

    // Бинарник читает файл с диска, поэтому сначала сохраняем изменения
    if (document.isDirty && !(await document.save())) {
        vscode.window.showErrorMessage('Не удалось сохранить файл перед поиском.');
        return;
    }

    await runSearch({ filePath: document.uri.fsPath, query, options });
}

// Запускает бинарник и показывает результаты
async function runSearch(request: SearchRequest): Promise<void> {
    try {
        const binary = resolveBinaryPath(extensionPath);
        const matches = await findMatches(binary, request.filePath, request.query, request.options);
        await presentMatches(vscode.Uri.file(request.filePath), request.query, matches);
    } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
    }
}

export function activate(context: vscode.ExtensionContext): void {
    extensionPath = context.extensionPath;

    context.subscriptions.push(
        vscode.commands.registerCommand('pluginSearch.searchInFile', searchInFile),
        vscode.commands.registerCommand('pluginSearch.searchInActiveFile', searchInActiveFile),
        vscode.commands.registerCommand('pluginSearch.selectModes', selectModes)
    );
}

export function deactivate(): void {}