/**
 * Rust Client for pi-lens
 *
 * Provides Rust type checking and linting via cargo check and clippy.
 *
 * Requires: cargo (rustup)
 * Docs: https://doc.rust-lang.org/cargo/
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { safeSpawnAsync } from "./safe-spawn.js";
// --- Common install paths ---
const CARGO_WINDOWS_PATHS = [
    path.join(process.env.USERPROFILE || "", ".cargo", "bin", "cargo.exe"),
    path.join(process.env.SYSTEMDRIVE || "C:", "\\cargo", "bin", "cargo.exe"),
    "cargo.exe", // PATH
];
const CARGO_UNIX_PATHS = [
    path.join(process.env.HOME || "", ".cargo", "bin", "cargo"),
    "/usr/local/cargo/bin/cargo",
    "/usr/bin/cargo",
    "cargo", // PATH
];
// --- Client ---
export class RustClient {
    cargoAvailable = null;
    cargoPath = null;
    log;
    constructor(verbose = false) {
        this.log = verbose
            ? (msg) => console.error(`[rust] ${msg}`)
            : () => { };
    }
    /**
     * Find cargo executable path (async — probes PATH candidates off the event loop).
     */
    async findCargoPathAsync() {
        if (this.cargoPath)
            return this.cargoPath;
        const paths = process.platform === "win32" ? CARGO_WINDOWS_PATHS : CARGO_UNIX_PATHS;
        for (const p of paths) {
            try {
                if (p.includes("\\") || p.includes("/")) {
                    if (fs.existsSync(p)) {
                        this.cargoPath = p;
                        return p;
                    }
                }
                else {
                    const result = await safeSpawnAsync(p, ["--version"], {
                        timeout: 3000,
                    });
                    if (!result.error && result.status === 0) {
                        this.cargoPath = p;
                        return p;
                    }
                }
            }
            catch (err) {
                void err;
            }
        }
        return null;
    }
    /**
     * Check if cargo is installed (cached)
     */
    async isAvailableAsync() {
        if (this.cargoAvailable !== null)
            return this.cargoAvailable;
        this.cargoAvailable = (await this.findCargoPathAsync()) !== null;
        if (this.cargoAvailable) {
            this.log(`Cargo found: ${this.cargoPath}`);
        }
        return this.cargoAvailable;
    }
    /**
     * Check if a file is a Rust file
     */
    isRustFile(filePath) {
        return path.extname(filePath).toLowerCase() === ".rs";
    }
}
