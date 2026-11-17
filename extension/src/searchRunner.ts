import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export interface SearchOptions {
    caseSensitive: boolean;
    wholeWord: boolean;
}

export interface SearchMatch {
    line: number;   // номер строки, с 1
    column: number; // начало совпадения в строке (символы UTF-16), с 0
    length: number; // длина совпадения (символы UTF-16)
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

// Строит аргументы командной строки для бинарника
function buildArgs(filePath: string, query: string, options: SearchOptions): string[] {
    const args: string[] = [];
    if (!options.caseSensitive) {
        args.push('--ignore-case');
    }
    if (options.wholeWord) {
        args.push('--whole-word');
    }
    // "--" защищает от запросов, начинающихся с "--"
    args.push('--', filePath, query);
    return args;
}

// Запускает бинарник и разбирает вывод формата "<строка>\t<колонка>\t<длина>\t<текст>"
export function findMatches(
    binaryPath: string,
    filePath: string,
    query: string,
    options: SearchOptions
): Promise<SearchMatch[]> {
    return new Promise((resolve, reject) => {
        // Аргументы передаются массивом, без shell: спецсимволы в запросе безопасны
        const child = spawn(binaryPath, buildArgs(filePath, query, options));
        let stdout = '';
        let stderr = '';

        // Читаем как строки UTF-8
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
                    resolve(parseOutput(stdout));
                    break;
                case 1:
                    reject(new SearchError(
                        `Неверные аргументы запуска бинарника. Возможно, бинарник устарел, пересоберите его. ${errText}`
                    ));
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

// Переводит смещение в байтах UTF-8 в число символов UTF-16 (как считает редактор)
function toUtf16Length(bytes: Buffer, from: number, to: number): number {
    return bytes.subarray(from, to).toString('utf8').length;
}

function parseOutput(output: string): SearchMatch[] {
    const matches: SearchMatch[] = [];
    for (const rawLine of output.split('\n')) {
        const t1 = rawLine.indexOf('\t');
        const t2 = t1 < 0 ? -1 : rawLine.indexOf('\t', t1 + 1);
        const t3 = t2 < 0 ? -1 : rawLine.indexOf('\t', t2 + 1);
        if (t3 < 0) {
            continue; // пустая последняя строка
        }

        const line = parseInt(rawLine.slice(0, t1), 10);
        const byteColumn = parseInt(rawLine.slice(t1 + 1, t2), 10);
        const byteLength = parseInt(rawLine.slice(t2 + 1, t3), 10);
        if (Number.isNaN(line) || Number.isNaN(byteColumn) || Number.isNaN(byteLength)) {
            continue;
        }

        const text = rawLine.slice(t3 + 1).replace(/\r$/, ''); // файлы с CRLF
        const bytes = Buffer.from(text, 'utf8');
        matches.push({
            line,
            column: toUtf16Length(bytes, 0, byteColumn),
            length: toUtf16Length(bytes, byteColumn, byteColumn + byteLength),
            text
        });
    }
    return matches;
}