import { NormalizedGithubEvent } from './types';

export interface PolicyDecision {
    notify: boolean;
    reason?: string;
}

export class NotificationPolicy {
    static shouldNotify(event: NormalizedGithubEvent): PolicyDecision {
        switch (event.type) {
            case 'pull_request': {
                // Actionable PR states:
                // - opened: new PR created
                // - ready_for_review: draft converted to review-ready
                // - review_requested: reviewer explicitly requested
                // - reopened: reopened PR
                // - merged: merged into base branch
                const actionableActions = ['opened', 'ready_for_review', 'review_requested', 'reopened', 'merged'];

                if (actionableActions.includes(event.action)) {
                    return { notify: true };
                }

                return {
                    notify: false,
                    reason: `Filtered non-actionable pull_request action: "${event.action}"`,
                };
            }

            case 'pull_request_review': {
                // Actionable Review states:
                // - submitted + approved (PR approved)
                // - submitted + changes_requested (attention needed)
                if (event.action === 'submitted') {
                    if (event.reviewState === 'approved' || event.reviewState === 'changes_requested') {
                        return { notify: true };
                    }
                    return {
                        notify: false,
                        reason: `Filtered non-actionable review state: "${event.reviewState}"`,
                    };
                }

                return {
                    notify: false,
                    reason: `Filtered non-submitted review action: "${event.action}"`,
                };
            }

            case 'push':
            case 'issues':
            case 'release':
            case 'create':
            case 'delete':
                return { notify: true };

            case 'ping':
            case 'unsupported':
            default:
                return {
                    notify: false,
                    reason: `Non-notifiable event type: "${event.type}"`,
                };
        }
    }
}
