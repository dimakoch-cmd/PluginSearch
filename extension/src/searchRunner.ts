import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export interface SearchMatch {
    line: number;   // номер строки, с 1
    column: number; // позиция слова в строке, с 0
    text: string;
}

export class SearchError extends Error {}

// Ищет бинарник: настройка, затем папка расширения, затем сборка C++ проекта
export function resolveBinaryPath(extensionPath: string): string {
    const configured = vscode.workspace
        .getConfiguration('pluginSearch')
        .get<string>('binaryPath', '')
        .trim();
    if (configured) {
        if (!fs.existsSync(configured)) {
            throw new SearchError(`Бинарник не найден по пути из настройки: ${configured}`);
        }
        return configured;
    }

    const candidates = [
        path.join(extensionPath, 'bin', 'search'),
        path.join(extensionPath, '..', 'bin', 'build', 'search')
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) {
        throw new SearchError(
            'Бинарник search не найден. Соберите C++ проект или задайте pluginSearch.binaryPath.'
        );
    }
    return found;
}

// Запускает бинарник и разбирает вывод формата "<номер>\t<строка>"
export function findMatches(
    binaryPath: string,
    filePath: string,
    query: string
): Promise<SearchMatch[]> {
    return new Promise((resolve, reject) => {
        // Аргументы передаются массивом, без shell: спецсимволы в запросе безопасны
        const child = spawn(binaryPath, [filePath, query]);
        let stdout = '';
        let stderr = '';

        // Читаем как строки UTF-8, Buffer не нужен
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
            stderr += chunk;
        });

        child.on('error', (err: Error & { code?: string }) => {
            if (err.code === 'EACCES') {
                reject(new SearchError(`Нет прав на запуск ${binaryPath}. Выполните: chmod +x`));
            } else {
                reject(new SearchError(`Не удалось запустить бинарник: ${err.message}`));
            }
        });

        child.on('close', (code) => {
            const errText = stderr.trim();
            switch (code) {
                case 0:
                    resolve(parseOutput(stdout, query));
                    break;
                case 1:
                    reject(new SearchError('Неверные аргументы запуска бинарника.'));
                    break;
                case 2:
                    reject(new SearchError('Пустой поисковый запрос.'));
                    break;
                case 3:
                    reject(new SearchError(`Не удалось открыть файл. ${errText}`));
                    break;
                default:
                    reject(new SearchError(`Бинарник завершился с кодом ${code}. ${errText}`));
            }
        });
    });
}

function parseOutput(output: string, query: string): SearchMatch[] {
    const matches: SearchMatch[] = [];
    for (const rawLine of output.split('\n')) {
        const tab = rawLine.indexOf('\t');
        if (tab < 0) {
            continue; // пустая последняя строка
        }
        const line = parseInt(rawLine.slice(0, tab), 10);
        if (Number.isNaN(line)) {
            continue;
        }
        const text = rawLine.slice(tab + 1).replace(/\r$/, ''); // файлы с CRLF
        matches.push({ line, column: text.indexOf(query), text });
    }
    return matches;
}