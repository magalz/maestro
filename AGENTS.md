# Agent collaboration preferences

These user-approved preferences apply to future sessions in this repository.
Keep documentation in English.

Choose delegation and task size according to complexity. Handle small, tightly
coupled changes directly; delegate concrete, bounded implementation or review
work when it helps. Split complex changes into independently reviewable tasks,
with architecture decisions and final integration owned by the primary agent.

| Delegated work | Model | Reasoning effort |
| --- | --- | --- |
| Code generation and implementation | `gpt-5.6-luna` | `xhigh` |
| Code review | `gpt-5.6-sol` | `medium` |

Keep the primary session's model unchanged (currently Astra). The different
review model is intentional. This explicit user preference overrides skill
defaults that require reviewers to use the primary model's capability. When
overriding a subagent model, pass a self-contained task with `fork_turns: "none"`
or a supported bounded history fork; do not combine overrides with `"all"`.

Do not restart active agents merely to apply this policy. If a selected model is
unavailable or a task exceeds the delegated agent's capacity, report the issue
and let the primary agent resolve or repartition the work; do not silently switch
the configured delegated model or reasoning effort.
