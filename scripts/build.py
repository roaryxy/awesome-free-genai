"""Build script for Awesome Free GenAI.

Reads all YAML data files from data/ and generates:
  - README.md at the repo root (rendered from templates/README.md.j2)
  - dist/data.json for the frontend
  - Crawlable static HTML pages for GitHub Pages
  - dist/sitemap.xml and dist/robots.txt
  - Copies site/ assets into dist/
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from html import escape as html_escape
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SITE_DIR = ROOT / "site"
DIST_DIR = ROOT / "dist"
TEMPLATE_DIR = ROOT / "templates"

SITE_URL = "https://roaryxy.github.io/awesome-free-genai"
BASE_PATH = "/awesome-free-genai"
SITE_NAME = "Awesome Free GenAI"
DEFAULT_DESCRIPTION = "A curated directory of generative AI tools with genuinely usable free tiers."

# Order in which categories appear (filename stems)
CATEGORY_ORDER = [
    "coding-agents",
    "research-agents",
    "browser-agents",
    "general-purpose-agents",
    "voice-agents",
    "workflow-agents",
    "sandbox-platforms",
    "fullstack-agents",
    "multimedia-generation",
    "personal-assistants",
]


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def classify_free_tier(free_tier: str) -> str:
    """Heuristically map a free_tier sentence to one of six canonical types."""
    if not free_tier:
        return "Free Plan"
    t = free_tier.lower()
    if "open source" in t or "open-source" in t or "mit license" in t or "apache" in t:
        return "Open Source"
    if "credit" in t:
        return "Free Credits"
    if "trial" in t:
        return "Free Trial"
    if "freemium" in t:
        return "Freemium"
    return "Free Plan"


def enrich_categories(categories: list[dict], stems: list[str]) -> list[dict]:
    """Add slug + per-agent slug & free_tier_type to each category dict."""
    enriched: list[dict] = []
    used_tool_slugs: set[str] = set()
    for cat, stem in zip(categories, stems):
        cat_slug = stem
        agents = []
        for agent in cat.get("agents", []) or []:
            a = dict(agent)
            base_slug = slugify(a.get("name", ""))
            unique_slug = base_slug
            if unique_slug in used_tool_slugs:
                unique_slug = f"{base_slug}-{cat_slug}"
                suffix = 2
                while unique_slug in used_tool_slugs:
                    unique_slug = f"{base_slug}-{cat_slug}-{suffix}"
                    suffix += 1
            used_tool_slugs.add(unique_slug)
            a["slug"] = unique_slug
            a["category_slug"] = cat_slug
            a["category"] = cat.get("category", "")
            a["free_tier_type"] = classify_free_tier(a.get("free_tier", "") or "")
            agents.append(a)
        enriched.append({
            **cat,
            "slug": cat_slug,
            "agents": agents,
        })
    return enriched


def load_data() -> tuple[list[dict], list[str]]:
    """Load all YAML data files in the defined category order.

    Returns (categories, stems) so downstream consumers can use the filename
    stem as the canonical category slug.
    """
    categories: list[dict] = []
    stems: list[str] = []
    seen: set[str] = set()
    for stem in CATEGORY_ORDER:
        path = DATA_DIR / f"{stem}.yaml"
        if not path.exists():
            print(f"Warning: {path} not found, skipping.")
            continue
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        categories.append(data)
        stems.append(stem)
        seen.add(stem)
    # Also pick up any YAML files not in the explicit order
    for path in sorted(DATA_DIR.glob("*.yaml")):
        if path.stem in seen:
            continue
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        categories.append(data)
        stems.append(path.stem)
    return categories, stems


def generate_readme(categories: list[dict]) -> str:
    """Generate the full README.md content from the Jinja2 template."""
    total_tools = sum(len(cat.get("agents", [])) for cat in categories)

    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        keep_trailing_newline=True,
        trim_blocks=False,
        lstrip_blocks=False,
    )

    template = env.get_template("README.md.j2")
    return template.render(
        categories=categories,
        total_tools=total_tools,
    )


def all_tools(categories: list[dict]) -> list[dict]:
    tools: list[dict] = []
    for cat in categories:
        for agent in cat.get("agents", []) or []:
            tools.append(agent)
    return tools


def route_url(path: str) -> str:
    if path == "/":
        return SITE_URL + "/"
    return SITE_URL + path.rstrip("/") + "/"


def route_output_path(path: str) -> Path:
    if path == "/":
        return DIST_DIR / "index.html"
    return DIST_DIR / path.strip("/") / "index.html"


def asset_prefix(path: str) -> str:
    if path == "/":
        return ""
    depth = len([part for part in path.strip("/").split("/") if part])
    return "../" * depth


def meta_for_route(path: str, categories: list[dict], tool_by_slug: dict[str, dict]) -> dict[str, str]:
    category_by_slug = {cat["slug"]: cat for cat in categories}
    if path == "/":
        return {
            "title": "Free AI Tools Directory | Awesome Free GenAI",
            "description": "Discover curated generative AI tools with genuinely usable free tiers. Browse free AI agents, coding tools, voice tools, research agents, multimedia generators, and more.",
        }
    if path == "/tools/":
        return {
            "title": "Browse Free AI Tools | Awesome Free GenAI",
            "description": "Browse a curated directory of generative AI tools with actually usable free plans, free credits, and open-source options.",
        }
    if path == "/submit/":
        return {
            "title": "Suggest a Free GenAI Tool | Awesome Free GenAI",
            "description": "Suggest a generative AI tool with a genuinely usable free tier for inclusion in the Awesome Free GenAI directory.",
        }
    if path == "/about/":
        return {
            "title": "About the Free AI Tools Directory | Awesome Free GenAI",
            "description": "Learn how Awesome Free GenAI curates generative AI tools with genuinely usable free tiers and community-maintained listings.",
        }
    if path.startswith("/category/"):
        slug = path.strip("/").split("/")[-1]
        cat = category_by_slug.get(slug, {})
        name = cat.get("category", "Free AI Tools")
        desc = cat.get("description") or f"Browse {name.lower()} with genuinely usable free tiers."
        return {
            "title": f"Free {name} | Awesome Free GenAI",
            "description": f"Browse {desc.rstrip('.')} with genuinely usable free tiers in the Awesome Free GenAI directory.",
        }
    if path.startswith("/tool/"):
        slug = path.strip("/").split("/")[-1]
        tool = tool_by_slug.get(slug, {})
        name = tool.get("name", "AI Tool")
        desc = tool.get("description") or f"See free-tier details for {name}."
        return {
            "title": f"{name} Free Tier, Features, and Alternatives | Awesome Free GenAI",
            "description": f"See {name} free-tier details, category, description, website link, and similar free AI tools curated by Awesome Free GenAI. {desc}",
        }
    return {"title": SITE_NAME, "description": DEFAULT_DESCRIPTION}


def json_script(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def website_schema(path: str, title: str, description: str) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": SITE_NAME,
        "url": route_url("/"),
        "description": description,
        "potentialAction": {
            "@type": "SearchAction",
            "target": route_url("/tools/") + "?q={search_term_string}",
            "query-input": "required name=search_term_string",
        },
    }


def breadcrumb_schema(path: str, label: str, category: dict | None = None) -> dict:
    items = [{"@type": "ListItem", "position": 1, "name": "Home", "item": route_url("/")}]
    if category:
        items.append({"@type": "ListItem", "position": 2, "name": category.get("category", "Category"), "item": route_url(f"/category/{category.get('slug')}/")})
        items.append({"@type": "ListItem", "position": 3, "name": label, "item": route_url(path)})
    elif path != "/":
        items.append({"@type": "ListItem", "position": 2, "name": label, "item": route_url(path)})
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}


def item_list_schema(path: str, name: str, items: list[tuple[str, str]]) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": name,
        "url": route_url(path),
        "itemListElement": [
            {"@type": "ListItem", "position": idx + 1, "name": item_name, "url": item_url}
            for idx, (item_name, item_url) in enumerate(items)
        ],
    }


def software_schema(tool: dict, category: dict | None) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": tool.get("name", ""),
        "applicationCategory": category.get("category", "AI tool") if category else "AI tool",
        "description": tool.get("description", ""),
        "url": tool.get("url", ""),
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
            "description": tool.get("free_tier", tool.get("free_tier_type", "Free tier")),
        },
    }


def render_static_content(path: str, categories: list[dict], tool_by_slug: dict[str, dict]) -> str:
    tools = all_tools(categories)
    category_by_slug = {cat["slug"]: cat for cat in categories}
    nav = (
        f'<nav><a href="{html_escape(BASE_PATH)}/">Home</a> '
        f'<a href="{html_escape(BASE_PATH)}/tools/">Browse tools</a> '
        f'<a href="{html_escape(BASE_PATH)}/about/">About</a> '
        f'<a href="{html_escape(BASE_PATH)}/submit/">Submit</a></nav>'
    )

    if path == "/":
        category_links = "".join(
            f'<li><a href="{html_escape(BASE_PATH)}/category/{html_escape(cat["slug"])}/">{html_escape(cat.get("category", ""))}</a> — {html_escape(cat.get("description", ""))}</li>'
            for cat in categories
        )
        tool_links = "".join(
            f'<li><a href="{html_escape(BASE_PATH)}/tool/{html_escape(tool["slug"])}/">{html_escape(tool.get("name", ""))}</a> — {html_escape(tool.get("description", ""))}</li>'
            for tool in tools[:24]
        )
        return f"""
        <header>{nav}<h1>Free generative AI, actually free.</h1><p>A hand-picked directory of generative AI tools with genuinely usable free tiers.</p></header>
        <main><section><h2>Browse free AI tool categories</h2><ul>{category_links}</ul></section><section><h2>Recently added free AI tools</h2><ul>{tool_links}</ul></section></main>
        """

    if path == "/tools/":
        tool_links = "".join(
            f'<li><a href="{html_escape(BASE_PATH)}/tool/{html_escape(tool["slug"])}/">{html_escape(tool.get("name", ""))}</a> — {html_escape(tool.get("description", ""))} <strong>{html_escape(tool.get("free_tier_type", "Free tier"))}</strong></li>'
            for tool in tools
        )
        return f"""
        <header>{nav}<h1>Browse all free AI tools</h1><p>Filter and explore generative AI tools with genuinely usable free tiers.</p></header>
        <main><ul>{tool_links}</ul></main>
        """

    if path.startswith("/category/"):
        slug = path.strip("/").split("/")[-1]
        cat = category_by_slug.get(slug)
        if not cat:
            return f"<header>{nav}<h1>Category not found</h1></header>"
        tool_links = "".join(
            f'<li><a href="{html_escape(BASE_PATH)}/tool/{html_escape(tool["slug"])}/">{html_escape(tool.get("name", ""))}</a> — {html_escape(tool.get("description", ""))}</li>'
            for tool in cat.get("agents", [])
        )
        return f"""
        <header>{nav}<h1>{html_escape(cat.get("category", "Free AI tools"))}</h1><p>{html_escape(cat.get("description", ""))}</p></header>
        <main><h2>Free tools in this category</h2><ul>{tool_links}</ul></main>
        """

    if path.startswith("/tool/"):
        slug = path.strip("/").split("/")[-1]
        tool = tool_by_slug.get(slug)
        if not tool:
            return f"<header>{nav}<h1>Tool not found</h1></header>"
        cat = category_by_slug.get(tool.get("category_slug", ""), {})
        return f"""
        <header>{nav}<p><a href="{html_escape(BASE_PATH)}/category/{html_escape(tool.get("category_slug", ""))}/">{html_escape(cat.get("category", "Category"))}</a></p><h1>{html_escape(tool.get("name", ""))}</h1><p>{html_escape(tool.get("description", ""))}</p></header>
        <main><section><h2>What is free?</h2><p>{html_escape(tool.get("free_tier", "Details to come."))}</p></section><section><h2>Tool details</h2><p><strong>Free-tier type:</strong> {html_escape(tool.get("free_tier_type", "Free tier"))}</p><p><strong>Location:</strong> {html_escape(tool.get("location", ""))}</p><p><a href="{html_escape(tool.get("url", ""))}">Visit {html_escape(tool.get("name", ""))}</a></p></section></main>
        """

    if path == "/about/":
        return f"<header>{nav}<h1>About Awesome Free GenAI</h1><p>A community-curated directory of generative AI tools with genuinely usable free tiers.</p></header>"
    if path == "/submit/":
        return f"<header>{nav}<h1>Suggest a free GenAI tool</h1><p>Help keep the directory fresh by suggesting a tool with a real free tier.</p></header>"
    return f"<header>{nav}<h1>{SITE_NAME}</h1></header>"


def schema_for_route(path: str, meta: dict[str, str], categories: list[dict], tool_by_slug: dict[str, dict]) -> list[dict]:
    category_by_slug = {cat["slug"]: cat for cat in categories}
    tools = all_tools(categories)
    schemas: list[dict] = []
    if path == "/":
        schemas.append(website_schema(path, meta["title"], meta["description"]))
        schemas.append(item_list_schema(path, "Free AI tool categories", [(cat.get("category", ""), route_url(f"/category/{cat['slug']}/")) for cat in categories]))
    elif path == "/tools/":
        schemas.append(breadcrumb_schema(path, "Browse free AI tools"))
        schemas.append(item_list_schema(path, "Free AI tools", [(tool.get("name", ""), route_url(f"/tool/{tool['slug']}/")) for tool in tools]))
    elif path.startswith("/category/"):
        slug = path.strip("/").split("/")[-1]
        cat = category_by_slug.get(slug)
        if cat:
            schemas.append(breadcrumb_schema(path, cat.get("category", "Category")))
            schemas.append(item_list_schema(path, cat.get("category", "Free AI tools"), [(tool.get("name", ""), route_url(f"/tool/{tool['slug']}/")) for tool in cat.get("agents", [])]))
    elif path.startswith("/tool/"):
        slug = path.strip("/").split("/")[-1]
        tool = tool_by_slug.get(slug)
        if tool:
            cat = category_by_slug.get(tool.get("category_slug", ""))
            schemas.append(breadcrumb_schema(path, tool.get("name", "AI tool"), cat))
            schemas.append(software_schema(tool, cat))
    else:
        schemas.append(breadcrumb_schema(path, meta["title"].split("|")[0].strip()))
    return schemas


def render_html_page(path: str, categories: list[dict], tool_by_slug: dict[str, dict]) -> str:
    prefix = asset_prefix(path)
    meta = meta_for_route(path, categories, tool_by_slug)
    canonical = route_url(path)
    static_content = render_static_content(path, categories, tool_by_slug)
    schemas = schema_for_route(path, meta, categories, tool_by_slug)
    schema_tags = "\n".join(f'<script type="application/ld+json">{json_script(schema)}</script>' for schema in schemas)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{html_escape(meta["title"])}</title>
  <meta name="description" content="{html_escape(meta["description"], quote=True)}">
  <link rel="canonical" href="{html_escape(canonical, quote=True)}">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="{html_escape(SITE_NAME, quote=True)}">
  <meta property="og:title" content="{html_escape(meta["title"], quote=True)}">
  <meta property="og:description" content="{html_escape(meta["description"], quote=True)}">
  <meta property="og:url" content="{html_escape(canonical, quote=True)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="{html_escape(meta["title"], quote=True)}">
  <meta name="twitter:description" content="{html_escape(meta["description"], quote=True)}">

  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='5' fill='%23111'/%3E%3Cpath d='M12 4 L13.4 10.6 L20 12 L13.4 13.4 L12 20 L10.6 13.4 L4 12 L10.6 10.6 Z' fill='white'/%3E%3C/svg%3E">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="{prefix}style.css">
  {schema_tags}

  <script>
    window.AFG_BASE_PATH = "{BASE_PATH}";
    window.AFG_ASSET_PREFIX = "{prefix}";
    (function () {{
      try {{
        var saved = localStorage.getItem("afg-theme");
        var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var theme = saved || (prefersDark ? "dark" : "light");
        if (theme === "dark") document.documentElement.classList.add("dark");
      }} catch (e) {{}}
    }})();
  </script>
</head>
<body>
  <div id="app">{static_content}</div>
  <script src="{prefix}app.js"></script>
</body>
</html>
"""


def generate_routes(categories: list[dict]) -> list[str]:
    routes = ["/", "/tools/", "/submit/", "/about/"]
    for cat in categories:
        routes.append(f"/category/{cat['slug']}/")
    for tool in all_tools(categories):
        routes.append(f"/tool/{tool['slug']}/")
    return routes


def write_sitemap(routes: list[str]) -> None:
    urls = "\n".join(
        f"  <url>\n    <loc>{html_escape(route_url(route))}</loc>\n  </url>" for route in routes
    )
    (DIST_DIR / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n',
        encoding="utf-8",
    )


def write_robots() -> None:
    (DIST_DIR / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n",
        encoding="utf-8",
    )


def build_dist(categories: list[dict]) -> None:
    """Build the dist/ directory with frontend assets, data.json, static pages, and SEO files."""
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    DIST_DIR.mkdir(parents=True)

    # Copy site assets except index.html; every route gets a generated HTML file.
    if SITE_DIR.exists():
        for item in SITE_DIR.iterdir():
            if item.is_file() and item.name != "index.html":
                shutil.copy2(item, DIST_DIR / item.name)

    # Write combined data as JSON.
    with open(DIST_DIR / "data.json", "w", encoding="utf-8") as f:
        json.dump(categories, f, indent=2, ensure_ascii=False)

    tools = all_tools(categories)
    tool_by_slug = {tool["slug"]: tool for tool in tools}
    routes = generate_routes(categories)
    for route in routes:
        out = route_output_path(route)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(render_html_page(route, categories, tool_by_slug), encoding="utf-8")

    write_sitemap(routes)
    write_robots()


def main() -> None:
    print("Loading YAML data files...")
    categories, stems = load_data()

    if not categories:
        print("Error: No data files found in data/", file=sys.stderr)
        sys.exit(1)

    total = sum(len(c.get("agents", [])) for c in categories)
    print(f"Found {len(categories)} categories with {total} tools total.")

    print("Generating README.md...")
    readme = generate_readme(categories)
    (ROOT / "README.md").write_text(readme, encoding="utf-8")

    print("Enriching data for the SPA...")
    enriched = enrich_categories(categories, stems)

    print("Building dist/...")
    build_dist(enriched)

    print("Done!")


if __name__ == "__main__":
    main()
