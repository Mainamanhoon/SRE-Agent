# GitHub App service

This service is the sole GitHub mutation boundary. Internal callers authenticate with a bearer token; GitHub webhooks use `X-Hub-Signature-256`. A `GitHubGateway` interface separates application policy from the REST implementation and an `InstallationTokenProvider` isolates GitHub App JWT/token exchange.

It provides bounded source archives for isolated sandboxes and creates file blobs, a tree, a commit, a deterministic repair branch, and a draft pull request. A repeated `repairRunId` resolves the existing branch/PR instead of creating duplicates.

Required configuration: `GITHUB_APP_ID`, either `GITHUB_APP_PRIVATE_KEY_PEM` or `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_WEBHOOK_SECRET`, and `API_AUTH_TOKEN`.
