#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import pLimit from "p-limit";
import prettyBytes from "pretty-bytes";
import boxen from "boxen";
import figures from "figures";

const args = process.argv.slice(2);

function getArgValue(flag) {
    const index = args.indexOf(flag);
    if (index !== -1 && args[index + 1] && !args[index + 1].startsWith("--")) {
        return args[index + 1];
    }
    return null;
}

const options = {
    startDir: process.cwd(),
    dryRun: args.includes("--dry-run"),
    type: getArgValue("--type") || getArgValue("-t") || "auto", // auto, flutter, npm
    reinstall: args.includes("--reinstall") || args.includes("--pubget"),
    dartFix: args.includes("--dart-fix"),
    deep: args.includes("--deep") || args.includes("--pods"),
    interactive: args.includes("--interactive"),
    parallel: args.includes("--parallel"),
    json: args.includes("--json"),
    concurrency: Number(getArgValue("--concurrency")) || os.cpus().length,
    force: args.includes("--force"), // ignore "already clean" check
    noStats: args.includes("--no-stats") // skip size calculation
};

// Parse positional argument for start directory
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("-")) {
        // Check if previous arg was a flag that takes a value
        const prevArg = i > 0 ? args[i - 1] : null;
        const flagWithValue = ["--type", "-t", "--concurrency"].includes(prevArg);

        if (!flagWithValue) {
            options.startDir = path.resolve(arg);
            break;
        }
    }
}

const ignoredDirs = new Set([
    ".git",
    "node_modules",
    "build",
    ".dart_tool",
    ".idea",
    ".gradle",
    ".vscode",
    "ios",
    "android",
    "windows",
    "linux",
    "macos"
]);

const projects = [];
const results = [];
let totalSpaceSaved = 0;

const fsLimit = pLimit(50); // Global limit for concurrent FS operations

/**
 * Recursively calculates the size of a directory or file (Async).
 */
async function calculateDirSize(dir) {
    if (!fs.existsSync(dir)) return 0;
    
    return fsLimit(async () => {
        try {
            const stats = await fs.promises.stat(dir);
            if (stats.isFile()) return stats.size;

            const files = await fs.promises.readdir(dir);
            let size = 0;
            // Process sub-items; calculateDirSize itself is also limited by fsLimit
            const sizes = await Promise.all(
                files.map(file => calculateDirSize(path.join(dir, file)))
            );
            return sizes.reduce((acc, curr) => acc + curr, 0);
        } catch {
            return 0;
        }
    });
}

function isFlutterProject(projectDir) {
    const pubspecPath = path.join(projectDir, "pubspec.yaml");
    if (!fs.existsSync(pubspecPath)) return false;
    try {
        const content = fs.readFileSync(pubspecPath, "utf8");
        return content.includes("\nflutter:");
    } catch {
        return false;
    }
}

function isNpmProject(projectDir) {
    return fs.existsSync(path.join(projectDir, "package.json"));
}

/**
 * Scans for projects recursively.
 */
function scan(dir) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }

    let projectFound = false;

    // Check if current dir is a project
    if (dir === __dirname) {
        return; // Don't clean ourselves lol
    }

    // Check if current dir is a Flutter project
    if (options.type === "flutter" || options.type === "auto") {
        if (isFlutterProject(dir)) {
            projects.push({ path: dir, type: "flutter" });
            projectFound = true;
        }
    }

    // Check if current dir is an NPM project (only if not already identified as Flutter, 
    // though some Flutter projects might have package.json for web)
    if (!projectFound && (options.type === "npm" || options.type === "auto")) {
        if (isNpmProject(dir) && !dir.includes("node_modules")) {
            projects.push({ path: dir, type: "npm" });
            projectFound = true;
        }
    }

    // Only recurse if we haven't found a project OR if we are looking for NPM (workspaces)
    // Actually, it's safer to always recurse unless it's a known ignored dir.
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !ignoredDirs.has(entry.name)) {
            scan(fullPath);
        }
    }
}

function run(command, cwd) {
    if (options.dryRun) {
        console.log(chalk.yellow(`   [dry-run] ${command}`));
        return;
    }

    try {
        execSync(command, { cwd, stdio: "pipe" });
    } catch (err) {
        throw new Error(`Command failed: ${command}\n${err.stderr?.toString() || err.message}`);
    }
}

function getCleanupTargets(project) {
    if (project.type === "flutter") {
        const targets = ["build", ".dart_tool"];
        if (options.deep) {
            targets.push("ios/Pods", "ios/Podfile.lock", "pubspec.lock");
        }
        return targets;
    } else if (project.type === "npm") {
        const targets = ["node_modules", "dist", "build", ".next", "out", "coverage", ".turbo"];
        if (options.deep) {
            targets.push("package-lock.json", "yarn.lock", "pnpm-lock.yaml");
        }
        return targets;
    }
    return [];
}

/**
 * Checks if the project is already clean based on existence of targets.
 */
async function isAlreadyClean(project) {
    if (options.force) return false;
    const targets = getCleanupTargets(project);
    for (const target of targets) {
        if (fs.existsSync(path.join(project.path, target))) {
            return false;
        }
    }
    return true;
}

async function processProject(project, index, total) {
    const name = path.basename(project.path);
    const result = {
        name,
        path: project.path,
        type: project.type,
        success: true,
        saved: 0,
        skipped: false,
        error: null
    };

    if (await isAlreadyClean(project)) {
        result.skipped = true;
        results.push(result);
        return;
    }

    // In parallel mode, we don't want multiple spinners fighting for the terminal
    let spinner;
    if (!options.parallel) {
        spinner = ora(`Cleaning ${chalk.bold(name)} ${chalk.dim(`(${project.type})`)}`).start();
    } else {
        console.log(`${chalk.blue(figures.play)} Starting: ${chalk.bold(name)} ${chalk.dim(`(${project.type})`)}`);
    }

    try {
        let savedSpace = 0;
        const targets = getCleanupTargets(project);

        for (const target of targets) {
            const targetPath = path.join(project.path, target);
            if (fs.existsSync(targetPath)) {
                if (!options.noStats) {
                    if (spinner) spinner.text = `Calculating size: ${chalk.bold(name)} -> ${chalk.dim(target)}`;
                    savedSpace += await calculateDirSize(targetPath);
                }

                if (spinner) spinner.text = `Deleting: ${chalk.bold(name)} -> ${chalk.dim(target)}`;
                if (!options.dryRun) {
                    await fs.promises.rm(targetPath, { recursive: true, force: true });
                }
            }
        }

        if (project.type === "flutter") {
            if (spinner) spinner.text = `Running flutter clean: ${chalk.bold(name)}`;
            const hasFVM = fs.existsSync(path.join(project.path, ".fvm"));
            const flutterCmd = hasFVM ? "fvm flutter" : "flutter";

            run(`${flutterCmd} clean`, project.path);

            if (options.reinstall) {
                if (spinner) spinner.text = `Running pub get: ${chalk.bold(name)}`;
                run(`${flutterCmd} pub get`, project.path);
            }
            if (options.dartFix) {
                if (spinner) spinner.text = `Running dart fix: ${chalk.bold(name)}`;
                run("dart fix --apply", project.path);
            }
        } else if (project.type === "npm") {
            if (options.reinstall) {
                const hasYarn = fs.existsSync(path.join(project.path, "yarn.lock"));
                const hasPnpm = fs.existsSync(path.join(project.path, "pnpm-lock.yaml"));
                const cmd = hasPnpm ? "pnpm install" : (hasYarn ? "yarn install" : "npm install");
                if (spinner) spinner.text = `Running ${cmd}: ${chalk.bold(name)}`;
                run(cmd, project.path);
            }
        }

        result.saved = savedSpace;
        totalSpaceSaved += savedSpace;

        const successMsg = `Cleaned ${chalk.bold(name)} ${chalk.green(`(+${prettyBytes(savedSpace)})`)}`;
        if (spinner) {
            spinner.succeed(successMsg);
        } else {
            console.log(`${chalk.green(figures.tick)} ${successMsg}`);
        }
    } catch (err) {
        result.success = false;
        result.error = err.message;
        const errMsg = `Failed ${chalk.bold(name)}: ${chalk.red(err.message)}`;
        if (spinner) {
            spinner.fail(errMsg);
        } else {
            console.error(`${chalk.red(figures.cross)} ${errMsg}`);
        }
    }

    results.push(result);
}

async function main() {
    console.log(boxen(chalk.cyan.bold("🌊 CleanWave 2.0"), {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "cyan",
        title: "Premium Cleanup",
        titleAlignment: "center"
    }));

    const scanSpinner = ora(`Scanning ${chalk.bold(options.startDir)} for projects...`).start();
    scan(options.startDir);
    scanSpinner.succeed(`Found ${chalk.bold(projects.length)} project(s)`);

    if (projects.length === 0) {
        console.log(chalk.yellow(`\n${figures.warning} No projects found in ${options.startDir}`));
        console.log(chalk.dim("Try specifying a different directory or use --type to force a scan."));
        process.exit(0);
    }

    let selectedProjects = projects;
    if (options.interactive) {
        const { selected } = await inquirer.prompt([
            {
                type: "checkbox",
                name: "selected",
                message: "Select projects to clean:",
                choices: projects.map(p => ({
                    name: `${path.basename(p.path)} ${chalk.dim(`(${p.type})`)}`,
                    value: p,
                    checked: true
                })),
                pageSize: 15
            }
        ]);
        selectedProjects = selected;
    }

    if (selectedProjects.length === 0) {
        console.log(chalk.yellow(`\n${figures.info} No projects selected.`));
        process.exit(0);
    }

    console.log(""); // Spacer

    if (options.parallel) {
        const limit = pLimit(options.concurrency);
        await Promise.all(selectedProjects.map(p => limit(() => processProject(p))));
    } else {
        for (const p of selectedProjects) {
            await processProject(p);
        }
    }

    // Final Report
    const successful = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n${chalk.bold("Cleanup Summary")}`);
    console.log(`${"─".repeat(20)}`);

    if (successful > 0) console.log(`${chalk.green(figures.tick)} ${successful} project(s) cleaned`);
    if (skipped > 0) console.log(`${chalk.blue(figures.info)} ${skipped} project(s) already clean`);
    if (failed > 0) console.log(`${chalk.red(figures.cross)} ${failed} project(s) failed`);

    if (totalSpaceSaved > 0) {
        const summaryBox = boxen(
            chalk.cyan.bold(`${figures.star} Total Space Recovered: ${prettyBytes(totalSpaceSaved)}`),
            { padding: 0.5, margin: { top: 1 }, borderStyle: "single", borderColor: "green" }
        );
        console.log(summaryBox);
    } else if (successful > 0) {
        console.log(chalk.dim("\nNo significant space was recovered (files were already small)."));
    }

    if (options.json) {
        const reportPath = path.join(process.cwd(), "cleanwave-report.json");
        fs.writeFileSync(reportPath, JSON.stringify({
            results,
            totalSpaceSaved,
            prettySaved: prettyBytes(totalSpaceSaved),
            timestamp: new Date()
        }, null, 2));
        console.log(chalk.dim(`\nReport saved to: ${reportPath}`));
    }

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(chalk.red(`\n${figures.cross} Critical Error: ${err.message}`));
    process.exit(1);
});