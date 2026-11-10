#include <iostream>
#include <fstream>
#include <string>
#include <vector>

using namespace std;

// Хранит информацию о найденном совпадении
struct SearchResult {
    int lineNumber;
    string lineText;
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

// Выполняет поиск слова в файле
vector<SearchResult> SearchQuery(const string& fileName, const string& query) {
    vector<SearchResult> results;
    ifstream file(fileName);

    string line;
    int lineNumber = 0;

    while (getline(file, line)) {
        lineNumber++;

        if (line.find(query) != string::npos) {
            results.push_back({lineNumber, line});
        }
    }

    file.close();
    return results;
}

int main(int argc, char* argv[]) {

    // Проверяем количество аргументов
    if (argc != 3) {
        cerr << "Использование: search <file> <query>" << endl;
        return 1;
    }

    string fileName = argv[1];
    string query = argv[2];

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
    vector<SearchResult> results = SearchQuery(fileName, query);

    // Выводим результаты в формате: <номер строки> \t <содержимое строки>
    for (const SearchResult& result : results) {
        cout << result.lineNumber << '\t' << result.lineText << endl;
    }

    return 0;
}
