# Obsidian Web Clipper Setup

Use this setup to keep incoming web captures organized in this vault.

## What this does

- Captures land in `00-Inbox/Web-Clips/YYYY-MM/domain-name/`
- File names include date + time + title to prevent duplicates
- Frontmatter stores source metadata for easier sorting/search

## Install and import

1. Install the extension: <https://github.com/obsidianmd/obsidian-clipper>
2. Open Web Clipper settings and go to Templates
3. Import [OrchWiz-Web-Clipper-Template.json](OrchWiz-Web-Clipper-Template.json)
4. Set it as your default clipping template

## Resulting folder layout

```text
OWZ-Vault/
  00-Inbox/
    Web-Clips/
      2026-02/
        github-com/
          2026-02-10-221530-obsidian-web-clipper.md
```

## Recommended weekly cleanup

1. Delete low-value clips from `00-Inbox/Web-Clips`
2. Move durable notes to long-lived folders (`01-Project-Overview`, `03-Technical`, etc.)
3. Add `[[wikilinks]]` from clipped notes to relevant project notes

## Advanced: automate triage with Obsidian API

If you want less manual cleanup, create a small Obsidian plugin that:

1. Scans `00-Inbox/Web-Clips/` on startup or command trigger
2. Reads frontmatter (`domain`, `tags`, `published`)
3. Moves notes to target folders based on rules (for example, docs vs research)
4. Adds/normalizes links or tags

References:

- [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- [Obsidian Plugin Docs](https://docs.obsidian.md/)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)

## Related Notes

- [[Links]]
- [[Templates]]
- [OrchWiz-Web-Clipper-Template.json](OrchWiz-Web-Clipper-Template.json)
