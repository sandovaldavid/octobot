// GitHub Validators
export const githubValidators = {
    isValidRepoUrl: (url: string): boolean => {
        const githubRepoPattern = /^https?:\/\/github\.com\/[\w-]+\/[\w.-]+$/;
        return githubRepoPattern.test(url);
    },

    isValidIssueNumber: (issueNumber: number): boolean => {
        return Number.isInteger(issueNumber) && issueNumber > 0;
    },

    isValidPRNumber: (prNumber: number): boolean => {
        return Number.isInteger(prNumber) && prNumber > 0;
    },

    isValidBranchName: (branchName: string): boolean => {
        const branchPattern = /^[\w.-]+$/;
        return branchPattern.test(branchName);
    },
};

// Discord Validators
export const discordValidators = {
    isValidChannelId: (channelId: string): boolean => {
        const channelPattern = /^\d{17,19}$/;
        return channelPattern.test(channelId);
    },

    isValidRole: (role: string): boolean => {
        const rolePattern = /^\d{17,19}$/;
        return rolePattern.test(role);
    },

    isValidCommand: (command: string): boolean => {
        const commandPattern = /^[a-zA-Z0-9-]+$/;
        return commandPattern.test(command);
    },
};

// Common Validators
export const commonValidators = {
    isValidUrl: (url: string): boolean => {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    isValidEmail: (email: string): boolean => {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailPattern.test(email);
    },
};
