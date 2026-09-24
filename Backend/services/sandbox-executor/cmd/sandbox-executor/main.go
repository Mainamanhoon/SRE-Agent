package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	maxArchiveBytes = 200 << 20
	maxOutputBytes  = 1 << 20
)

type task struct {
	SourceArchiveURL    string   `json:"sourceArchiveUrl"`
	ExpectedCommit      string   `json:"expectedCommit"`
	Changes             []change `json:"changes"`
	VerificationProfile string   `json:"verificationProfile"`
}

type change struct {
	Path    string `json:"path"`
	Content string `json:"content,omitempty"`
	Delete  bool   `json:"delete,omitempty"`
}

type result struct {
	Status         string   `json:"status"`
	ExpectedCommit string   `json:"expectedCommit"`
	ChangedPaths   []string `json:"changedPaths"`
	Checks         []check  `json:"checks"`
	Reason         string   `json:"reason,omitempty"`
}

type check struct {
	Name       string `json:"name"`
	Successful bool   `json:"successful"`
	Output     string `json:"output"`
}

func main() {
	taskPath := flag.String("task", "/var/run/sre-agent/task.json", "immutable repair task")
	workspace := flag.String("workspace", "/workspace", "ephemeral workspace")
	flag.Parse()

	output := result{Status: "failed"}
	if err := run(*taskPath, *workspace, &output); err != nil {
		output.Reason = err.Error()
		writeResult(output)
		os.Exit(1)
	}
	output.Status = "succeeded"
	writeResult(output)
}

func run(taskPath, workspace string, output *result) error {
	payload, err := os.ReadFile(taskPath)
	if err != nil {
		return fmt.Errorf("read task: %w", err)
	}
	var repairTask task
	decoder := json.NewDecoder(strings.NewReader(string(payload)))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&repairTask); err != nil {
		return fmt.Errorf("decode task: %w", err)
	}
	output.ExpectedCommit = repairTask.ExpectedCommit

	if err = os.MkdirAll(workspace, 0o700); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	if err = fetchAndExtract(ctx, repairTask.SourceArchiveURL, workspace, os.Getenv("SOURCE_AUTH_TOKEN")); err != nil {
		return err
	}
	repositoryRoot, err := repositoryRoot(workspace)
	if err != nil {
		return err
	}
	for _, proposed := range repairTask.Changes {
		if err = applyChange(repositoryRoot, proposed); err != nil {
			return err
		}
		output.ChangedPaths = append(output.ChangedPaths, proposed.Path)
	}
	checks, err := verify(ctx, repositoryRoot, repairTask.VerificationProfile)
	output.Checks = checks
	return err
}

func fetchAndExtract(ctx context.Context, archiveURL, workspace, token string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, archiveURL, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/gzip")
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response, err := (&http.Client{Timeout: 2 * time.Minute}).Do(request)
	if err != nil {
		return fmt.Errorf("download source archive: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("source archive returned status %d", response.StatusCode)
	}
	if response.ContentLength > maxArchiveBytes {
		return errors.New("source archive exceeds size limit")
	}
	limited := &io.LimitedReader{R: response.Body, N: maxArchiveBytes + 1}
	gzipReader, err := gzip.NewReader(limited)
	if err != nil {
		return fmt.Errorf("read source archive: %w", err)
	}
	defer gzipReader.Close()
	reader := tar.NewReader(gzipReader)
	for {
		header, nextErr := reader.Next()
		if errors.Is(nextErr, io.EOF) {
			break
		}
		if nextErr != nil {
			return fmt.Errorf("extract source archive: %w", nextErr)
		}
		if header.Size < 0 || header.Size > 20<<20 {
			return errors.New("archive entry exceeds size limit")
		}
		target, safe := safeJoin(workspace, header.Name)
		if !safe {
			return errors.New("archive contains an unsafe path")
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err = os.MkdirAll(target, 0o700); err != nil {
				return err
			}
		case tar.TypeReg, tar.TypeRegA:
			if err = os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
				return err
			}
			file, createErr := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
			if createErr != nil {
				return createErr
			}
			_, copyErr := io.CopyN(file, reader, header.Size)
			closeErr := file.Close()
			if copyErr != nil {
				return copyErr
			}
			if closeErr != nil {
				return closeErr
			}
		default:
			return fmt.Errorf("archive entry type %d is not allowed", header.Typeflag)
		}
	}
	if limited.N <= 0 {
		return errors.New("source archive exceeds size limit")
	}
	return nil
}

func repositoryRoot(workspace string) (string, error) {
	entries, err := os.ReadDir(workspace)
	if err != nil {
		return "", err
	}
	if len(entries) == 1 && entries[0].IsDir() {
		return filepath.Join(workspace, entries[0].Name()), nil
	}
	if len(entries) == 0 {
		return "", errors.New("source archive is empty")
	}
	return workspace, nil
}

func applyChange(root string, proposed change) error {
	target, safe := safeJoin(root, proposed.Path)
	if !safe {
		return errors.New("change contains an unsafe path")
	}
	if proposed.Delete {
		info, err := os.Lstat(target)
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return errors.New("only regular files can be deleted")
		}
		return os.Remove(target)
	}
	if err := rejectSymlinkParents(root, target); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return err
	}
	return os.WriteFile(target, []byte(proposed.Content), 0o600)
}

func safeJoin(root, name string) (string, bool) {
	if name == "" || filepath.IsAbs(name) {
		return "", false
	}
	clean := filepath.Clean(filepath.FromSlash(name))
	if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", false
	}
	target := filepath.Join(root, clean)
	relative, err := filepath.Rel(root, target)
	return target, err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func rejectSymlinkParents(root, target string) error {
	current := filepath.Dir(target)
	for current != root && current != filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err == nil && info.Mode()&os.ModeSymlink != 0 {
			return errors.New("change path traverses a symlink")
		}
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		current = filepath.Dir(current)
	}
	return nil
}

func verify(ctx context.Context, root, profile string) ([]check, error) {
	commands := [][]string{}
	switch profile {
	case "go":
		commands = append(commands, []string{"go", "mod", "download"}, []string{"go", "test", "-mod=readonly", "./..."})
	case "node":
		payload, err := os.ReadFile(filepath.Join(root, "package.json"))
		if err != nil {
			return nil, errors.New("node profile requires package.json")
		}
		var manifest struct {
			Scripts map[string]string `json:"scripts"`
		}
		if json.Unmarshal(payload, &manifest) != nil {
			return nil, errors.New("invalid package.json")
		}
		commands = append(commands, []string{"corepack", "pnpm", "install", "--frozen-lockfile", "--ignore-scripts"})
		for _, name := range []string{"test", "typecheck", "build"} {
			if manifest.Scripts[name] != "" {
				commands = append(commands, []string{"corepack", "pnpm", "run", name})
			}
		}
		if len(commands) == 1 {
			return nil, errors.New("node project has no approved verification scripts")
		}
	default:
		return nil, errors.New("unsupported verification profile")
	}
	checks := make([]check, 0, len(commands))
	for _, args := range commands {
		command := exec.CommandContext(ctx, args[0], args[1:]...)
		command.Dir = root
		buffer := &boundedBuffer{remaining: maxOutputBytes}
		command.Stdout, command.Stderr = buffer, buffer
		err := command.Run()
		item := check{Name: strings.Join(args, " "), Successful: err == nil, Output: buffer.String()}
		checks = append(checks, item)
		if err != nil {
			return checks, fmt.Errorf("verification %q failed", item.Name)
		}
	}
	return checks, nil
}

type boundedBuffer struct {
	bytes     []byte
	remaining int
}

func (buffer *boundedBuffer) Write(value []byte) (int, error) {
	original := len(value)
	if len(value) > buffer.remaining {
		value = value[:buffer.remaining]
	}
	buffer.bytes = append(buffer.bytes, value...)
	buffer.remaining -= len(value)
	return original, nil
}
func (buffer *boundedBuffer) String() string { return string(buffer.bytes) }

func writeResult(value result) {
	payload, _ := json.Marshal(value)
	fmt.Printf("SRE_AGENT_RESULT=%s\n", payload)
}
