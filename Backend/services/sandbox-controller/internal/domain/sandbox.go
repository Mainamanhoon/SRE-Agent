package domain

type CreateSandboxInput struct {
	RepairRunID         string          `json:"repairRunId"`
	Toolchain           string          `json:"toolchain"`
	SourceArchiveURL    string          `json:"sourceArchiveUrl"`
	ExpectedCommit      string          `json:"expectedCommit"`
	Changes             []SandboxChange `json:"changes"`
	VerificationProfile string          `json:"verificationProfile"`
}

type SandboxChange struct {
	Path    string `json:"path"`
	Content string `json:"content,omitempty"`
	Delete  bool   `json:"delete,omitempty"`
}

type ProvisionSandboxInput struct {
	RepairRunID         string
	Image               string
	Toolchain           string
	SourceArchiveURL    string
	ExpectedCommit      string
	Changes             []SandboxChange
	VerificationProfile string
}

type Sandbox struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	Status      string `json:"status"`
	Reason      string `json:"reason,omitempty"`
	RepairRunID string `json:"repairRunId"`
	Toolchain   string `json:"toolchain,omitempty"`
	StartedAt   string `json:"startedAt,omitempty"`
	CompletedAt string `json:"completedAt,omitempty"`
}

type VerificationCheck struct {
	Name       string `json:"name"`
	Successful bool   `json:"successful"`
	Output     string `json:"output"`
}

type SandboxExecutionResult struct {
	Status         string              `json:"status"`
	ExpectedCommit string              `json:"expectedCommit"`
	ChangedPaths   []string            `json:"changedPaths"`
	Checks         []VerificationCheck `json:"checks"`
	Reason         string              `json:"reason,omitempty"`
}
