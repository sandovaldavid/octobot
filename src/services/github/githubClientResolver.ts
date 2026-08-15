import { App, Octokit } from 'octokit';

export interface GitHubClientResolverOptions {
    maxEntries?: number;
    idleTtlMs?: number;
}

interface CacheEntry {
    client: Octokit;
    lastUsedAt: number;
}

export interface IGitHubClientResolver {
    forInstallation(installationId: number): Promise<Octokit>;
    invalidate(installationId: number): void;
}

export class GitHubClientResolver implements IGitHubClientResolver {
    private readonly clients = new Map<number, CacheEntry>();
    private readonly maxEntries: number;
    private readonly idleTtlMs: number;

    constructor(
        private readonly app: App,
        options?: GitHubClientResolverOptions
    ) {
        this.maxEntries = options?.maxEntries ?? 500;
        this.idleTtlMs = options?.idleTtlMs ?? 60 * 60 * 1000;
    }

    async forInstallation(installationId: number): Promise<Octokit> {
        this.evictIdle();

        const existing = this.clients.get(installationId);
        if (existing) {
            existing.lastUsedAt = Date.now();
            return existing.client;
        }

        if (this.clients.size >= this.maxEntries) {
            this.evictOldest();
        }

        const client = (await this.app.getInstallationOctokit(installationId)) as unknown as Octokit;
        this.clients.set(installationId, {
            client,
            lastUsedAt: Date.now(),
        });

        return client;
    }

    invalidate(installationId: number): void {
        this.clients.delete(installationId);
    }

    private evictIdle(): void {
        const now = Date.now();
        for (const [id, entry] of this.clients.entries()) {
            if (now - entry.lastUsedAt > this.idleTtlMs) {
                this.clients.delete(id);
            }
        }
    }

    private evictOldest(): void {
        let oldestId: number | undefined;
        let oldestTime = Infinity;
        for (const [id, entry] of this.clients.entries()) {
            if (entry.lastUsedAt < oldestTime) {
                oldestTime = entry.lastUsedAt;
                oldestId = id;
            }
        }
        if (oldestId !== undefined) {
            this.clients.delete(oldestId);
        }
    }
}
