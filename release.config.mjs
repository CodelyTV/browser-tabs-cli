export const commitOptions = {
  preset: "conventionalcommits",
  releaseRules: [
    { breaking: true, release: "major" },
    { type: "feat", release: "minor" },
    { type: "*", release: "patch" },
  ],
};

export default {
  branches: ["main"],
  plugins: [
    ["@semantic-release/commit-analyzer", commitOptions],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        presetConfig: {
          types: [
            { type: "feat", section: "Features" },
            { type: "fix", section: "Fixes" },
            { type: "perf", section: "Performance" },
            { type: "docs", section: "Documentation" },
            { type: "refactor", section: "Refactoring" },
            { type: "build", section: "Build and dependencies" },
            { type: "ci", section: "Continuous integration" },
            { type: "test", section: "Tests" },
            { type: "style", section: "Formatting" },
            { type: "chore", section: "Maintenance" },
            { type: "revert", section: "Reverts" },
          ],
        },
      },
    ],
    "@semantic-release/npm",
    [
      "@semantic-release/github",
      {
        successCommentCondition: false,
        failCommentCondition: false,
        releasedLabels: false,
      },
    ],
  ],
};
