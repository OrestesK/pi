import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const { resolveTempScopeId } = await loadTs("../../src/shared/types.ts");

test("resolveTempScopeId respects explicitly provided own callbacks", () => {
	assert.equal(
		resolveTempScopeId({
			env: {},
			getuid: undefined,
			userInfo: () => ({ username: "fallback-user" }),
		}),
		"user-fallback-user",
	);

	assert.equal(
		resolveTempScopeId({
			env: {},
			getuid: () => 1234,
			userInfo: () => ({ username: "fallback-user" }),
		}),
		"uid-1234",
	);
});

test("resolveTempScopeId ignores inherited callback properties", () => {
	const inherited = {
		getuid: () => 9999,
		userInfo: () => ({ username: "inherited-user" }),
		homedir: () => "/inherited/home",
	};
	const options = Object.create(inherited);
	options.env = {};
	options.getuid = undefined;
	options.userInfo = undefined;
	options.homedir = undefined;

	assert.equal(resolveTempScopeId(options), "shared");
});
