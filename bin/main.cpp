#include <iostream>
#include <fstream>
#include <string>
#include <vector>

using namespace std;

// Режимы поиска, задаются флагами командной строки
struct SearchOptions {
    bool ignoreCase = false;
    bool wholeWord = false;
};

// Хранит информацию о найденном совпадении (смещения в байтах, с 0)
struct SearchResult {
    int lineNumber;
    size_t column;
    size_t length;
    string lineText;
};

// Символ слова: ASCII-буква, цифра, '_' или любой байт UTF-8 вне ASCII
bool IsWordByte(char ch) {
    unsigned char c = static_cast<unsigned char>(ch);
    return (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') ||
           (c >= 'a' && c <= 'z') || c == '_' || c >= 0x80;
}

// Проверяет границы слова вокруг совпадения [pos, pos + len).
// Граница проверяется только со стороны, где само совпадение начинается/заканчивается символом слова.
bool IsWholeWord(const string& text, size_t pos, size_t len) {
    size_t end = pos + len;
    bool leftOk = pos == 0 || !IsWordByte(text[pos]) || !IsWordByte(text[pos - 1]);
    bool rightOk = end >= text.size() || !IsWordByte(text[end - 1]) || !IsWordByte(text[end]);
    return leftOk && rightOk;
}

// Приводит ASCII и кириллицу (UTF-8) к нижнему регистру.
// Длина в байтах не меняется, поэтому смещения в результате совпадают со смещениями в исходной строке.
string FoldUtf8(string text) {
    for (size_t i = 0; i < text.size(); ++i) {
        unsigned char c = static_cast<unsigned char>(text[i]);
        if (c >= 'A' && c <= 'Z') {
            text[i] = static_cast<char>(c + 32);
        } else if (c == 0xD0 && i + 1 < text.size()) {
            unsigned char next = static_cast<unsigned char>(text[i + 1]);
            if (next >= 0x90 && next <= 0x9F) {          // А-П -> а-п
                text[i + 1] = static_cast<char>(next + 0x20);
            } else if (next >= 0xA0 && next <= 0xAF) {   // Р-Я -> р-я
                text[i] = static_cast<char>(0xD1);
                text[i + 1] = static_cast<char>(next - 0x20);
            } else if (next >= 0x80 && next <= 0x8F) {   // Ё и U+0400-040F -> ё и U+0450-045F
                text[i] = static_cast<char>(0xD1);
                text[i + 1] = static_cast<char>(next + 0x10);
            }
            ++i; // второй байт символа уже обработан
        }
    }
    return text;
}

// Ищет первое подходящее совпадение в строке с учётом режимов
class LineMatcher {
public:
    LineMatcher(const string& query, const SearchOptions& options)
        : options_(options),
          needle_(options.ignoreCase ? FoldUtf8(query) : query) {}

    bool Find(const string& line, size_t& pos, size_t& len) const {
        string folded;
        const string& haystack = options_.ignoreCase ? (folded = FoldUtf8(line)) : line;

        size_t from = 0;
        while ((pos = haystack.find(needle_, from)) != string::npos) {
            len = needle_.size();
            if (!options_.wholeWord || IsWholeWord(haystack, pos, len)) {
                return true;
            }
            from = pos + 1;
        }
        return false;
    }

private:
    SearchOptions options_;
    string needle_;
};

// Проверяет возможность открытия файла
bool ReadFile(const string& fileName) {
    ifstream file(fileName);

    if (!file.is_open()) {
        cerr << "Ошибка: не удалось открыть файл: " << fileName << endl;
        return false;
    }
    return true;
}

// Выполняет поиск в файле, по одному совпадению на строку
vector<SearchResult> SearchQuery(const string& fileName, const LineMatcher& matcher) {
    vector<SearchResult> results;
    ifstream file(fileName);

    string line;
    int lineNumber = 0;

    while (getline(file, line)) {
        lineNumber++;

        size_t pos = 0;
        size_t len = 0;
        if (matcher.Find(line, pos, len)) {
            results.push_back({lineNumber, pos, len, line});
        }
    }

    file.close();
    return results;
}

void PrintUsage() {
    cerr << "Использование: search [--ignore-case] [--whole-word] [--] <file> <query>" << endl;
}

int main(int argc, char* argv[]) {
    SearchOptions options;
    vector<string> positional;
    bool optionsEnded = false;

    // Разбираем флаги и позиционные аргументы
    for (int i = 1; i < argc; ++i) {
        string arg = argv[i];

        if (!optionsEnded && arg == "--") {
            optionsEnded = true;
            continue;
        }
        if (!optionsEnded && arg.size() > 2 && arg.compare(0, 2, "--") == 0) {
            if (arg == "--ignore-case") {
                options.ignoreCase = true;
            } else if (arg == "--whole-word") {
                options.wholeWord = true;
            } else {
                cerr << "Ошибка: неизвестный флаг: " << arg << endl;
                PrintUsage();
                return 1;
            }
            continue;
        }
        positional.push_back(arg);
    }

    // Проверяем количество аргументов
    if (positional.size() != 2) {
        PrintUsage();
        return 1;
    }

    string fileName = positional[0];
    string query = positional[1];

    // Проверяем поисковый запрос
    if (query.empty()) {
        cerr << "Ошибка: пустой поисковый запрос." << endl;
        return 2;
    }

    // Проверяем доступность файла
    if (!ReadFile(fileName)) {
        return 3;
    }

    // Выполняем поиск
    LineMatcher matcher(query, options);
    vector<SearchResult> results = SearchQuery(fileName, matcher);

    // Выводим результаты в формате: <номер строки> \t <колонка> \t <длина> \t <содержимое строки>
    for (const SearchResult& result : results) {
        cout << result.lineNumber << '\t' << result.column << '\t'
             << result.length << '\t' << result.lineText << '\n';
    }

    return 0;
}