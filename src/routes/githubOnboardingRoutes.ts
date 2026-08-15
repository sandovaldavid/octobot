import { Router, type Request, type Response } from 'express';
import { getGitHubAppConfig } from '../config/githubAppConfig';
import { createOnboardingController, type GitHubOnboardingController } from '../controllers/githubOnboardingController';
import { DiscordGuildConnectionModel } from '../models/discordGuildConnection';
import { GitHubConnectionAttemptModel } from '../models/githubConnectionAttempt';
import { GitHubInstallationModel } from '../models/githubInstallation';

export function createGitHubOnboardingRouter(controller?: GitHubOnboardingController): Router {
    const router = Router();
    let activeController = controller;

    const resolveController = (): GitHubOnboardingController => {
        if (!activeController) {
            activeController = createOnboardingController({
                appConfig: getGitHubAppConfig(),
                installationModel: GitHubInstallationModel,
                connectionModel: DiscordGuildConnectionModel,
                attemptModel: GitHubConnectionAttemptModel,
            });
        }
        return activeController;
    };

    router.get('/setup', (req: Request, res: Response) => resolveController().handleSetup(req, res));
    router.get('/callback', (req: Request, res: Response) => resolveController().handleCallback(req, res));

    return router;
}

export default createGitHubOnboardingRouter();
