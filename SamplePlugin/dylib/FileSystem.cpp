// ===================================================================
//  FileSystem.cpp
//  MCPStudio - Custom Tool SDK - SamplePlugin
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================
#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <sstream>
#include <algorithm>
#include <functional>

// Forward declarations
class FileSystemNode;
class Directory;
class File;
class FileSystem;

enum class FileType {
    FILE,
    DIRECTORY
};

enum class FileMode {
    READ,
    WRITE,
    EXECUTE
};

class File {
public:
    std::string name;
    std::string content;
    size_t size = 0;
    bool exists = false;
    
    File(const std::string& n) : name(n), size(0) {}
    
    void writeContent(const std::string& data) {
        content = data;
        size = content.length();
        exists = true;
    }
    
    std::string readContent() const {
        return content;
    }
    
    void deleteFile() {
        content.clear();
        size = 0;
        exists = false;
    }
};

class Directory {
public:
    std::string name;
    std::map<std::string, File*> files;
    std::map<std::string, Directory*> subdirectories;
    bool exists = false;
    
    Directory(const std::string& n) : name(n), exists(true) {}
    
    void createFile(const std::string& filename, const std::string& content = "") {
        files[filename] = new File(filename);
        if (!content.empty()) {
            files[filename]->writeContent(content);
        }
    }
    
    Directory* createSubdirectory(const std::string& dirname) {
        subdirectories[dirname] = new Directory(dirname);
        return subdirectories[dirname];
    }
    
    File* getFile(const std::string& filename) {
        auto it = files.find(filename);
        if (it != files.end()) {
            return it->second;
        }
        return nullptr;
    }
    
    Directory* getSubdirectory(const std::string& dirname) {
        auto it = subdirectories.find(dirname);
        if (it != subdirectories.end()) {
            return it->second;
        }
        return nullptr;
    }
    
    void deleteFile(const std::string& filename) {
        auto it = files.find(filename);
        if (it != files.end()) {
            delete it->second;
            files.erase(it);
        }
    }
    
    void deleteSubdirectory(const std::string& dirname) {
        auto it = subdirectories.find(dirname);
        if (it != subdirectories.end()) {
            delete it->second;
            subdirectories.erase(it);
        }
    }
    
    size_t getFileCount() const {
        return files.size();
    }
    
    size_t getSubdirectoryCount() const {
        return subdirectories.size();
    }
};

class FileSystem {
private:
    Directory* root;
    std::string currentPath;
    
public:
    FileSystem() : root(new Directory("/")) {}
    
    ~FileSystem() {
        delete root;
    }
    
    // Helper functions for path manipulation
    std::vector<std::string> splitPath(const std::string& path) const {
        std::vector<std::string> parts;
        std::stringstream ss(path);
        std::string part;
        
        while (std::getline(ss, part, '/')) {
            if (!part.empty()) {
                parts.push_back(part);
            }
        }
        return parts;
    }
    
    std::string joinPath(const std::vector<std::string>& parts) const {
        std::string result = "";
        for (const auto& part : parts) {
            if (!result.empty()) {
                result += "/";
            }
            result += part;
        }
        return result;
    }
    
    Directory* getCurrentDirectory() {
        std::vector<std::string> parts = splitPath(currentPath);
        Directory* current = root;
        
        for (const auto& part : parts) {
            if (current->getSubdirectory(part)) {
                current = current->getSubdirectory(part);
            } else {
                return nullptr;
            }
        }
        return current;
    }
    
    // Internal helper to strip trailing slash
    static std::string stripTrailingSlash(const std::string& path) {
        if (!path.empty() && path.back() == '/') {
            return path.substr(0, path.length() - 1);
        }
        return path;
    }
    
    // Public API
    
    bool createDirectory(const std::string& path) {
        // Handle trailing slash
        std::string cleanPath = stripTrailingSlash(path);
        
        std::vector<std::string> parts = splitPath(cleanPath);
        Directory* current = root;
        
        for (const auto& part : parts) {
            if (current->getSubdirectory(part)) {
                current = current->getSubdirectory(part);
            } else {
                current->createSubdirectory(part);
                current = current->getSubdirectory(part);
            }
        }
        
        return true;
    }
    
    bool removeDirectory(const std::string& path) {
        // Handle trailing slash
        std::string cleanPath = stripTrailingSlash(path);
        
        std::vector<std::string> parts = splitPath(cleanPath);
        Directory* current = root;
        
        for (size_t i = 0; i < parts.size(); ++i) {
            if (current->getSubdirectory(parts[i])) {
                current = current->getSubdirectory(parts[i]);
            } else {
                return false;
            }
        }
        
        // Delete all contents first
        for (auto& pair : current->files) {
            delete pair.second;
        }
        current->files.clear();
        
        for (auto& pair : current->subdirectories) {
            delete pair.second;
        }
        current->subdirectories.clear();
        
        // Remove from parent
        if (parts.size() > 1) {
            auto parent = root;
            for (size_t i = 0; i < parts.size() - 1; ++i) {
                parent = parent->getSubdirectory(parts[i]);
            }
            parent->deleteSubdirectory(parts[parts.size() - 1]);
        }
        
        return true;
    }
    
    bool createFile(const std::string& path, const std::string& content = "") {
        // Handle trailing slash (shouldn't be there for files)
        if (!path.empty() && path.back() == '/') {
            return false;
        }
        
        std::vector<std::string> parts = splitPath(path);
        Directory* current = root;
        
        for (size_t i = 0; i < parts.size() - 1; ++i) {
            if (!current->getSubdirectory(parts[i])) {
                return false;
            }
            current = current->getSubdirectory(parts[i]);
        }
        
        std::string filename = parts.back();
        current->createFile(filename, content);
        return true;
    }
    
    bool removeFile(const std::string& path) {
        // Handle trailing slash
        if (!path.empty() && path.back() == '/') {
            return false;
        }
        
        std::vector<std::string> parts = splitPath(path);
        Directory* current = root;
        
        for (size_t i = 0; i < parts.size() - 1; ++i) {
            if (!current->getSubdirectory(parts[i])) {
                return false;
            }
            current = current->getSubdirectory(parts[i]);
        }
        
        std::string filename = parts.back();
        current->deleteFile(filename);
        return true;
    }
    
    bool readFile(const std::string& path, std::string& content) {
        // Handle trailing slash
        if (!path.empty() && path.back() == '/') {
            return false;
        }
        
        std::vector<std::string> parts = splitPath(path);
        Directory* current = root;
        
        for (size_t i = 0; i < parts.size() - 1; ++i) {
            if (!current->getSubdirectory(parts[i])) {
                return false;
            }
            current = current->getSubdirectory(parts[i]);
        }
        
        std::string filename = parts.back();
        File* file = current->getFile(filename);
        
        if (file && file->exists) {
            content = file->readContent();
            return true;
        }
        
        return false;
    }
    
    bool writeFile(const std::string& path, const std::string& content) {
        // Handle trailing slash
        if (!path.empty() && path.back() == '/') {
            return false;
        }
        
        std::vector<std::string> parts = splitPath(path);
        Directory* current = root;
        
        for (size_t i = 0; i < parts.size() - 1; ++i) {
            if (!current->getSubdirectory(parts[i])) {
                return false;
            }
            current = current->getSubdirectory(parts[i]);
        }
        
        std::string filename = parts.back();
        File* file = current->getFile(filename);
        
        if (file) {
            file->writeContent(content);
            return true;
        } else {
            current->createFile(filename, content);
            return true;
        }
    }
    
    bool listDirectory(const std::string& path, std::vector<std::string>& entries) const {
        // Handle trailing slash
        std::string cleanPath = stripTrailingSlash(path);
        
        std::vector<std::string> parts = splitPath(cleanPath);
        Directory* current = root;
        
        for (const auto& part : parts) {
            if (!current->getSubdirectory(part)) {
                return false;
            }
            current = current->getSubdirectory(part);
        }
        
        std::vector<std::string> allEntries;
        
        // Add files
        for (const auto& pair : current->files) {
            allEntries.push_back(pair.first);
        }
        
        // Add subdirectories
        for (const auto& pair : current->subdirectories) {
            allEntries.push_back(pair.first);
        }
        
        std::sort(allEntries.begin(), allEntries.end());
        entries = allEntries;
        
        return true;
    }
    
    bool changeDirectory(const std::string& path) {
        // Handle trailing slash
        std::string cleanPath = stripTrailingSlash(path);
        
        std::vector<std::string> parts = splitPath(cleanPath);
        
        if (parts.empty()) {
            currentPath = "/";
            return true;
        }
        
        // Check if path exists and is a directory
        Directory* target = root;
        for (const auto& part : parts) {
            if (!target->getSubdirectory(part)) {
                return false;
            }
            target = target->getSubdirectory(part);
        }
        
        // Check it's actually a directory, not a file
        if (target->files.find(parts.back()) != target->files.end()) {
            return false;
        }
        
        currentPath = cleanPath;
        return true;
    }
    
    std::string getCurrentPath() const {
        return currentPath.empty() ? "/" : currentPath;
    }
    
    // Access root for demo purposes
    Directory* getRoot() {
        return root;
    }
    
    // List all contents recursively (for display purposes)
    void printDirectoryTree(Directory* dir, int depth = 0) const {
        for (const auto& pair : dir->files) {
            std::cout << std::string(depth * 2, ' ') << "- " << pair.first 
                      << " (" << pair.second->size << " bytes)" << std::endl;
        }
        for (const auto& pair : dir->subdirectories) {
            std::cout << std::string(depth * 2, ' ') << "/ " << pair.first << std::endl;
            printDirectoryTree(pair.second, depth + 1);
        }
    }
};

#if 0 // Example usage and demonstration
int main() {
    std::cout << "=== Toy File System Demo ===" << std::endl;
    std::cout << std::endl;
    
    FileSystem fs;
    
    // Create directory structure
    std::cout << "--- Creating Directory Structure ---" << std::endl;
    fs.createDirectory("/home");
    fs.createDirectory("/home/user");
    fs.createDirectory("/home/user/documents");
    fs.createDirectory("/home/user/projects");
    fs.createDirectory("/home/user/projects/cpp");
    fs.createDirectory("/home/user/projects/python");
    fs.createDirectory("/etc");
    fs.createDirectory("/etc/config");
    
    std::cout << "Current directory: " << fs.getCurrentPath() << std::endl;
    std::cout << std::endl;
    
    // Create files with content
    std::cout << "--- Creating Files ---" << std::endl;
    fs.createFile("/home/user/documents/notes.txt", "Hello, this is a note!");
    fs.createFile("/home/user/documents/todo.txt", "- Buy milk\n- Walk the dog\n- Read a book");
    fs.createFile("/home/user/projects/cpp/example.cpp", "#include <iostream>\nint main() {\n    std::cout << \"Hello World!\";\n    return 0;\n}");
    fs.createFile("/home/user/projects/python/script.py", "print('Python script')");
    fs.createFile("/etc/config/settings.conf", "debug=true\nport=8080");
    
    std::cout << std::endl;
    
    // Read files
    std::cout << "--- Reading Files ---" << std::endl;
    std::string content;
    if (fs.readFile("/home/user/documents/notes.txt", content)) {
        std::cout << "notes.txt: " << content << std::endl;
    }
    
    if (fs.readFile("/etc/config/settings.conf", content)) {
        std::cout << "settings.conf:" << std::endl;
        for (size_t i = 0; i < content.length(); ++i) {
            std::cout << content[i];
            if (content[i] == '\n') {
                std::cout << "---" << std::endl;
            }
        }
    }
    
    std::cout << std::endl;
    
    // List directory contents
    std::cout << "--- Listing Directory Contents ---" << std::endl;
    std::vector<std::string> entries;
    fs.listDirectory("/home/user/documents", entries);
    for (const auto& entry : entries) {
        std::cout << "  - " << entry << std::endl;
    }
    
    fs.listDirectory("/home/user/projects", entries);
    for (const auto& entry : entries) {
        std::cout << "  - " << entry << std::endl;
    }
    
    std::cout << std::endl;
    
    // Write to existing file
    std::cout << "--- Updating Files ---" << std::endl;
    fs.writeFile("/home/user/documents/notes.txt", "Updated note with new content!");
    if (fs.readFile("/home/user/documents/notes.txt", content)) {
        std::cout << "Updated notes.txt: " << content << std::endl;
    }
    
    std::cout << std::endl;
    
    // Change directory
    std::cout << "--- Changing Directory ---" << std::endl;
    fs.changeDirectory("/home/user");
    std::cout << "Current directory: " << fs.getCurrentPath() << std::endl;
    
    fs.listDirectory(".", entries);
    for (const auto& entry : entries) {
        std::cout << "  - " << entry << std::endl;
    }
    
    std::cout << std::endl;
    
    // Show directory tree
    std::cout << "--- Directory Tree ---" << std::endl;
    fs.printDirectoryTree(fs.getRoot());
    
    std::cout << std::endl;
    
    // Remove file and directory
    std::cout << "--- Removing Files and Directories ---" << std::endl;
    fs.removeFile("/home/user/documents/todo.txt");
    std::cout << "Removed: /home/user/documents/todo.txt" << std::endl;
    
    // Create a temporary directory to remove
    fs.createDirectory("/tmp/temp");
    fs.createFile("/tmp/temp/data.txt", "temp data");
    fs.removeDirectory("/tmp/temp");
    std::cout << "Removed: /tmp/temp (and all contents)" << std::endl;
    
    std::cout << std::endl;
    
    // Final directory tree
    std::cout << "--- Final Directory Tree ---" << std::endl;
    fs.printDirectoryTree(fs.getRoot());
    
    std::cout << std::endl << "=== Demo Complete ===" << std::endl;
    
    return 0;
}
#endif

