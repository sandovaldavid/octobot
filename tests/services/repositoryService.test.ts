import { describe, expect, it } from 'bun:test';
import { repositoryService } from '../../src/services/github/repositoryService';

describe('RepositoryService - mapRepositoryData', () => {
    it('debe mapear correctamente el payload de GitHub a la interfaz GithubRepository', () => {
        const mockRawRepo = {
            id: 998877,
            name: 'octobot',
            full_name: 'sandovaldavid/octobot',
            description: 'Discord Bot for GitHub integration',
            html_url: 'https://github.com/sandovaldavid/octobot',
            private: false,
            language: 'TypeScript',
            stargazers_count: 15,
            forks_count: 3,
            default_branch: 'main',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-02T00:00:00Z',
            topics: ['discord', 'bot', 'github'],
            owner: {
                login: 'sandovaldavid',
                id: 12345,
                type: 'User',
                avatar_url: 'https://avatars.githubusercontent.com/u/12345',
            },
        };

        const mapped = repositoryService.mapRepositoryData(mockRawRepo);

        expect(mapped.id).toBe(998877);
        expect(mapped.name).toBe('octobot');
        expect(mapped.full_name).toBe('sandovaldavid/octobot');
        expect(mapped.private).toBe(false);
        expect(mapped.language).toBe('TypeScript');
        expect(mapped.topics).toEqual(['discord', 'bot', 'github']);
        expect(mapped.owner.login).toBe('sandovaldavid');
    });

    it('debe asignar cadena vacía si description o topics son nulos/indefinidos', () => {
        const mockRawRepo = {
            id: 112233,
            name: 'minimal-repo',
            full_name: 'user/minimal-repo',
            description: null,
            html_url: 'https://github.com/user/minimal-repo',
            private: true,
            language: null,
            stargazers_count: 0,
            forks_count: 0,
            default_branch: 'master',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
            topics: null,
            owner: {
                login: 'user',
                id: 1,
                type: 'User',
                avatar_url: '',
            },
        };

        const mapped = repositoryService.mapRepositoryData(mockRawRepo);
        expect(mapped.description).toBe('');
        expect(mapped.topics).toEqual([]);
    });
});
