package domain

import "io"

type FileChange struct {
	Path    string `json:"path"`
	Content string `json:"content,omitempty"`
	Delete  bool   `json:"delete,omitempty"`
}

type DeliveryRequest struct {
	RepairRunID    string       `json:"repairRunId"`
	InstallationID int64        `json:"installationId"`
	Repository     string       `json:"repository"`
	BaseCommit     string       `json:"baseCommit"`
	BaseBranch     string       `json:"baseBranch"`
	Title          string       `json:"title"`
	Body           string       `json:"body"`
	Changes        []FileChange `json:"changes"`
}

type Delivery struct {
	RepairRunID       string `json:"repairRunId"`
	Branch            string `json:"branch"`
	CommitSHA         string `json:"commitSha"`
	PullRequestNumber int    `json:"pullRequestNumber"`
	PullRequestURL    string `json:"pullRequestUrl"`
	Draft             bool   `json:"draft"`
}

type Archive struct {
	Body          io.ReadCloser
	ContentLength int64
	ContentType   string
}
