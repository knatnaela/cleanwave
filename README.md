# 🌊 CleanWave 2.0

[![NPM Version](https://img.shields.io/npm/v/cleanwave.svg)](https://www.npmjs.com/package/cleanwave)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/Platform-Flutter%20%7C%20NPM-blue.svg)](#)

**CleanWave** is a premium, high-performance CLI utility designed to reclaim your disk space by purging heavy build artifacts and dependency caches from your development projects. Whether you are a Flutter enthusiast or a Node.js veteran, CleanWave makes project maintenance effortless.

---

## ✨ Features

- 🎯 **Multi-Project Support**: Automatically detects and cleans both **Flutter** and **NPM** (Node.js) projects.
- ⚡ **Turbo Parallelism**: Processes multiple projects simultaneously using optimized asynchronous execution.
- 📊 **Space Recovery Stats**: Get a detailed report of exactly how much space you've reclaimed.
- 🛡️ **Smart Skip Logic**: Intelligently skips already clean projects to save time.
- 🚀 **Self-Protection**: Built-in logic to ensure CleanWave never deletes its own dependencies.
- 🎨 **Premium UI**: Beautiful terminal interface with smooth animations and human-readable feedback.
- 🔍 **Interactive Mode**: Select specifically which projects to clean.

---

## 🚀 Installation

Install CleanWave globally via NPM:

```bash
npm install -g cleanwave
```

---

## 🛠 Usage

Simply run `cleanwave` in any directory to scan for sub-projects:

```bash
cleanwave
```

Or specify a path and flags:

```bash
cleanwave ~/Documents/Projects --type npm --parallel
```

### 🚩 Flags & Options

| Flag | Description |
| :--- | :--- |
| `--type`, `-t` | Specify project type: `flutter`, `npm`, or `auto` (default). |
| `--parallel` | Enable parallel processing for multi-project cleanup. |
| `--reinstall` | Automatically run `npm install` or `pub get` after cleaning. |
| `--deep` | Deep clean mode (removes lock files and Pods). |
| `--interactive` | Manually select which projects to clean from a list. |
| `--no-stats` | Skip size calculation for maximum speed on massive projects. |
| `--dry-run` | Preview what would be deleted without making changes. |
| `--json` | Export a detailed cleanup report as a JSON file. |

---

## 🧼 What gets cleaned?

### **Flutter Projects**
- `build/`
- `.dart_tool/`
- `ios/Pods` (Deep mode)
- `ios/Podfile.lock` (Deep mode)
- Runs official `flutter clean`

### **NPM Projects**
- `node_modules/`
- `dist/` & `build/`
- `.next/` & `out/`
- `coverage/` & `.turbo/`
- `package-lock.json` / `yarn.lock` (Deep mode)

---

## 🛡 Safety First

CleanWave is designed with a "Safety First" philosophy. It **only** targets folders typically ignored by Git (like `node_modules` or `build`). It will **never** touch your source code or configuration files.

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

Built with ❤️ by [Natnael Adane](https://github.com/knatnaela)
