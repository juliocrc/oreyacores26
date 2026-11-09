"use strict";

const test = globalThis.test || require("node:test").test;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const workflow = name => YAML.parse(fs.readFileSync(path.join(__dirname, "../.github/workflows", name), "utf8"));

test("deployment only follows successful trusted main push CI, and checks out the tested SHA", () => {
  const deploy = workflow("deploy.yml");
  assert.equal(deploy.on.push, undefined);
  assert.deepEqual(deploy.on.workflow_run.workflows, [workflow("ci.yml").name]);
  assert.deepEqual(deploy.on.workflow_run.types, ["completed"]);
  assert.deepEqual(deploy.on.workflow_run.branches, ["main"]);
  const job = deploy.jobs["build-and-deploy"];
  for (const guard of [
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == 'main'",
    "github.event.workflow_run.head_repository.full_name == github.repository",
  ]) assert(job.if.includes(guard));
  assert.equal(job.steps.find(step => step.uses === "actions/checkout@v4").with.ref, "${{ github.event.workflow_run.head_sha }}");
  assert.equal(deploy.permissions.contents, "read");
});

test("CI enforces types, lint, build and unit tests without continue-on-error", () => {
  const steps = workflow("ci.yml").jobs["build-and-test"].steps;
  for (const command of ["npm run typecheck", "npx eslint src", "npm run build:vercel", "npm test"]) {
    const step = steps.find(step => step.run === command);
    assert(step, `Missing gate: ${command}`);
    assert(!step["continue-on-error"]);
  }
});
