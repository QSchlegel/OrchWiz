# Note Templates

## Meeting Notes Template

```markdown
# Meeting Notes - YYYY-MM-DD

## Attendees
- Person 1
- Person 2

## Agenda
1. Topic 1
2. Topic 2

## Discussion
- Point 1
- Point 2

## Decisions
- Decision 1
- Decision 2

## Action Items
- [ ] Task 1 (Assignee: Name, Due: YYYY-MM-DD)
- [ ] Task 2 (Assignee: Name, Due: YYYY-MM-DD)

## Related Notes
- [[Note-Name]]
```

## Task Template

```markdown
# Task Name

## Status
- [ ] To Do
- [ ] In Progress
- [ ] Blocked
- [x] Completed

## Priority
High / Medium / Low

## Assignee
Name

## Due Date
YYYY-MM-DD

## Description
Detailed description of the task.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Related Notes
- [[Note-Name]]

## Dependencies
- Task X must be completed first
```

## Feature Documentation Template

```markdown
# Feature Name

## Overview
Brief description of the feature.

## Requirements
- Requirement 1
- Requirement 2

## Implementation
Details about how it's implemented.

## API Changes
- Endpoint 1
- Endpoint 2

## Database Changes
- Model changes
- Migration notes

## Testing
- Test case 1
- Test case 2

## Related Notes
- [[Note-Name]]
```

## Web Clipper Template (Obsidian)

Use [OrchWiz-Web-Clipper-Template.json](OrchWiz-Web-Clipper-Template.json) for importing a ready-made Obsidian Web Clipper template.

- Saves clips into `00-Inbox/Web-Clips/YYYY-MM/domain-name/`
- Uses timestamped file names to avoid collisions
- Adds source/frontmatter metadata for later sorting
