package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSafeJoinRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	if _, ok := safeJoin(root, "../escape"); ok {
		t.Fatal("expected traversal to be rejected")
	}
	if target, ok := safeJoin(root, "src/app.ts"); !ok || target != filepath.Join(root, "src", "app.ts") {
		t.Fatalf("unexpected safe path %q", target)
	}
}

func TestApplyChangeWritesAndDeletesRegularFile(t *testing.T) {
	root := t.TempDir()
	if err := applyChange(root, change{Path: "src/app.ts", Content: "fixed"}); err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(filepath.Join(root, "src", "app.ts"))
	if err != nil || string(payload) != "fixed" {
		t.Fatalf("unexpected payload %q: %v", payload, err)
	}
	if err = applyChange(root, change{Path: "src/app.ts", Delete: true}); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(root, "src", "app.ts")); !os.IsNotExist(err) {
		t.Fatal("expected file to be deleted")
	}
}
