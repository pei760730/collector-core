import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const workflow = readFileSync(new URL("../.github/workflows/consumer-bump.yml", import.meta.url), "utf8");
// Exercise the code actually embedded in the reusable workflow: checkout there is
// the consumer repository, so a helper script in collector-core cannot be used.
const match = workflow.match(/EXISTING=\$\(LATEST="\$LATEST" node <<'NODE'\n([\s\S]*?)^          NODE$/m);
assert.ok(match, "existing-PR recovery must run before the detection step skips creation");
const script = match[1]!.replace(/^          /gm, "");
const repo = "fixture/consumer";
const branch = "bump-core-v0.6.1";
const head = "a".repeat(40);

interface Run {
  databaseId: number;
  headSha: string;
  headBranch: string;
  workflow: string;
  status: string;
  conclusion?: string;
}

function fixture() {
  const state = {
    prs: [] as { number: number; headRefOid: string }[],
    runs: [] as Run[],
    calls: [] as string[][],
    failLookup: "",
    failDispatch: false,
    created: 0,
    dispatched: 0,
  };
  function gh(args: string[]): string {
    state.calls.push(args);
    const command = args.slice(0, 2).join(" ");
    const option = (name: string) => args[args.indexOf(name) + 1];
    assert.equal(option("--repo"), repo);
    if (command === state.failLookup) throw new Error("lookup unavailable");
    if (command === "pr create") {
      state.created += 1;
      state.prs.push({ number: 87, headRefOid: head });
      return "https://github.invalid/fixture/consumer/pull/87";
    }
    if (command === "pr list") {
      assert.equal(option("--head"), branch);
      assert.equal(option("--state"), "open");
      assert.equal(option("--json"), "number,headRefOid");
      return JSON.stringify(state.prs);
    }
    if (command === "run list") {
      assert.equal(option("--limit"), "1");
      // Filter as gh does, including an old SHA or unrelated workflow when a
      // corresponding filter is accidentally omitted from the actual code.
      const runs = state.runs.filter((run) =>
        (!args.includes("--commit") || run.headSha === option("--commit")) &&
        (!args.includes("--branch") || run.headBranch === option("--branch")) &&
        (!args.includes("--workflow") || run.workflow === option("--workflow")),
      );
      assert.equal(args.includes("--status"), false, "all pending/completed statuses suppress dispatch");
      return JSON.stringify(runs.slice(0, 1));
    }
    if (command === "workflow run") {
      assert.deepEqual(args, ["workflow", "run", "ci.yml", "--repo", repo, "--ref", branch]);
      if (state.failDispatch) throw new Error("dispatch unavailable");
      state.dispatched += 1;
      state.runs.push({ databaseId: state.dispatched, headSha: head, headBranch: branch, workflow: "ci.yml", status: "queued" });
      return "";
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  }
  function recover() {
    let output = "";
    runInNewContext(script, {
      require: (id: string) => {
        assert.equal(id, "node:child_process");
        return { execFileSync: (command: string, args: string[], options: { encoding: string }) => {
          assert.equal(command, "gh");
          assert.equal(options.encoding, "utf8");
          return gh(Array.from(args));
        } };
      },
      process: { env: { GITHUB_REPOSITORY: repo, LATEST: "0.6.1" }, stdout: { write: (text: string) => { output += text; } } },
      console: { error: () => {} },
    }, { timeout: 1000 });
    return output;
  }
  return { state, gh, recover };
}

describe("consumer-bump existing-PR CI recovery (offline gh mocks)", () => {
  it("keeps the new-PR path when no open bump PR exists", () => {
    const { state, recover } = fixture();
    assert.equal(recover(), "false");
    assert.equal(state.calls.length, 1);
    assert.equal(state.dispatched, 0);
  });

  it("recovers PR-create success / CI-dispatch failure once without a duplicate PR", () => {
    const { state, gh, recover } = fixture();
    // State left by the existing creation step when its final dispatch fails.
    gh(["pr", "create", "--repo", repo]);
    state.failDispatch = true;
    assert.throws(() => gh(["workflow", "run", "ci.yml", "--repo", repo, "--ref", branch]), /dispatch unavailable/);
    state.failDispatch = false;
    assert.equal(recover(), "true");
    assert.equal(state.dispatched, 1);
    assert.equal(recover(), "true");
    assert.equal(state.dispatched, 1);
    assert.equal(state.created, 1);
  });

  for (const [status, conclusion] of [
    ["queued", ""], ["in_progress", ""], ["pending", ""], ["waiting", ""],
    ["completed", "success"], ["completed", "failure"], ["completed", "cancelled"], ["completed", "skipped"],
  ]) {
    it(`does not redispatch an existing ${status}/${conclusion} run for the PR head`, () => {
      const { state, recover } = fixture();
      state.prs.push({ number: 87, headRefOid: head });
      state.runs.push({ databaseId: 1, headSha: head, headBranch: branch, workflow: "ci.yml", status: status!, conclusion: conclusion! });
      assert.equal(recover(), "true");
      assert.equal(state.dispatched, 0);
    });
  }

  for (const unrelated of [
    { headSha: "b".repeat(40) }, { headBranch: "another-branch" }, { workflow: "another.yml" },
  ]) {
    it(`does not mistake unrelated CI (${Object.keys(unrelated)[0]}) for the current PR's CI`, () => {
      const { state, recover } = fixture();
      state.prs.push({ number: 87, headRefOid: head });
      state.runs.push({ databaseId: 1, headSha: head, headBranch: branch, workflow: "ci.yml", status: "completed", ...unrelated });
      assert.equal(recover(), "true");
      assert.equal(state.dispatched, 1);
    });
  }

  for (const failed of ["pr list", "run list"]) {
    it(`fails closed when ${failed} fails`, () => {
      const { state, recover } = fixture();
      state.prs.push({ number: 87, headRefOid: head });
      state.failLookup = failed;
      assert.throws(recover, /lookup unavailable/);
      assert.equal(state.dispatched, 0);
    });
  }

  it("propagates another dispatch failure and makes only one attempt", () => {
    const { state, recover } = fixture();
    state.prs.push({ number: 87, headRefOid: head });
    state.failDispatch = true;
    assert.throws(recover, /dispatch unavailable/);
    assert.equal(state.calls.filter((args) => args[0] === "workflow").length, 1);
  });

  it("refuses a missing head SHA instead of making a broad run query", () => {
    const { state, recover } = fixture();
    state.prs.push({ number: 87, headRefOid: "" });
    assert.throws(recover, /Missing PR head SHA/);
    assert.equal(state.calls.length, 1);
  });
});
