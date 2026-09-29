package domain

type WebhookDelivery struct {
	ID                string
	Event             string
	Action            string
	PayloadSHA256     string
	InstallationID    int64
	Repository        string
	RepairRunID       string
	PullRequestNumber int
	Merged            bool
	MergeCommit       string
	HeadCommitSHA     string
	ReviewState       string
	Attempt           int
}

type AcceptedWebhook struct {
	Delivery WebhookDelivery
	Created  bool
}

type RepairRunReference struct {
	ID                string
	IncidentID        string
	RepositoryOwner   string
	RepositoryName    string
	Status            string
	PullRequestNumber int
}

type RepairOutcomeEvent struct {
	RepairRunID    string
	EventType      string
	Stage          string
	Outcome        string
	Status         string
	IdempotencyKey string
	Metadata       map[string]any
}
