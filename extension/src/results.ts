import * as vscode from 'vscode';
import { SearchMatch } from './searchRunner';

interface MatchItem extends vscode.QuickPickItem {
    match: SearchMatch;
}

// Открывает файл, ставит курсор на найденное слово и выделяет его
async function goToMatch(
    uri: vscode.Uri,
    match: SearchMatch,
    query: string,
    preserveFocus: boolean
): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, {
        preview: preserveFocus, // при предпросмотре не плодим вкладки
        preserveFocus
    });

    const start = new vscode.Position(match.line - 1, Math.max(match.column, 0));
    const range = new vscode.Range(start, start.translate(0, query.length));

    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

// Показывает результат поиска: переход к строке или список для выбора
export async function presentMatches(
    uri: vscode.Uri,
    query: string,
    matches: SearchMatch[]
): Promise<void> {
    if (matches.length === 0) {
        vscode.window.showInformationMessage(`Слово "${query}" не найдено.`);
        return;
    }

    if (matches.length === 1) {
        await goToMatch(uri, matches[0], query, false);
        return;
    }

    // Запоминаем исходное положение, чтобы вернуться при отмене
    const original = vscode.window.activeTextEditor;
    const originalState = original && {
        document: original.document,
        selection: original.selection,
        viewColumn: original.viewColumn
    };

    const items: MatchItem[] = matches.map((m) => ({
        label: m.text.trim() || m.text,
        description: `${m.line}:${m.column + 1}`,
        match: m
    }));

    const picker = vscode.window.createQuickPick<MatchItem>();
    picker.title = `Plugin Search: "${query}" (${matches.length})`;
    picker.placeholder = 'Выберите строку для перехода';
    picker.matchOnDescription = true;
    picker.items = items;

    let accepted = false;

    // Предпросмотр: при движении по списку редактор следует за выбором
    picker.onDidChangeActive((active) => {
        if (active.length > 0) {
            goToMatch(uri, active[0].match, query, true).catch(() => undefined);
        }
    });

    picker.onDidAccept(() => {
        const item = picker.selectedItems[0];
        if (!item) {
            return;
        }
        accepted = true;
        picker.hide();
        goToMatch(uri, item.match, query, false).catch((err) => {
            vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
        });
    });

    picker.onDidHide(() => {
        picker.dispose();
        if (!accepted && originalState) {
            vscode.window
                .showTextDocument(originalState.document, {
                    viewColumn: originalState.viewColumn,
                    selection: originalState.selection,
                    preview: false
                })
                .then(undefined, () => undefined);
        }
    });

    picker.show();
}