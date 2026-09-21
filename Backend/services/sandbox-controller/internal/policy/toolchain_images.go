package policy

import "github.com/sre-agent/sandbox-controller/internal/application"

var _ application.ToolchainImageResolver = (*ToolchainImageResolverV1)(nil)

type ToolchainImageResolverV1 struct {
	images map[string]string
}

func NewToolchainImageResolverV1(images map[string]string) *ToolchainImageResolverV1 {
	copyOfImages := make(map[string]string, len(images))
	for toolchain, image := range images {
		copyOfImages[toolchain] = image
	}
	return &ToolchainImageResolverV1{images: copyOfImages}
}

func (policy *ToolchainImageResolverV1) Resolve(toolchain string) (string, bool) {
	image, ok := policy.images[toolchain]
	return image, ok
}
