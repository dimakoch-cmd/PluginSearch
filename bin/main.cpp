
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
//Проверяет можно ли прочитать файл
bool readFile(const string& fileName){
    ifstream file(fileName); //Открывает файл

    if (!file.is_open()) { //Проверяет возможность открытия файла и выводит соответствующие сообщение
        cerr << "Ошибка: не удалось открыть файл " << fileName << endl;
        return false;
    }
    return true;
}
// Выполняет поиск слова в файле
vector<SearchResult> searchQuery(const string& fileName, const string& query) {
    vector<SearchResult> results;
    ifstream file(fileName);

    string line;
    int lineNumber = 0;

    while (getline(file, line)) { //Читает каждую строку и проверяет ее на наличие запроса
        lineNumber++;
        if (line.find(query) != string::npos) {
            results.push_back({lineNumber, line}); //Запоминает содержимое и номер строки, содержащей запрос
        }
    }

    file.close();
    return results;
}

int main() {
    string fileName;
    string query;

    //Вывод стартовых сообщений и ввод необходимых данных
    cout << "=== C++ Search ===" << endl;
    cout << "Введите имя файла: ";
    getline(cin, fileName);

    //Проверки на ошибочный ввод имени файла
    if(!readFile(fileName)){
        return 0;
    }
    
    cout << "Введите слово для поиска: ";
    getline(cin, query);

    //Проверки на ошибочный ввод запроса
    if (query.empty()) {
        cerr << "Ошибка: поисковый запрос не должен быть пустым." << endl;
        return 0;
    }

    vector<SearchResult> results = searchQuery(fileName, query);

    if (results.empty()) {
        cout << "Совпадений не найдено." << endl;
    } else {
        cout << "\nНайдено совпадений: " << results.size() << endl;

        for (const SearchResult& result : results) { //Вывод всех совпадений
            cout << "Строка " << result.lineNumber << ": " << result.lineText << endl;
        }
    }

    return 0;
}
