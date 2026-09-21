package domain

type CreateSandboxInput struct {
	RepairRunID string `json:"repairRunId"`
	Toolchain   string `json:"toolchain"`
}

type ProvisionSandboxInput struct {
	RepairRunID string
	Image       string
}

type Sandbox struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Status    string `json:"status"`
}
