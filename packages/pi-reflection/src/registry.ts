import type {
	ReflectionProvider,
	ReflectionProviderSelection,
} from "./contracts.ts";

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validateProvider(provider: ReflectionProvider): void {
	if (!PROVIDER_ID_PATTERN.test(provider.id)) {
		throw new Error(
			"Reflection provider id must start with an alphanumeric character and contain only alphanumerics, dots, underscores, or hyphens",
		);
	}
	if (!Number.isSafeInteger(provider.priority)) {
		throw new Error("Reflection provider priority must be a safe integer");
	}
	if (
		typeof provider.isAvailable !== "function" ||
		typeof provider.isHostEligible !== "function" ||
		typeof provider.launch !== "function"
	) {
		throw new Error("Reflection provider is missing a required method");
	}
	if (provider.cancel !== undefined && typeof provider.cancel !== "function") {
		throw new Error("Reflection provider cancel must be a function");
	}
	if (provider.dispose !== undefined && typeof provider.dispose !== "function") {
		throw new Error("Reflection provider dispose must be a function");
	}
}

function hostEligible(provider: ReflectionProvider): boolean {
	try {
		return provider.isHostEligible();
	} catch {
		return false;
	}
}

function available(provider: ReflectionProvider): boolean {
	try {
		return provider.isAvailable();
	} catch {
		return false;
	}
}

function disposeProvider(provider: ReflectionProvider): void {
	try {
		provider.dispose?.();
	} catch {
		// Provider disposal is best effort at the extension boundary.
	}
}

type ProviderEntry = {
	provider: ReflectionProvider;
};

export class ReflectionProviderRegistry {
	readonly #providers = new Map<string, ProviderEntry>();
	#disposed = false;

	register(provider: ReflectionProvider): () => void {
		if (this.#disposed) {
			throw new Error("Reflection provider registry is disposed");
		}
		validateProvider(provider);
		const previous = this.#providers.get(provider.id)?.provider;
		const entry: ProviderEntry = { provider };
		this.#providers.set(provider.id, entry);
		if (previous && previous !== provider) disposeProvider(previous);
		return () => {
			if (this.#providers.get(provider.id) === entry) {
				this.#providers.delete(provider.id);
			}
		};
	}

	select(providerId?: string): ReflectionProviderSelection {
		if (providerId !== undefined) {
			const provider = this.#providers.get(providerId)?.provider;
			if (!provider || !available(provider)) return { status: "unavailable" };
			if (!hostEligible(provider)) return { status: "host_ineligible" };
			return { status: "selected", provider };
		}

		const providers = [...this.#providers.values()].map(({ provider }) => provider).sort(
			(left, right) =>
				right.priority - left.priority || left.id.localeCompare(right.id),
		);
		let hasAvailableProvider = false;
		for (const provider of providers) {
			if (!available(provider)) continue;
			hasAvailableProvider = true;
			if (!hostEligible(provider)) continue;
			return { status: "selected", provider };
		}
		return hasAvailableProvider
			? { status: "host_ineligible" }
			: { status: "unavailable" };
	}

	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		const providers = [...this.#providers.values()].map(({ provider }) => provider);
		this.#providers.clear();
		for (const provider of providers) disposeProvider(provider);
	}
}
