import { randomBytes } from "node:crypto";
import {
	mkdir,
	readFile,
	rename,
	rmdir,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const OWNER_FILE = "owner.json";
const OWNER_WRITE_GRACE_MS = 2_000;
const LOCK_WAIT_TIMEOUT_MS = 30_000;

type LockRecord = {
	version: 1;
	ownerPid: number;
	token: string;
};

function errorCode(error: unknown): unknown {
	return error instanceof Error && "code" in error ? error.code : undefined;
}

function processIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return errorCode(error) !== "ESRCH";
	}
}

function parseLockRecord(text: string): LockRecord | undefined {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const record = value as Record<string, unknown>;
	if (
		record.version !== 1 ||
		typeof record.ownerPid !== "number" ||
		!Number.isSafeInteger(record.ownerPid) ||
		record.ownerPid <= 0 ||
		typeof record.token !== "string" ||
		!/^[a-f0-9]{32}$/.test(record.token)
	)
		return undefined;
	return { version: 1, ownerPid: record.ownerPid, token: record.token };
}

async function unlinkIfPresent(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (error) {
		if (errorCode(error) !== "ENOENT") throw error;
	}
}

export class StoreWriteLock {
	private readonly lockDir: string;

	constructor(root: string) {
		this.lockDir = join(root, "write.lock");
	}

	async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
		const token = await this.acquire();
		try {
			return await operation();
		} finally {
			await this.release(token);
		}
	}

	private async acquire(): Promise<string> {
		await mkdir(dirname(this.lockDir), { recursive: true, mode: 0o700 });
		const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
		while (true) {
			const token = randomBytes(16).toString("hex");
			try {
				await mkdir(this.lockDir, { mode: 0o700 });
				try {
					const record: LockRecord = {
						version: 1,
						ownerPid: process.pid,
						token,
					};
					await writeFile(
						join(this.lockDir, OWNER_FILE),
						`${JSON.stringify(record)}\n`,
						{ flag: "wx", mode: 0o600 },
					);
					return token;
				} catch (error) {
					await rmdir(this.lockDir).catch(() => undefined);
					throw error;
				}
			} catch (error) {
				if (errorCode(error) !== "EEXIST") throw error;
			}
			if (await this.isStale()) {
				await this.breakStaleLock(token);
				continue;
			}
			if (Date.now() >= deadline)
				throw new Error("Timed out waiting for tool-result store write lock");
			await delay(10);
		}
	}

	private async isStale(): Promise<boolean> {
		try {
			const record = parseLockRecord(
				await readFile(join(this.lockDir, OWNER_FILE), "utf8"),
			);
			if (record) return !processIsAlive(record.ownerPid);
		} catch (error) {
			if (errorCode(error) !== "ENOENT") throw error;
		}
		try {
			const lockStats = await stat(this.lockDir);
			return Date.now() - lockStats.mtimeMs >= OWNER_WRITE_GRACE_MS;
		} catch (error) {
			if (errorCode(error) === "ENOENT") return false;
			throw error;
		}
	}

	private async breakStaleLock(token: string): Promise<void> {
		const staleDir = `${this.lockDir}.stale-${token}`;
		try {
			await rename(this.lockDir, staleDir);
		} catch (error) {
			if (errorCode(error) === "ENOENT") return;
			throw error;
		}
		await unlinkIfPresent(join(staleDir, OWNER_FILE));
		await rmdir(staleDir);
	}

	private async release(token: string): Promise<void> {
		const ownerPath = join(this.lockDir, OWNER_FILE);
		const record = parseLockRecord(await readFile(ownerPath, "utf8"));
		if (!record || record.ownerPid !== process.pid || record.token !== token) {
			throw new Error(
				"Tool-result store write lock ownership changed before release",
			);
		}
		await unlink(ownerPath);
		await rmdir(this.lockDir);
	}
}
