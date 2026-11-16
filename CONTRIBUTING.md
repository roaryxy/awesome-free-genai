# Contributing to Awesome Free GenAI

Thanks for your interest in contributing! This project is community-driven and we welcome additions of new generative AI agents, applications, and infrastructure that offer a **free tier**.

## How to Add a Tool

1. **Find the right category file** in the `data/` directory:
   - `coding-agents.yaml` — Autonomous coding & software engineering agents
   - `research-agents.yaml` — Research & information synthesis agents
   - `browser-agents.yaml` — Web browser automation agents
   - `general-purpose-agents.yaml` — Versatile multi-task agents
   - `voice-agents.yaml` — Real-time voice conversation agents
   - `workflow-agents.yaml` — Business workflow & automation agents
   - `fullstack-agents.yaml` — AI-powered full-stack app generation agents
   - `personal-assistants.yaml` — Cloud-hosted AI personal assistants across messaging platforms
   - `document-ai.yaml` — Document parsing, extraction, and classification platforms

2. **Add your entry** to the `agents` list in the appropriate YAML file. Follow this schema:

```yaml
- name: Tool Name
  url: https://example.com
  description: A short, one-sentence description of the tool.
  location: Country or "Open Source"
  free_tier: Description of the free tier offering.
```

3. **Submit a pull request** with your changes.

## Schema Reference

| Field         | Type       | Required | Description                                         |
|---------------|------------|----------|-----------------------------------------------------|
| `name`        | string     | Yes      | Name of the tool                                    |
| `url`         | string     | Yes      | URL to the tool's website or repo                   |
| `description` | string     | Yes      | One-sentence description (max ~120 chars)            |
| `location`    | string     | Yes      | Country where the company is based, or "Open Source"  |
| `free_tier`   | string     | Yes      | Brief description of the free tier or pricing model  |

## Adding a New Category

To create a new category, add a new YAML file in `data/` with the following structure:

```yaml
category: Category Name
icon: "🔧"
description: Short description of the category.

agents:
  - name: ...
    # (same schema as above)
```

Then add the filename stem to the `CATEGORY_ORDER` list in `scripts/build.py` to control its position.

## Guidelines

- **Free tier required.** Only tools that offer a meaningful free tier are accepted. Paid-only tools do not qualify.
- **No duplicates.** Check that the tool isn't already listed.
- **Generative AI entries only.** Entries must be generative AI agents, applications, or infrastructure. Standalone models or raw datasets do not qualify.
- **Active tools only.** The tool should be publicly available and actively maintained.
- **Neutral descriptions.** Avoid marketing language; be factual and concise.
- **Alphabetical order** within each category is preferred but not strictly required.

## How It Works

- The `README.md` and the frontend are **auto-generated** from the YAML data files and the Jinja2 template in `templates/README.md.j2`.
- A GitHub Actions workflow runs `scripts/build.py` on every push to `main` that changes `data/`, `site/`, `scripts/`, or `templates/`.
- **Do not edit `README.md` directly** — your changes will be overwritten. To change the README format, edit `templates/README.md.j2`.

## Local Development

```bash
# Install dependencies
pip install -r scripts/requirements.txt

# Run the build
python scripts/build.py

# Preview the site (from the dist/ directory)
cd dist && python -m http.server 8000
```

Then open http://localhost:8000 in your browser.
