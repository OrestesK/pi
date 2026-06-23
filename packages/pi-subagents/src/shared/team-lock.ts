import * as fs from "node:fs";
import * as path from "node:path";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error: unknown) {
		if (isErrnoException(error) && error.code === "EPERM") return true;
		return false;
	}
}

function readLockPid(lockPath: string): number | null {
	try {
		const parsed = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as { pid?: unknown };
		return typeof parsed.pid === "number" && Number.isInteger(parsed.pid) ? parsed.pid : null;
	} catch {
		return null;
	}
}

export interface TeamLockOptions {
	timeoutMs?: number;
	staleMs?: number;
	pollMs?: number;
	label?: string;
	now?: () => number;
}

export async function withTeamLock<T>(lockPath: string, fn: () => Promise<T>, options: TeamLockOptions = {}): Promise<T> {
	fs.mkdirSync(path.dirname(lockPath), { recursive: true });
	const timeoutMs = options.timeoutMs ?? 5_000;
	const staleMs = options.staleMs ?? 30_000;
	const pollMs = options.pollMs ?? 10;
	const now = options.now ?? Date.now;
	const startedAt = now();
	let fd: number | null = null;
	let attempt = 0;

	while (fd === null) {
		try {
			fd = fs.openSync(lockPath, "wx");
			fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, label: options.label, createdAt: new Date(now()).toISOString() }));
		} catch (error: unknown) {
			if (!isErrnoException(error) || error.code !== "EEXIST") throw error;

			try {
				const stat = fs.statSync(lockPath);
				const age = now() - stat.mtimeMs;
				const pid = readLockPid(lockPath);
				const holderDead = pid !== null && !isPidAlive(pid);
				const missingPidAndOld = pid === null && age > staleMs;
				if (holderDead || missingPidAndOld) {
					const stalePath = `${lockPath}.stale.${process.pid}.${Date.now()}`;
					fs.renameSync(lockPath, stalePath);
					fs.rmSync(stalePath, { force: true });
					attempt = 0;
					continue;
				}
			} catch (staleError: unknown) {
				if (isErrnoException(staleError) && staleError.code === "ENOENT") {
					attempt = 0;
					continue;
				}
			}

			const elapsedMs = now() - startedAt;
			if (elapsedMs > timeoutMs) {
				const pid = readLockPid(lockPath);
				const pidText = pid === null ? "" : ` held by PID ${pid}`;
				throw new Error(`Timeout acquiring team lock: ${lockPath}${pidText}`);
			}

			attempt += 1;
			const backoff = Math.min(250, pollMs * 2 ** Math.min(attempt, 5));
			await sleep(Math.max(1, Math.min(timeoutMs - elapsedMs, backoff)));
		}
	}

	try {
		return await fn();
	} finally {
		if (fd !== null) {
			try {
				fs.closeSync(fd);
			} catch {
				// ignore close failures during cleanup
			}
		}
		try {
			fs.rmSync(lockPath, { force: true });
		} catch {
			// ignore unlink failures during cleanup
		}
	}
}
